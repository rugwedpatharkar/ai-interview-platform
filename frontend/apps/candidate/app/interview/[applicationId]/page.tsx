"use client";

import { Alert, ApIcon, Logo } from "@ip/ui";
import {
  Code,
  ConnectError,
  startProctoring,
  track,
  useRequireAuth,
} from "@ip/shared";
import { ArrowLeft, Captions, CaptionsOff, Lock } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "../../../lib/auth";
import { DevicePrecheck } from "../../../components/device-precheck";
import {
  InterviewCaptions,
  type CaptionLine,
} from "../../../components/interview-captions";
import { connectRoom, makeFakeRoom, type InterviewRoom } from "./rtc-room";
import { startAudioDetector } from "./proctor-audio";
import { startVisionDetector } from "./proctor-vision";
import {
  HIGH_SEVERITY,
  severityOf,
  type ProctorSignal,
} from "./types";

// Offline/build-against-fake mode: a canvas self-view + fake room + scripted captions, and
// real fullscreen is skipped so the room runs end-to-end without a camera or RTC server.
const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

const HIGH = new Set<string>(HIGH_SEVERITY);

// A cancelled RPC (component unmount aborts the controller) surfaces as ConnectError Canceled
// — not a real failure, so it's swallowed like a fetch AbortError.
function isAborted(err: unknown): boolean {
  return (
    (err instanceof ConnectError && err.code === Code.Canceled) ||
    (err instanceof Error && err.name === "AbortError")
  );
}

// FAILED_PRECONDITION means the interview isn't startable in its funnel state (already
// completed / not yet reachable) — there's no resume, so retrying can't help.
function isSessionEnded(err: unknown): boolean {
  return err instanceof ConnectError && err.code === Code.FailedPrecondition;
}

// HUD chip status mirror — driven entirely by detector signals. Pure UI; no enforcement.
interface ChipState {
  face: "good" | "warn";
  gaze: "good" | "warn";
  mic: "good" | "warn";
  integrity: number; // 0–100 optimistic score derived from non-low signal count
}

/**
 * Strict proctored room.
 *
 * INVARIANTS (do not relax):
 *   1. Camera + microphone are required and stay enabled for the entire session — once tracks
 *      are acquired, they remain published until the room disconnects. No track-disable control
 *      is exposed anywhere in this tree.
 *   2. Fullscreen-locked for the session (skipped in MOCK so offline build still works).
 *   3. On-device detectors only — only typed signals leave the browser via the gRPC sink.
 *   4. Server-authoritative auto-end on HIGH severity. The client mirrors the ack via
 *      `ProctorAck.terminated` — it never decides termination itself.
 *   5. Controls in the room are EXACTLY two: captions toggle + End interview. Nothing else.
 */
