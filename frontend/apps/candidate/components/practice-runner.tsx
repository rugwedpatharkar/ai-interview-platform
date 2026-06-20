"use client";

import { Alert, Button, Card, CardContent, Progress, Spinner, Textarea } from "@ip/ui";
import { errorMessage, refetchUntil } from "@ip/shared";
import { useQuery } from "@tanstack/react-query";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { isStillFinalizing, practiceClient } from "../lib/practice-client";
import { GrowthFeedbackPanel } from "./growth-feedback-panel";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/.test(navigator.platform);

/** The practice turn loop: a clone of the live text-interview machine with proctoring/consent
 *  removed (practice is private — no camera, no fullscreen, no recruiter). It starts already
 *  `active` because it's handed the first question. On the final turn it flips to `finalizing`
 *  and polls feedback (the backend scores asynchronously) until the growth panel can render. */
export function PracticeRunner({
  practiceId,
  firstQuestion,
}: {
  practiceId: string;
  firstQuestion: string;
}) {
  const [turns, setTurns] = useState<{ question: string; answer: string }[]>([]);
  const [current, setCurrent] = useState(firstQuestion);
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<"active" | "finalizing" | "done">("active");
  const [error, setError] = useState<string | null>(null);

  // Synchronous latch so a same-tick double-send / StrictMode double-invoke can't double-post.
  const inFlight = useRef(false);
  // Guard against setting state after the page navigates away mid-request.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Warn before a refresh/close while a run is in progress so answers aren't lost.
  useEffect(() => {
    if (phase !== "active") return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [phase]);

  // The server scores asynchronously, so feedback may not be ready the instant the run ends —
  // treat "still finalizing" as keep-polling and stop once the summary lands.
  const fb = useQuery({
    queryKey: ["practice-feedback", practiceId],
    queryFn: () => practiceClient.feedback(practiceId),
    enabled: phase !== "active",
    retry: (n, err) => isStillFinalizing(err) && n < 12,
    refetchInterval: refetchUntil((d) => d !== undefined, 2500),
  });

  async function send() {
    const text = answer.trim();
    if (inFlight.current || !text || phase !== "active") return;
    inFlight.current = true;
    setError(null);
    try {
      const res = await practiceClient.turn(practiceId, text);
      if (!mounted.current) return;
      setTurns((t) => [...t, { question: current, answer: text }]);
      setAnswer("");
      if (res.done) setPhase("finalizing");
      else setCurrent(res.question);
    } catch (err) {
      if (mounted.current) setError(errorMessage(err));
    } finally {
      inFlight.current = false;
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  }

  if (phase !== "active") {
    if (fb.data) return <GrowthFeedbackPanel result={fb.data} />;
    if (fb.isError && !isStillFinalizing(fb.error)) {
      return (
        <Alert tone="danger" title="Couldn’t load your feedback">
          <span className="flex flex-col items-start gap-2">
            {errorMessage(fb.error)}
            <Button variant="outline" size="sm" onClick={() => void fb.refetch()}>
              Retry
            </Button>
          </span>
        </Alert>
      );
    }
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-8">
          <Spinner />
          <span className="text-foreground">Scoring your practice interview…</span>
          <Progress className="ml-auto w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="log" aria-live="polite" className="flex flex-col gap-6">
        {turns.map((t, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="rounded-lg border border-border bg-surface-muted px-4 py-3 text-sm text-foreground">
              {t.question}
            </div>
            <div className="ml-2 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground shadow-sm sm:ml-8">
              {t.answer}
            </div>
          </div>
        ))}
      </div>

      <p
        className="text-lg font-semibold tracking-tight text-foreground"
        role="status"
        aria-live="polite"
      >
        {current}
      </p>

      {error && (
        <Alert tone="danger">
          <span className="flex flex-col items-start gap-2">
            {error}
            <Button variant="outline" size="sm" onClick={() => void send()}>
              Retry
            </Button>
          </span>
        </Alert>
      )}

      <Textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={`Type your answer… (${isMac ? "⌘" : "Ctrl"}+Enter to send)`}
        rows={4}
      />
      <Button onClick={() => void send()} disabled={!answer.trim()} className="self-end">
        Send
      </Button>
    </div>
  );
}
