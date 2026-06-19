"use client";

import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  LoadingState,
  buttonVariants,
  cn,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Sparkles } from "lucide-react";
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
  const { api } = useAuth();

  const recs = useQuery({
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {matches.map((m) => (
        <Card key={m.jobId} hoverable className="flex flex-col">
          <CardContent className="flex flex-1 flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-foreground">Recommended role</p>
              <Badge tone={scoreTone(m.score)} variant="solid">
                {Math.round(m.score * 100)}% match
              </Badge>
            </div>
            {m.reasons.length > 0 && (
              <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                {m.reasons.map((r, i) => (
                  <li key={`${m.jobId}-${i}`} className="flex items-start gap-2">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-success"
                      aria-hidden
                    />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/jobs/${m.jobId}`}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "mt-auto self-start",
              )}
            >
              View &amp; apply
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
