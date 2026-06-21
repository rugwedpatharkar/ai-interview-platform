"use client";

import { Alert, ApIcon, Checkbox, Logo } from "@ip/ui";
import { Code, ConnectError, useRequireAuth } from "@ip/shared";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Eye,
  Monitor,
  Scan,
  ShieldCheck,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { fakeStream } from "../rtc-room";
import { useAuth } from "../../../../lib/auth";
import { AppearanceToggle } from "../../../../components/appearance-toggle";

const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

type GateStatus = "pending" | "checking" | "pass" | "warn" | "fail";

interface Gates {
  camera: GateStatus;
  microphone: GateStatus;
  fullscreenSupported: GateStatus;
  environment: GateStatus;
  idVerify: GateStatus;
}

/**
 * Device pre-check + ID verify lobby. This is a STANDALONE room shell — no app sidebar.
 *
 * The lobby NEVER requests fullscreen (the room owns that). It does:
 *   1. Surface the strict-proctored invariants verbatim.
 *   2. Acquire camera + mic (preview only) and report device-level gates.
 *   3. Stub-run an ID-verify selfie check (placeholder pending the real flow).
 *   4. Show a 4-tile environment scan (CAM / MIC / SCR / ENV) summarising readiness.
 *   5. Gate "Start interview" behind ALL passing checks + an explicit acknowledgement.
 *   6. On Start: fetch a fresh `rtcToken` to fail-fast if the funnel state blocks the
 *      session, then `router.push` into the room. The room re-fetches its own token
 *      from the existing pre-check flow — this call is a reachability probe.
 */
