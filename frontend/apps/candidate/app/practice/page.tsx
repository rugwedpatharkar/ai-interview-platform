"use client";

import { Button, ErrorState, LoadingState } from "@ip/ui";
import { errorMessage, useAuthedQuery, useRequireAuth, useRequireRole } from "@ip/shared";
import { ArrowRight, Eye, History, Lock, Mic, Shield, Sparkles, Video } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CandidateShell } from "../../components/candidate-shell";
import { PracticeRunner } from "../../components/practice-runner";
import { PracticeStartForm } from "../../components/practice-start-form";
import { usePracticeClient } from "../../lib/practice-client";
import { useAuth } from "../../lib/auth";
import type { PracticeStartResult } from "./types";

/** Candidate practice mode: start a detached mock interview (topic or JD), run the turn loop, see
 *  growth feedback, and browse past runs. Fully detached from the funnel — no comp_id/job_id,
 *  never published, never shown to an employer. */
export default function PracticePage() {
  const { token, ready, identity } = useAuth();
  useRequireAuth(token, ready);
  useRequireRole(identity?.role, ["candidate"], ready);

  const practiceClient = usePracticeClient();
  const [started, setStarted] = useState<PracticeStartResult | null>(null);

  const history = useAuthedQuery(token, {
    queryKey: ["practice-history"],
    queryFn: () => practiceClient.list(),
  });

  if (!token) return null;
  const sessions = history.data ?? [];

  return (
    <CandidateShell>
      <header className="mb-8 flex flex-col gap-3">
        <span className="ap-eyebrow">
          <Sparkles className="size-4" aria-hidden /> Practice mode
        </span>
        <h1 className="ap-h2">
          A safe room to rehearse — feedback is for you, not employers.
        </h1>
        <p className="ap-lead">
          Run a private mock interview off a topic or a job description. Get growth feedback after.
          Nothing in practice is shared with anyone hiring you.
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="ap-pill ap-pill--teal">
            <Lock className="size-3" aria-hidden /> Detached from your applications
          </span>
          <span className="ap-pill">
            <Shield className="size-3" aria-hidden /> No score · no verdict
          </span>
        </div>
      </header>

      {started ? (
        <div className="ap-cell flex flex-col gap-4">
          <span className="ap-cell-tag">Live · practice</span>
          <PracticeRunner
            practiceId={started.practice_id}
            firstQuestion={started.question}
          />
          <Button
            variant="ghost"
            className="self-start"
            onClick={() => setStarted(null)}
          >
            Start another
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="ap-cell ap-cell--anchor">
            <span className="ap-cell-tag">Start a session</span>
            <PracticeStartForm onStarted={setStarted} />
          </div>

          <aside className="ap-def-panel ap-def-panel--privacy flex flex-col gap-3">
            <span className="ap-eyebrow">What practice looks like</span>
            <h3 className="ap-h4">Same shape as the real interview — without the stakes.</h3>
            <ul className="ap-def-list ap-def-list--privacy">
              <li>
                <Video className="size-4" aria-hidden />
                Camera and mic on — same proctoring engine, no recording shared.
              </li>
              <li>
                <Mic className="size-4" aria-hidden />
                Iris asks 3–4 questions in your role's competency frame.
              </li>
              <li>
                <Eye className="size-4" aria-hidden />
                Captions on by default · session is read-only afterwards.
              </li>
              <li>
                <Shield className="size-4" aria-hidden />
                You see growth feedback. No employer ever does.
              </li>
            </ul>
          </aside>
        </div>
      )}

      <section className="mt-10 flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <span className="ap-eyebrow">
              <History className="size-4" aria-hidden /> Past practice runs
            </span>
            <h2 className="ap-h3 mt-2">Your growth log</h2>
          </div>
          {sessions.length > 0 && (
            <span className="font-mono text-[0.78rem] uppercase tracking-[0.08em] text-ink-3">
              {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
            </span>
          )}
        </div>

        {history.isLoading && <LoadingState />}
        {history.isError && (
          <ErrorState
            message={errorMessage(history.error)}
            retry={() => history.refetch()}
          />
        )}
        {!history.isLoading && !history.isError && sessions.length === 0 && (
          <div className="ap-cell flex flex-col items-start gap-2 text-sm text-ink-2">
            <span className="ap-pill">Empty</span>
            <p className="text-ink-2">
              No practice runs yet. Finished sessions land here so you can revisit feedback and
              track progress.
            </p>
          </div>
        )}

        <div className="grid gap-3">
          {sessions.map((r) => (
            <Link
              key={r.practice_id}
              href={`/feedback/${r.practice_id}`}
              className="group"
              aria-label={`Open practice feedback for ${r.role_label}`}
            >
              <div className="ap-cell flex items-center justify-between gap-4 py-4 transition-colors hover:border-[color-mix(in_oklch,var(--teal)_30%,var(--line))]">
                <div className="flex flex-col gap-1">
                  <span className="font-display text-[1rem] font-semibold text-ink-deep">
                    {r.role_label}
                  </span>
                  <span className="font-mono text-[0.72rem] uppercase tracking-[0.08em] text-ink-3">
                    {new Date(r.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <span className="inline-flex items-center gap-2 text-sm font-medium text-teal-strong">
                  Open feedback
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </CandidateShell>
  );
}
