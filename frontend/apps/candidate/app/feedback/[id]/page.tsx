"use client";

import { ErrorState, Progress, Spinner } from "@ip/ui";
import {
  errorMessage,
  refetchUntil,
  useAuthedQuery,
  useRequireAuth,
  useRequireRole,
} from "@ip/shared";
import { ArrowLeft, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { CandidateShell } from "../../../components/candidate-shell";
import { GrowthFeedbackPanel } from "../../../components/growth-feedback-panel";
import { isStillFinalizing, usePracticeClient } from "../../../lib/practice-client";
import { useAuth } from "../../../lib/auth";

// The `[id]` here is a PRACTICE_ID — this page renders detached PRACTICE feedback, which is always
// allowed (no funnel, no employer visibility, no hire/reject). The separate real-APPLICATION
// feedback surface (keyed by an applicationId, terminal-state-gated, on the comp-scoped client)
// is a DIFFERENT page by the never-mid-funnel rule — do NOT route application feedback through
// the practice client.
export default function PracticeFeedbackPage() {
  const { token, ready, identity } = useAuth();
  useRequireAuth(token, ready);
  useRequireRole(identity?.role, ["candidate"], ready);

  const { id } = useParams<{ id: string }>();
  const practiceClient = usePracticeClient();

  // Scoring is async: a run opened straight after finishing may still be finalizing — keep
  // polling on StillFinalizing until the summary lands, then stop.
  const fb = useAuthedQuery(token, {
    queryKey: ["practice-feedback", id],
    queryFn: () => practiceClient.feedback(id),
    retry: (n, err) => isStillFinalizing(err) && n < 12,
    refetchInterval: refetchUntil((d) => d !== undefined, 2500),
  });

  if (!token) return null;

  const finalizing = fb.isLoading || (fb.isError && isStillFinalizing(fb.error));

  return (
    <CandidateShell>
      <header className="mb-8 flex flex-col gap-3">
        <Link
          href="/practice"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink-deep hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to practice
        </Link>
        <span className="ap-eyebrow">
          <Sparkles className="size-4" aria-hidden /> Practice feedback
        </span>
        <h1 className="ap-h2">
          Practice feedback — does not affect your real applications.
        </h1>
        <p className="ap-lead">
          Private growth feedback from a past practice run. Strengths, gaps, and topics to study —
          never shared with employers.
        </p>
        <div className="mt-1">
          <span className="ap-pill ap-pill--teal">
            <Lock className="size-3" aria-hidden /> Detached · employers cannot see this
          </span>
        </div>
      </header>

      {finalizing && (
        <div className="ap-cell flex items-center gap-3 py-8">
          <Spinner />
          <span className="text-ink-deep">Scoring your practice interview…</span>
          <Progress className="ml-auto w-32" />
        </div>
      )}

      {fb.isError && !isStillFinalizing(fb.error) && (
        <ErrorState message={errorMessage(fb.error)} retry={() => fb.refetch()} />
      )}

      {fb.data && <GrowthFeedbackPanel result={fb.data} />}
    </CandidateShell>
  );
}
