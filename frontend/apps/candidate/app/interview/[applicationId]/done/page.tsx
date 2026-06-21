"use client";

import { ApIcon, Logo, ThemeToggle } from "@ip/ui";
import { useRequireAuth } from "@ip/shared";
import { ArrowLeft, ArrowRight, MailQuestion, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

import { useAuth } from "../../../../lib/auth";

/**
 * Post-interview completion screen — focused room shell, NO sidebar, READ-ONLY.
 *
 * The page is intentionally terminal: it offers no path to re-enter the proctored room. The
 * interview is one-shot by policy; once it ends (cleanly or by auto-termination), the
 * candidate's only forward action is the dashboard.
 *
 * This page calls zero RPCs. The router pushes here from the room with `?reason=auto_terminated`
 * for the integrity-policy auto-end path, and with no query for a clean candidate-ended session.
 */
export default function InterviewCompletedPage() {
  const { token, ready } = useAuth();
  useRequireAuth(token, ready);
  const { applicationId } = useParams<{ applicationId: string }>();
  const params = useSearchParams();
  const autoTerminated = params.get("reason") === "auto_terminated";

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
            Interview · complete
          </span>
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink-deep hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to applications
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
        {autoTerminated ? (
          <AutoTerminatedState applicationId={applicationId} />
        ) : (
          <CleanCompletionState applicationId={applicationId} />
        )}
      </div>
    </main>
  );
}

function CleanCompletionState({ applicationId }: { applicationId: string }) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <span className="ap-eyebrow">
          <ApIcon name="check" className="size-4" /> Session captured
        </span>
        <h1 className="ap-h2">Interview captured. Report due in ~5–10 minutes.</h1>
        <p className="ap-lead">
          Your responses are being scored against the role's competency frame and stitched into
          an evidence report. You'll see the outcome on your applications tracker — no need to
          stay on this page.
        </p>
      </div>

      <div className="ap-cell ap-cell--anchor flex flex-col gap-4">
        <span className="ap-cell-tag">Status · {applicationId.slice(0, 8)}</span>
        <span className="ap-pill ap-pill--good w-fit">
          <ApIcon name="check" className="size-3" />
          Recorded · scoring in progress
        </span>
        <ul className="flex flex-col gap-2 text-sm text-ink-2">
          <li className="inline-flex items-start gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal" aria-hidden />
            <span>
              Iris's questions and your spoken answers were captured in full — no editing happens
              after the session.
            </span>
          </li>
          <li className="inline-flex items-start gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal" aria-hidden />
            <span>
              Your integrity timeline is attached to the report — the recruiter sees the same
              evidence you'd see.
            </span>
          </li>
          <li className="inline-flex items-start gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal" aria-hidden />
            <span>
              Most reports land within 10 minutes; long-form roles can take up to 30. We email
              you the moment the outcome is ready.
            </span>
          </li>
        </ul>
        <Link href="/" className="ap-btn ap-btn-primary ap-btn-lg w-fit">
          Return to dashboard
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <p className="text-center font-mono text-[0.74rem] uppercase tracking-[0.1em] text-ink-3">
        This page is read-only · close it any time
      </p>
    </>
  );
}

function AutoTerminatedState({ applicationId }: { applicationId: string }) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <span className="ap-eyebrow" style={{ color: "var(--danger)" }}>
          <ShieldAlert className="size-4" /> Session ended early
        </span>
        <h1 className="ap-h2">Session ended early by integrity policy.</h1>
        <p className="ap-lead">
          A high-severity integrity signal was detected and the session was ended automatically
          by the server. The recruiter has been notified. This page can't re-open the interview
          — please reach out to the recruiter or our team if you believe this was a mistake.
        </p>
      </div>

      <div className="ap-def-panel ap-def-panel--detect flex flex-col gap-4">
        <span className="ap-cell-tag">Status · {applicationId.slice(0, 8)}</span>
        <span className="ap-pill ap-pill--danger w-fit">
          <ShieldAlert className="size-3" aria-hidden />
          Auto-terminated
        </span>
        <p className="text-sm text-ink-2">
          The full integrity timeline is attached to your application record. The same evidence
          is shown to the candidate, the recruiter, and any compliance reviewer — there is no
          private view of an Aptura session.
        </p>
        <div className="flex flex-col gap-1.5">
          <Link
            href="/trust"
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-deep underline-offset-4 hover:underline"
          >
            <ApIcon name="shield" className="size-4" />
            Read the integrity policy
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
          <Link
            href="/messages"
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-deep underline-offset-4 hover:underline"
          >
            <MailQuestion className="size-4" aria-hidden />
            Contact support
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
        <Link href="/" className="ap-btn ap-btn-ghost w-fit">
          Return to dashboard
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>

      <p className="text-center font-mono text-[0.74rem] uppercase tracking-[0.1em] text-ink-3">
        This page is read-only
      </p>
    </>
  );
}