export default function InterviewPage() {
  const router = useRouter();
  const { token, ready, api } = useAuth();
  useRequireAuth(token, ready);
  const { applicationId } = useParams<{ applicationId: string }>();

  const [phase, setPhase] = useState<"precheck" | "live" | "ended">("precheck");
  const [endReason, setEndReason] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [captions, setCaptions] = useState<CaptionLine[]>([]);
  const [chips, setChips] = useState<ChipState>({
    face: "good",
    gaze: "good",
    mic: "good",
    integrity: 100,
  });
  const [recentFlag, setRecentFlag] = useState<{
    type: string;
    severity: "low" | "medium" | "high";
  } | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const room = useRef<InterviewRoom | null>(null);
  const detach = useRef<Array<() => void>>([]);
  // The self-view <video> only mounts once phase flips to "live" — but onReady
  // assigns srcObject BEFORE calling setPhase("live"), so a plain useRef points
  // at null and the tile stays black for the whole session. Stash the stream on
  // a ref and use a callback ref that assigns srcObject the moment the element
  // mounts (or drops off).
  const localStream = useRef<MediaStream | null>(null);
  const attachSelfView = useCallback((el: HTMLVideoElement | null) => {
    if (!el) return;
    if (localStream.current) {
      el.srcObject = localStream.current;
      // Local playback volume 0 — silences the local <video> only, never
      // touches the published audio track.
      el.volume = 0;
    }
  }, []);
  // Synchronous latch so a StrictMode double-invoke / double Start can't double-connect.
  const starting = useRef(false);

  // End the session: detach every detector, disconnect the room, leave fullscreen, route
  // to the post-interview screen. The room never DISABLES tracks mid-session — disconnect
  // is the only path that releases the camera + mic (so the invariant holds).
  const endSession = useCallback(
    (reason: string) => {
      track("interview.completed", { application_id: applicationId, end_reason: reason });
      setEndReason(reason);
      detach.current.forEach((d) => d());
      detach.current = [];
      void room.current?.disconnect();
      room.current = null;
      if (typeof document !== "undefined" && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
      setPhase("ended");
      const target = `/interview/${applicationId}/done`;
      router.push(reason === "ended_by_candidate" ? target : `${target}?reason=auto_terminated`);
    },
    [applicationId, router],
  );

  // Proctor sink: every detector emits here. Maps typed signals to the gRPC ProctorEvent shape
  // and records them. The server stamps severity and (per the auto-gate delta) may terminate;
  // the client reflects that via the ack. HIGH_SEVERITY drives optimistic UI ONLY — the server
  // stays authoritative for the actual terminate.
  const sink = useCallback(
    async (events: ProctorSignal[], keepalive?: boolean) => {
      // Update HUD chips optimistically from signals (purely visual; no enforcement).
      for (const e of events) {
        const sev = severityOf(e.type);
        if (e.type === "second_face") setChips((c) => ({ ...c, face: "warn" }));
        if (e.type === "gaze_off_screen" || e.type === "head_turned_away") {
          setChips((c) => ({ ...c, gaze: "warn" }));
        }
        if (e.type === "second_voice" || e.type === "synthetic_audio_suspected") {
          setChips((c) => ({ ...c, mic: "warn" }));
        }
        if (sev !== "low") {
          setChips((c) => ({ ...c, integrity: Math.max(0, c.integrity - (sev === "high" ? 12 : 3)) }));
          setRecentFlag({ type: e.type, severity: sev });
        }
      }
      try {
        const res = await api.interview.recordProctorEvents({
          applicationId,
          events: events.map((e) => ({
            type: e.type,
            at: e.at,
            metaJson: e.meta ? JSON.stringify(e.meta) : "",
          })),
        });
        if (!keepalive && res.terminated) {
          endSession(res.reason || "integrity");
        }
      } catch (err) {
        if (err instanceof ConnectError && err.code === Code.InvalidArgument) return;
        throw err;
      }
    },
    [api, applicationId, endSession],
  );

  async function onReady(media: MediaStream) {
    if (starting.current) return;
    starting.current = true;
    setError(null);
    try {
      if (!MOCK) {
        await document.documentElement.requestFullscreen().catch(() => {});
      }
      const tok = await api.interview.rtcToken({ applicationId });
      const r = MOCK ? makeFakeRoom(media) : await connectRoom(tok, media);
      room.current = r;
      r.onCaption((text, final) =>
        setCaptions((c) => [...c, { text, final }]),
      );

      // Wire the self-view tile to the live local stream — the callback ref
      // (attachSelfView above) will assign srcObject as soon as the <video>
      // element mounts once phase flips to "live".
      localStream.current = media;

      // Device/behavior runtime (shipped) + on-device vision + audio → one sink.
      detach.current.push(startProctoring({ send: sink }));
      const emitSignal = (
        t: ProctorSignal["type"],
        m?: Record<string, unknown>,
      ): void => void sink([{ type: t, at: new Date().toISOString(), meta: m }], false);
      const videoTrack = media.getVideoTracks()[0];
      const audioTrack = media.getAudioTracks()[0];
      if (videoTrack) {
        detach.current.push(await startVisionDetector(videoTrack, emitSignal));
      }
      if (audioTrack) {
        detach.current.push(await startAudioDetector(audioTrack, emitSignal));
      }
      track("interview.started", { application_id: applicationId });
      setPhase("live");
    } catch (err) {
      starting.current = false;
      if (isAborted(err)) return;
      if (err instanceof ConnectError && err.code === Code.Unavailable) {
        setUnavailable(true);
        void room.current?.disconnect();
        room.current = null;
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
        return;
      }
      if (isSessionEnded(err)) {
        endSession("session_ended");
        return;
      }
      setError(err instanceof Error ? err.message : "Could not start the interview.");
      void room.current?.disconnect();
      room.current = null;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    }
  }

  // Live timer for the HUD top-right. mm:ss; advances only while live.
  useEffect(() => {
    if (phase !== "live") return;
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  // Tear everything down on unmount so a stalled detector/room never leaks past the page.
  useEffect(() => {
    return () => {
      detach.current.forEach((d) => d());
      void room.current?.disconnect();
    };
  }, []);

  // Move focus to the new phase's heading on each transition so screen-reader + keyboard
  // users land on the live/ended state instead of being stranded at the top of the page.
  const phaseHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    phaseHeadingRef.current?.focus();
  }, [phase]);

  if (!token) return null;

  return (
    <main className="min-h-screen bg-background">
      {/* Focused room top bar — Aptura mark + theme toggle. No sidebar. */}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
          <Link href="/" aria-label="Aptura home" className="flex">
            <Logo size="sm" />
          </Link>
          <span className="font-mono text-[0.74rem] uppercase tracking-[0.1em] text-ink-3">
            Interview · proctored
          </span>
          {phase === "live" && (
            <span className="ap-status ap-status--live ml-2 text-[0.78rem]">
              <span className="ap-dot" /> Live
            </span>
          )}
          {phase === "precheck" && (
            <Link
              href={`/interview/${applicationId}/lobby`}
              className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink-deep hover:underline"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back to lobby
            </Link>
          )}
        </div>
      </header>

      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
        <h1 ref={phaseHeadingRef} tabIndex={-1} className="ap-h3 focus:outline-none">
          {phase === "live" ? "Interview in progress" : phase === "ended" ? "Interview ended" : "Final pre-check"}
        </h1>

        {unavailable && (
          <Alert tone="warning" title="Live interview not available right now">
            <span className="flex flex-col items-start gap-3">
              The proctored interview can&apos;t be started at the moment. Please try again
              shortly, or check your tracker for an update.
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-deep underline-offset-4 hover:underline"
              >
                <ArrowLeft className="size-4" aria-hidden />
                Back to applications
              </Link>
            </span>
          </Alert>
        )}

        {error && !unavailable && (
          <Alert tone="danger">
            <span className="flex flex-col items-start gap-3">
              {error}
              <button onClick={() => setError(null)} className="ap-btn ap-btn-ghost ap-btn-sm">
                Dismiss
              </button>
            </span>
          </Alert>
        )}

        {phase === "precheck" && !unavailable && (
          <DevicePrecheck onReady={onReady} mock={MOCK} />
        )}

        {phase === "live" && (
          <>
            <div className="ap-hud" aria-label="Live proctored interview">
              <div className="ap-hud-topbar">
                <span className="ap-hud-title">Iris · AI Interviewer</span>
                <span className="ap-hud-meta">· this session is recorded</span>
                <span className="ml-auto ap-hud-lock">
                  <Lock /> Fullscreen locked · camera & mic on for the session
                </span>
              </div>
              <div className="ap-hud-stage">
                <span className="ap-hud-interviewer">
                  <span className="ap-dot" /> Iris · speaking
                </span>
                <span
                  role="timer"
                  aria-label={`Interview elapsed: ${formatElapsed(elapsed)}`}
                  className="ap-hud-timer"
                >
                  {formatElapsed(elapsed)}
                </span>
                {/* Self-view tile — fed by the LIVE local stream; tracks stay enabled.
                    Local playback volume is set to 0 (via the ref effect on mount) so the
                    candidate doesn't hear their own mic — this silences the local <video>
                    element only and never touches the published audio track. */}
                <video
                  ref={attachSelfView}
                  autoPlay
                  playsInline
                  muted
                  aria-label="Camera self-view"
                  className="ap-hud-self object-cover"
                />
                {captionsOn && captions.length > 0 && (
                  <div className="ap-hud-caption">
                    <span className="ap-hud-caption-who">Iris</span>
                    {captions[captions.length - 1]?.text ?? ""}
                  </div>
                )}
              </div>
              <div className="ap-hud-strip">
                <Chip label="Face" value={chips.face === "good" ? "One" : "Check"} good={chips.face === "good"} />
                <Chip label="Gaze" value={chips.gaze === "good" ? "On" : "Drift"} good={chips.gaze === "good"} />
                <Chip label="Mic" value={chips.mic === "good" ? "Live" : "Check"} good={chips.mic === "good"} />
                <Chip label="Integrity" value={`${chips.integrity}`} good={chips.integrity >= 80} />
              </div>
            </div>

            {recentFlag && recentFlag.severity !== "low" && (
              <Alert tone={recentFlag.severity === "high" ? "danger" : "warning"}>
                Integrity signal detected: {recentFlag.type.replace(/_/g, " ")}. Keep your face
                visible and stay in fullscreen.
              </Alert>
            )}

            {/* Full captions log under the HUD. Toggled by the captions control. */}
            {captionsOn && (
              <div className="ap-cell p-0">
                <span className="ap-cell-tag">Captions</span>
                <InterviewCaptions lines={captions} />
              </div>
            )}

            {/* CONTROL BAR — EXACTLY two controls. Captions toggle + End interview.
                Add NOTHING here. No track-disable toggles. No "raise hand". No settings. */}
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setCaptionsOn((on) => !on)}
                className="ap-btn ap-btn-ghost"
                aria-pressed={captionsOn}
              >
                {captionsOn ? (
                  <>
                    <Captions className="size-4" aria-hidden /> Captions on
                  </>
                ) : (
                  <>
                    <CaptionsOff className="size-4" aria-hidden /> Captions off
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => endSession("ended_by_candidate")}
                className="ap-btn ap-btn-primary"
              >
                End interview
                <ApIcon name="x" className="size-4" />
              </button>
            </div>
          </>
        )}

        {phase === "ended" && (
          <div className="ap-cell flex flex-col gap-3">
            <Alert tone={endReason === "ended_by_candidate" ? "success" : "danger"}>
              {endReason === "ended_by_candidate"
                ? "Interview ended — your responses are being scored; check your tracker for the outcome."
                : "This interview was ended automatically due to a serious integrity signal. The recruiter has been notified; check your tracker for the outcome."}
            </Alert>
            <Link
              href="/"
              className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-brand-strong underline-offset-4 hover:underline"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back to applications
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

function Chip({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className={`ap-hud-chip ${good ? "ap-hud-chip--good" : ""}`}>
      <span className="ap-hud-chip-lbl">{label}</span>
      <span className="ap-hud-chip-val">{value}</span>
    </div>
  );
}

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}
