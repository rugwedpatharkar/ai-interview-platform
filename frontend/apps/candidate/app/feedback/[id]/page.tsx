"use client";

import { Card, CardContent, ErrorState, PageHeader, Progress, Spinner } from "@ip/ui";
import {
  errorMessage,
  refetchUntil,
  useAuthedQuery,
  useRequireAuth,
  useRequireRole,
} from "@ip/shared";
import { useParams } from "next/navigation";

import { CandidateShell } from "../../../components/candidate-shell";
import { GrowthFeedbackPanel } from "../../../components/growth-feedback-panel";
import { isStillFinalizing, practiceClient } from "../../../lib/practice-client";
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
      <PageHeader
        title="Practice feedback"
        description="Private growth feedback from a past practice run — never shared with employers."
      />
      {finalizing && (
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <Spinner />
            <span className="text-foreground">Scoring your practice interview…</span>
            <Progress className="ml-auto w-32" />
          </CardContent>
        </Card>
      )}
      {fb.isError && !isStillFinalizing(fb.error) && (
        <ErrorState message={errorMessage(fb.error)} retry={() => fb.refetch()} />
      )}
      {fb.data && <GrowthFeedbackPanel result={fb.data} />}
    </CandidateShell>
  );
}