export default function InterviewLobbyPage() {
  const router = useRouter();
  const { api, token, ready } = useAuth();
  useRequireAuth(token, ready);
  const { applicationId } = useParams<{ applicationId: string }>();

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [scanRunning, setScanRunning] = useState(false);

  const [gates, setGates] = useState<Gates>({
    camera: "pending",
    microphone: "pending",
    fullscreenSupported: "pending",
    environment: "pending",
    idVerify: "pending",
  });

  const videoRef = useRef<HTMLVideoElement>(null);

  // Mount the camera preview once devices are granted.
  useEffect(() => {
    if (stream && videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  // Detect fullscreen capability without entering fullscreen — the room owns the lock.
  useEffect(() => {
    if (typeof document === "undefined") return;
    setGates((g) => ({
      ...g,
      fullscreenSupported: document.fullscreenEnabled ? "pass" : "warn",
    }));
  }, []);

  // Tear down the preview stream on unmount so the camera light goes off if the user backs out.
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [stream]);

  const requestDevices = useCallback(async () => {
    setError(null);
    setGates((g) => ({ ...g, camera: "checking", microphone: "checking" }));
    try {
      const s = MOCK
        ? fakeStream()
        : await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(s);
      setGates((g) => ({
        ...g,
        camera: s.getVideoTracks().length > 0 ? "pass" : "fail",
        microphone: s.getAudioTracks().length > 0 ? "pass" : "fail",
      }));
    } catch {
      setGates((g) => ({ ...g, camera: "fail", microphone: "fail" }));
      setError(
        "Camera and microphone access is required for this interview. Enable them in your browser and retry.",
      );
    }
  }, []);

  // Stubbed environment scan + ID check — they exercise the gate flow today and become
  // a real screen-share / second-display probe + selfie liveness check when those wire up.
  const runEnvironmentScan = useCallback(() => {
    setScanRunning(true);
    setGates((g) => ({ ...g, environment: "checking" }));
    window.setTimeout(() => {
      setGates((g) => ({ ...g, environment: "pass" }));
      setScanRunning(false);
    }, 900);
  }, []);

  const runIdCheck = useCallback(() => {
    setGates((g) => ({ ...g, idVerify: "checking" }));
    window.setTimeout(() => {
      setGates((g) => ({ ...g, idVerify: "pass" }));
    }, 1100);
  }, []);

  const allPassed =
    gates.camera === "pass" &&
    gates.microphone === "pass" &&
    gates.fullscreenSupported !== "fail" &&
    gates.environment === "pass" &&
    gates.idVerify === "pass";

  const startInterview = async () => {
    if (!allPassed || !ack || starting) return;
    setStarting(true);
    setError(null);
    try {
      // Probe the funnel — server tells us if this room is even startable. The room itself
      // will fetch its own fresh token; this call fails fast on FailedPrecondition / Unavailable
      // so the candidate never enters a half-broken room.
      await api.interview.rtcToken({ applicationId });
      // Stop the lobby preview stream so the room can acquire devices cleanly with its own
      // tracks (the room's existing DevicePrecheck flow handles the live tracks).
      stream?.getTracks().forEach((t) => t.stop());
      router.push(`/interview/${applicationId}`);
    } catch (err) {
      setStarting(false);
      if (err instanceof ConnectError) {
        if (err.code === Code.FailedPrecondition) {
          setError(
            "This interview can't be started right now — it may already be completed. Check your tracker for the latest status.",
          );
          return;
        }
        if (err.code === Code.Unavailable) {
          setError(
            "The live interview service isn't available right now. Please try again in a few minutes.",
          );
          return;
        }
      }
      setError(err instanceof Error ? err.message : "Could not start the interview.");
    }
  };

  if (!token) return null;

  return (
    <main className="min-h-screen bg-background">
      {/* Focused room top bar — Aptura mark + theme toggle + back link. No sidebar. */}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-4">
          <Link href="/" aria-label="Aptura home" className="flex">
            <Logo size="sm" />
          </Link>
          <span className="font-mono text-[0.74rem] uppercase tracking-[0.1em] text-ink-3">
            Lobby · pre-flight
          </span>
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink-deep hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to applications
          </Link>
          <AppearanceToggle />
        </div>
      </header>

      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-3">
          <span className="ap-eyebrow">
            <ShieldCheck className="size-4" aria-hidden /> Pre-flight check
          </span>
          <h1 className="ap-h2">Get ready for your proctored interview.</h1>
          <p className="ap-lead">
            Five quick checks before Iris joins. The interview starts the moment you click
            <span className="font-medium text-ink-deep"> Start interview</span> — there is no
            warm-up phase after that.
          </p>
        </div>

        {/* 1. Strict-proctored invariants — verbatim */}
        <section className="ap-def-panel ap-def-panel--detect flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-gold" aria-hidden />
            <h2 className="font-display text-[1.05rem] font-semibold text-ink-deep">
              This is a strictly proctored interview
            </h2>
          </div>
          <ul className="flex flex-col gap-1.5 text-[0.94rem] leading-relaxed text-ink-2">
            <li>· Camera + mic required. NO mute. NO camera-off.</li>
            <li>· Fullscreen-locked for the entire session.</li>
            <li>· On-device detectors only — only typed events leave the browser.</li>
            <li>
              · Server-authoritative auto-end on HIGH-severity (the client never decides
              termination).
            </li>
          </ul>
          <p className="text-[0.86rem] text-ink-3">
            Read the full{" "}
            <Link href="/trust" className="text-teal-strong underline underline-offset-4">
              integrity & privacy policy
            </Link>{" "}
            before you continue.
          </p>
        </section>

        {/* 2. Device pre-check */}
        <section className="ap-cell flex flex-col gap-4">
          <header className="flex items-center justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-2 font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ink-3">
                <Video className="size-3.5" aria-hidden />
                Step 1 · Camera & microphone
              </span>
              <h3 className="mt-1 font-display text-[1.05rem] font-semibold text-ink-deep">
                Live preview
              </h3>
            </div>
            <GateBadge status={gates.camera === "pass" && gates.microphone === "pass" ? "pass" : gates.camera === "fail" || gates.microphone === "fail" ? "fail" : "pending"} />
          </header>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            aria-label="Camera self-view preview"
            className="aspect-video w-full rounded-2xl border border-line bg-[oklch(0.12_0.02_230)] object-cover"
          />
          {!stream && (
            <button onClick={requestDevices} className="ap-btn ap-btn-primary self-start">
              <ApIcon name="cam" className="size-4" /> Enable camera & microphone
            </button>
          )}
          {stream && (
            <p className="inline-flex items-center gap-2 text-sm text-good">
              <ApIcon name="check" className="size-4" /> Devices ready · preview only, nothing is
              recorded here.
            </p>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
        </section>

        {/* 3. ID verify */}
        <section className="ap-cell flex flex-col gap-4">
          <header className="flex items-center justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-2 font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ink-3">
                <ApIcon name="user" className="size-3.5" />
                Step 2 · Identity check
              </span>
              <h3 className="mt-1 font-display text-[1.05rem] font-semibold text-ink-deep">
                One-time selfie liveness
              </h3>
            </div>
            <GateBadge status={gates.idVerify} />
          </header>
          <p className="text-sm text-ink-2">
            We confirm the person in the room is the candidate on the application. The image is
            stored only against this attempt and is never shared with the employer.
            <span className="ml-1 font-mono text-[0.74rem] uppercase tracking-[0.08em] text-ink-3">
              Placeholder · selfie capture wires up in v3.2
            </span>
          </p>
          <button
            onClick={runIdCheck}
            disabled={!stream || gates.idVerify === "checking" || gates.idVerify === "pass"}
            className="ap-btn ap-btn-ghost self-start disabled:cursor-not-allowed disabled:opacity-60"
          >
            {gates.idVerify === "checking" ? "Verifying…" : gates.idVerify === "pass" ? "Re-run ID check" : "Run ID check"}
          </button>
        </section>

        {/* 4. Environment scan */}
        <section className="ap-cell flex flex-col gap-4">
          <header className="flex items-center justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-2 font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ink-3">
                <Scan className="size-3.5" aria-hidden />
                Step 3 · Environment scan
              </span>
              <h3 className="mt-1 font-display text-[1.05rem] font-semibold text-ink-deep">
                Room, browser, and signal check
              </h3>
            </div>
            <GateBadge status={gates.environment} />
          </header>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ScanTile label="CAM" status={gates.camera} icon={<Video className="size-4" aria-hidden />} />
            <ScanTile label="MIC" status={gates.microphone} icon={<ApIcon name="mic" className="size-4" />} />
            <ScanTile label="SCR" status={gates.fullscreenSupported} icon={<Monitor className="size-4" aria-hidden />} />
            <ScanTile label="ENV" status={gates.environment} icon={<Eye className="size-4" aria-hidden />} />
          </div>
          <button
            onClick={runEnvironmentScan}
            disabled={!stream || scanRunning || gates.environment === "pass"}
            className="ap-btn ap-btn-ghost self-start disabled:cursor-not-allowed disabled:opacity-60"
          >
            {scanRunning
              ? "Scanning…"
              : gates.environment === "pass"
              ? "Re-run scan"
              : "Run environment scan"}
          </button>
        </section>

        {/* 5. Acknowledgement + Start */}
        <section className="ap-cell ap-cell--anchor flex flex-col gap-4">
          <span className="ap-cell-tag">Final step</span>
          <h3 className="font-display text-[1.1rem] font-semibold text-ink-deep">
            Acknowledge & start
          </h3>
          <label className="flex items-start gap-3 text-sm text-ink-2">
            <Checkbox
              className="mt-0.5"
              checked={ack}
              onCheckedChange={(v) => setAck(v === true)}
            />
            <span>
              I understand camera and mic are required for the entire session — there is no mute,
              no camera-off, and serious integrity signals end the interview automatically.
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={startInterview}
              disabled={!allPassed || !ack || starting}
              className="ap-btn ap-btn-primary ap-btn-lg disabled:cursor-not-allowed disabled:opacity-60"
            >
              {starting ? "Starting…" : "Start interview"}
              <ArrowRight className="size-4" aria-hidden />
            </button>
            {!allPassed && (
              <span className="text-sm text-ink-3">
                Finish every check above to enable Start.
              </span>
            )}
          </div>
          {error && allPassed && <Alert tone="danger">{error}</Alert>}
        </section>
      </div>
    </main>
  );
}

function GateBadge({ status }: { status: GateStatus }) {
  if (status === "pass")
    return (
      <span className="ap-pill ap-pill--good">
        <ApIcon name="check" className="size-3" />
        Pass
      </span>
    );
  if (status === "fail")
    return (
      <span className="ap-pill ap-pill--danger">
        <ApIcon name="x" className="size-3" />
        Fail
      </span>
    );
  if (status === "warn")
    return (
      <span className="ap-pill ap-pill--warn">
        <AlertTriangle className="size-3" aria-hidden />
        Limited
      </span>
    );
  if (status === "checking")
    return <span className="ap-pill">Checking…</span>;
  return <span className="ap-pill">Pending</span>;
}

function ScanTile({
  label,
  status,
  icon,
}: {
  label: string;
  status: GateStatus;
  icon: React.ReactNode;
}) {
  const tone =
    status === "pass"
      ? "border-good/40 bg-[color-mix(in_oklch,var(--good)_6%,var(--surface))] text-good"
      : status === "fail"
      ? "border-danger/40 bg-[color-mix(in_oklch,var(--danger)_6%,var(--surface))] text-danger"
      : status === "warn"
      ? "border-warn/40 bg-[color-mix(in_oklch,var(--warn)_6%,var(--surface))] text-warn"
      : "border-line bg-surface-2 text-ink-3";
  return (
    <div className={`flex flex-col gap-1.5 rounded-xl border p-3 ${tone}`}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="font-mono text-[0.72rem] uppercase tracking-[0.08em]">{label}</span>
      </div>
      <span className="font-display text-[0.9rem] font-semibold capitalize">
        {status === "pending" ? "Waiting" : status === "checking" ? "Checking" : status}
      </span>
    </div>
  );
}
