"use client";

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Spinner,
  Textarea,
} from "@ip/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { HttpError, startProctoring, useRequireAuth } from "@ip/shared";

import { interview, proctor, useAuth } from "../../../lib/auth";

interface Turn {
  question: string;
  answer: string;
}

// A 409/410 means the session is gone (already completed or expired) — there's no resume,
// so retrying can't help. Surface a terminal "ended" state with a way out instead.
function isSessionEnded(err: unknown): boolean {
  return err instanceof HttpError && (err.status === 409 || err.status === 410);
}

export default function InterviewPage() {
  const { token, ready } = useAuth();
  useRequireAuth(token, ready);
  const { applicationId } = useParams<{ applicationId: string }>();
  const consentKey = `interview-consent:${applicationId}`;
  const proctorKey = `interview-proctor-consent:${applicationId}`;
  const [phase, setPhase] = useState<"intro" | "active" | "done">("intro");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [current, setCurrent] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [consented, setConsented] = useState(false);
  const [proctorConsented, setProctorConsented] = useState(false);
  // The interview can't be resumed, so a transient failure must stay visible with an
  // explicit retry (a toast would vanish and dead-end the candidate). The answer is kept
  // in the textarea on failure, so retrying re-submits it.
  const [error, setError] = useState<string | null>(null);
  // A session-ended error (409/410) is terminal — no retry, just an exit.
  const [ended, setEnded] = useState(false);
  // Synchronous in-flight latch: survives a StrictMode double-invoke and a same-tick
  // double Enter that the `busy` state flag (read from a stale closure) cannot.
  const inFlight = useRef(false);
  // Aborted on unmount so a stalled start/turn call can't pin `busy` indefinitely.
  const abortCtrl = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortCtrl.current?.abort();
    };
  }, []);

  // Restore consent from a prior visit — an accidental refresh on the intro shouldn't
  // force the candidate to re-tick the boxes.
  useEffect(() => {
    setConsented(localStorage.getItem(consentKey) === "true");
    setProctorConsented(localStorage.getItem(proctorKey) === "true");
  }, [consentKey, proctorKey]);

  function toggleConsent(v: boolean) {
    setConsented(v);
    localStorage.setItem(consentKey, String(v));
  }
  function toggleProctorConsent(v: boolean) {
    setProctorConsented(v);
    localStorage.setItem(proctorKey, String(v));
  }

  // No resume endpoint — warn before navigating away mid-interview.
  useEffect(() => {
    if (phase !== "active") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  // On-device proctoring (advisory, signals-only) runs only during the active interview
  // and only after proctoring consent. Nothing but typed events ever leaves the device.
  useEffect(() => {
    if (phase !== "active" || !proctorConsented) return;
    return startProctoring({
      send: (events) => proctor.send(applicationId, events),
    });
  }, [phase, proctorConsented, applicationId]);

  if (!token) return null;

  async function start() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    abortCtrl.current?.abort();
    const ctrl = new AbortController();
    abortCtrl.current = ctrl;
    try {
      const res = await interview.start(applicationId, ctrl.signal);
      if (!res.question) {
        throw new Error("The interview couldn't be prepared. Please try again.");
      }
      setCurrent(res.question);
      setPhase("active");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (isSessionEnded(err)) setEnded(true);
      else setError(err instanceof Error ? err.message : "Could not start the interview");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function send() {
    const text = answer.trim();
    if (!text || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    abortCtrl.current?.abort();
    const ctrl = new AbortController();
    abortCtrl.current = ctrl;
    try {
      const res = await interview.turn(applicationId, text, ctrl.signal);
      setTurns((t) => [...t, { question: current, answer: text }]);
      setAnswer("");
      if (res.done) {
        setPhase("done");
        setCurrent("");
      } else {
        setCurrent(res.question);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (isSessionEnded(err)) setEnded(true);
      else setError(err instanceof Error ? err.message : "Could not submit your answer");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
        Interview
      </h1>

      {ended && (
        <Alert tone="warning" title="This interview session has ended">
          <span className="flex flex-col items-start gap-3">
            It may already be complete or have expired, and it can't be resumed. Check your
            tracker for the outcome.
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

      {error && !ended && (
        <Alert tone="danger">
          <span className="flex flex-col items-start gap-3">
            {error}
            <Button
              variant="outline"
              size="sm"
              onClick={phase === "intro" ? start : send}
              disabled={busy}
            >
              Retry
            </Button>
          </span>
        </Alert>
      )}

      {!ended && phase === "intro" && (
        <Card>
          <CardHeader>
            <CardTitle>Before you begin</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Alert tone="warning">
              This is a live text interview. It can't be paused or restarted — please
              answer each question in one sitting and don't refresh the page.
            </Alert>
            <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <Checkbox
                className="mt-0.5"
                checked={consented}
                onCheckedChange={(v) => toggleConsent(v === true)}
              />
              <span>
                I understand this is a live, one-sitting interview and I'm ready to begin.
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <Checkbox
                className="mt-0.5"
                checked={proctorConsented}
                onCheckedChange={(v) => toggleProctorConsent(v === true)}
              />
              <span>
                I consent to on-device integrity monitoring during this interview —
                activity and device signals are checked locally to support a fair
                process. No audio or video is recorded or stored.
              </span>
            </label>
            <Button
              onClick={start}
              disabled={busy || !consented || !proctorConsented}
              loading={busy}
              className="self-start"
            >
              {busy ? "Starting…" : "Start interview"}
            </Button>
          </CardContent>
        </Card>
      )}

      {!ended && phase !== "intro" && (
        <div role="log" aria-live="polite" className="flex flex-col gap-6">
          {turns.map((t, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="rounded-lg bg-surface-muted px-4 py-3 text-sm text-foreground">
                {t.question}
              </div>
              <div className="ml-2 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground sm:ml-8">
                {t.answer}
              </div>
            </div>
          ))}
        </div>
      )}

      {!ended && phase === "active" && (
        <Card className="border-l-4 border-l-brand-500">
          <CardContent className="flex flex-col gap-3 p-4">
            <p
              className="font-display font-semibold text-foreground"
              role="status"
              aria-live="polite"
            >
              {current}
            </p>
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type your answer… (⌘/Ctrl+Enter to send)"
              disabled={busy}
              rows={4}
            />
            <Button
              onClick={send}
              disabled={busy || !answer.trim()}
              className="self-end"
            >
              {busy ? (
                <span className="flex items-center gap-2">
                  <Spinner /> Sending…
                </span>
              ) : (
                "Send"
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {!ended && phase === "done" && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-6">
            <Alert tone="success">
              Interview complete — thank you. Your responses are being scored; check your
              tracker for the outcome.
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
    </main>
  );
}
