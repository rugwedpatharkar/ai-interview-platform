"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@ip/ui";
import { errorMessage, useAuthedQuery } from "@ip/shared";

import { useAuth } from "../lib/auth";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Per-job score distribution (the v1 "bias" surface): aggregate spread only — count,
 * min, mean, max — with NO protected attributes, matching the backend's scope.
 */
export function ScoreDistributionPanel({ jobId }: { jobId: string }) {
  const { api, token } = useAuth();
  const dist = useAuthedQuery(token, {
    queryKey: ["score-dist", jobId],
    queryFn: () => api.analytics.getJobScoreDistribution({ jobId }),
  });

  if (dist.isLoading) return <LoadingState />;
  if (dist.isError)
    return (
      <ErrorState message={errorMessage(dist.error)} retry={() => dist.refetch()} />
    );

  const d = dist.data;
  const count = d ? Number(d.count) : 0;
  if (!d || count === 0)
    return (
      <EmptyState
        title="No scores yet"
        description="The score distribution appears once candidates are scored for this job."
      />
    );

  const stats = [
    { label: "Scored", value: String(count) },
    { label: "Lowest", value: pct(d.min) },
    { label: "Mean", value: pct(d.mean) },
    { label: "Highest", value: pct(d.max) },
  ];

  // A single sample (or a zero-width range) makes the box plot a meaningless dot.
  const flat = count === 1 || d.max <= d.min;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold text-foreground">
              {s.value}
            </CardContent>
          </Card>
        ))}
      </div>
      {flat ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            More samples needed to show a distribution spread.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            {/* Text alternative for screen readers — the box plot below is decorative. */}
            <p className="sr-only">
              Score distribution: min {pct(d.min)} · p25 {pct(d.p25)} · median{" "}
              {pct(d.p50)} · p75 {pct(d.p75)} · max {pct(d.max)}.
            </p>
            {/* Box plot over the full 0–100% score range: whisker min–max, box p25–p75,
                median line. Scores are 0..1 so a percent maps straight to the track. */}
            <div className="relative h-8" aria-hidden>
              <div
                className="absolute top-1/2 h-px -translate-y-1/2 bg-muted-foreground"
                style={{ left: pct(d.min), width: pct(d.max - d.min) }}
              />
              <div
                className="absolute top-1/2 h-5 -translate-y-1/2 rounded bg-info-surface"
                style={{ left: pct(d.p25), width: pct(d.p75 - d.p25) }}
              />
              <div
                className="absolute top-1/2 h-5 w-0.5 -translate-y-1/2 bg-info"
                style={{ left: pct(d.p50) }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>min {pct(d.min)}</span>
              <span>p25 {pct(d.p25)}</span>
              <span>median {pct(d.p50)}</span>
              <span>p75 {pct(d.p75)}</span>
              <span>max {pct(d.max)}</span>
            </div>
            {/* Visible legend mapping the plot marks to the quartile band. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-1 w-4 rounded bg-muted-foreground" />
                min–max range
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-4 rounded bg-info-surface" />
                p25–p75
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-0.5 bg-info" />
                median
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Distribution stats only — no protected attributes.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
