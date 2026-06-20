"use client";

import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@ip/ui";
import { errorMessage, useAuthedQuery } from "@ip/shared";
import { Check, Sparkles } from "lucide-react";
import Link from "next/link";

import { useAuth } from "../lib/auth";

/** Pick a badge tone from the match score so a strong fit reads as "success". */
function scoreTone(score: number) {
  if (score >= 0.75) return "success" as const;
  if (score >= 0.5) return "info" as const;
  return "neutral" as const;
}

/**
 * Candidate-facing job recommendations from the AI Matcher (match_results). Each card
 * links to the public job page (title + JD + apply); the match score + reasons explain
 * the fit.
 */
export function RecommendedRoles() {
  const { api, token } = useAuth();

  const recs = useAuthedQuery(token, {
    queryKey: ["recommendations"],
    queryFn: () => api.recommendations.getCandidateRecommendations({}),
  });

  if (recs.isLoading) return <LoadingState />;
  if (recs.isError)
    return (
      <ErrorState message={errorMessage(recs.error)} retry={() => recs.refetch()} />
    );

  const matches = recs.data?.matches ?? [];
  if (matches.length === 0)
    return (
      <EmptyState
        title="No recommendations yet"
        description="Once your profile is parsed, roles that fit your skills appear here."
        icon={Sparkles}
      />
    );

  return (
    <div className="flex flex-col gap-3">
      {matches.map((m) => (
        <Link
          key={m.jobId}
          href={`/jobs/${m.jobId}`}
          className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-muted/50"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium text-foreground">Recommended role</p>
            <Badge tone={scoreTone(m.score)} variant="subtle" className="tabular-nums">
              {Math.round(m.score * 100)}% match
            </Badge>
          </div>
          {m.reasons.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              {m.reasons.map((r, i) => (
                <li key={`${m.jobId}-${i}`} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          )}
        </Link>
      ))}
    </div>
  );
}
