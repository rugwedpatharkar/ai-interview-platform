"use client";

import { Alert, Button, Card, CardContent } from "@ip/ui";
import {
  Code,
  ConnectError,
  startProctoring,
  useRequireAuth,
} from "@ip/shared";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "../../../lib/auth";
import { DevicePrecheck } from "../../../components/device-precheck";
import {
  InterviewCaptions,
  type CaptionLine,
} from "../../../components/interview-captions";
import {
  ProctorStatusStrip,
  type ProctorState,
} from "../../../components/proctor-status-strip";
import { connectRoom, makeFakeRoom, type InterviewRoom } from "./rtc-room";
import { startAudioDetector } from "./proctor-audio";
import { startVisionDetector } from "./proctor-vision";
import {
  HIGH_SEVERITY,
  severityOf,
  type ProctorAck,
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

export default function InterviewPage() {
  const { token, ready, api } = useAuth();
  useRequireAuth(token, ready);
  const { applicationId } = useParams<{ applicationId: string }>();

  const [phase, setPhase] = useState<"precheck" | "live" | "ended">("precheck");
  const [endReason, setEndReason] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pstate, setPstate] = useState<ProctorState>({
    oneFace: true,
    eyesOnScreen: true,
    fullscreen: true,
  });
  const [captions, setCaptions] = useState<CaptionLine[]>([]);

  const room = useRef<InterviewRoom | null>(null);
  const detach = useRef<Array<() => void>>([]);
  // Synchronous latch so a StrictMode double-invoke / double Start can't double-connect.
  const starting = useRef(false);

  // End the session: detach every detector, disconnect the room, leave fullscreen, show the
  // terminal state. Stable identity so detectors started inside onReady can call it.
  const endSession = useCallback((reason: string) => {
    setEndReason(reason);
    if (reason !== "ended_by_candidate") {
      setPstate((s) => ({ ...s, terminated: { reason } }));
    }
    detach.current.forEach((d) => d());
    detach.current = [];
    void room.current?.disconnect();
    room.current = null;
    if (typeof document !== "undefined" && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
    setPhase("ended");
  }, []);

  // Proctor sink: every detector emits here. Maps typed signals to the gRPC ProctorEvent shape
  // and records them. The server stamps severity and (per the auto-gate delta) may terminate;
  // the client reflects that via the ack. HIGH_SEVERITY drives optimistic UI ONLY — the server
  // stays authoritative for the actual terminate.
  const sink = useCallback(
    async (events: ProctorSignal[], keepalive?: boolean) => {
      const high = events.find((e) => HIGH.has(e.type));
      if (high) {
        setPstate((s) => ({
          ...s,
          recentFlag: { type: high.type, severity: severityOf(high.type) },
        }));
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
        // The auto-gate `terminated`/`reason` fields are not in the generated ProctorAccepted
        // yet (it carries `accepted`). Read them defensively so the room honours the server's
        // terminate the moment the backend delta lands — no client change required then.
        const ack = res as unknown as ProctorAck;
        if (!keepalive && ack?.terminated) {
          endSession(ack.reason ?? "integrity");
        }
      } catch (err) {
        // Drop a permanently-rejected batch (bad payload) so the runtime doesn't re-queue it
        // forever; rethrow transient failures so it retries (parity with the proctor runtime's
        // 4xx-drop / 5xx-retry split).
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

      // Device/behavior runtime (shipped) + on-device vision + audio (this round) → one sink.
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
      setPhase("live");
    } catch (err) {
      starting.current = false;
      if (isAborted(err)) return;
      // 503 "voice not configured" surfaces as Unavailable from the rtc-token RPC — offer a
      // non-dead-end fallback rather than stranding the candidate in a half-started room.
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
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
        Interview
      </h1>

      {unavailable && (
        <Alert tone="warning" title="Live interview not available right now">
          <span className="flex flex-col items-start gap-3">
            The proctored interview can&apos;t be started at the moment. Please try again
            shortly, or check your tracker for an update.
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
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
            <Button variant="outline" size="sm" onClick={() => setError(null)}>
              Dismiss
            </Button>
          </span>
        </Alert>
      )}

      {phase === "precheck" && !unavailable && (
        <DevicePrecheck onReady={onReady} mock={MOCK} />
      )}

      {phase !== "precheck" && (
        <>
          <ProctorStatusStrip state={pstate} />

          {phase === "live" && (
            <Card>
              <CardContent className="p-0">
                <h2
                  ref={phaseHeadingRef}
                  tabIndex={-1}
                  className="px-3 pt-3 text-sm font-medium text-foreground focus:outline-none"
                >
                  Interview in progress
                </h2>
                {/* Interviewer video + self-view tile render here; the room exposes the local
                    stream + captions. Controls are captions · end only — NO mute / NO
                    camera-off control exists in this tree. */}
                <InterviewCaptions lines={captions} />
                <div className="flex flex-col items-stretch justify-between gap-2 border-t border-border p-3 sm:flex-row sm:items-center">
                  <Alert tone="info" className="m-0">
                    This interview is proctored and recorded.
                  </Alert>
                  <Button
                    variant="outline"
                    onClick={() => endSession("ended_by_candidate")}
                    className="shrink-0"
                  >
                    End interview
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {phase === "ended" && (
            <Card>
              <CardContent className="flex flex-col gap-3 p-6">
                <h2 ref={phaseHeadingRef} tabIndex={-1} className="sr-only">
                  Interview ended
                </h2>
                <Alert
                  tone={endReason === "ended_by_candidate" ? "success" : "danger"}
                >
                  {endReason === "ended_by_candidate"
                    ? "Interview ended — your responses are being scored; check your tracker for the outcome."
                    : "This interview was ended automatically due to a serious integrity signal. The recruiter has been notified; check your tracker for the outcome."}
                </Alert>
                <Link
                  href="/"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  Back to applications
                </Link>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </main>
  );
}
