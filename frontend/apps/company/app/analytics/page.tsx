"use client";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  applicationStatus,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import type { FunnelAnalytics } from "@ip/api-client";
import { useQuery } from "@tanstack/react-query";

import { CompanyShell } from "../../components/company-shell";
import { useAuth } from "../../lib/auth";

function FunnelView({ data }: { data: FunnelAnalytics }) {
  // counts are int64 (bigint on the wire); widen to number for display + bar widths.
  const max = data.states.reduce((m, s) => Math.max(m, Number(s.count)), 0) || 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Total applications</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-foreground">
            {Number(data.total)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conversion to hire</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold text-foreground">
            {Math.round(data.conversionRate * 100)}%
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By stage</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {data.states.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications yet.</p>
          ) : (
            <>
              {/* Accessible alternative to the bar chart for screen readers. */}
              <p className="sr-only">
                Applications by stage:{" "}
                {data.states
                  .map(
                    (s) =>
                      `${applicationStatus(s.state).label}, ${Number(s.count)}`,
                  )
                  .join("; ")}
                .
              </p>
              <ul aria-hidden className="flex flex-col gap-2">
                {data.states.map((s) => {
                  const status = applicationStatus(s.state);
                  const count = Number(s.count);
                  return (
                    <li key={s.state} className="flex items-center gap-3">
                      <div className="w-32 shrink-0 sm:w-40">
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </div>
                      <div className="h-5 flex-1 rounded bg-surface-muted">
                        <div
                          className="h-5 rounded bg-primary"
                          style={{ width: `${(count / max) * 100}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-sm tabular-nums text-foreground">
                        {count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AnalyticsPage() {
  const { api } = useAuth();
  const funnel = useQuery({
    queryKey: ["analytics", "funnel"],
    queryFn: () => api.analytics.getFunnelAnalytics({}),
  });

  return (
    <CompanyShell>
      <PageHeader title="Analytics" description="Your hiring funnel across all jobs." />
      {funnel.isLoading && <LoadingState />}
      {funnel.isError && (
        <ErrorState
          message={errorMessage(funnel.error)}
          retry={() => funnel.refetch()}
        />
      )}
      {funnel.data &&
        (Number(funnel.data.total) === 0 ? (
          <EmptyState
            title="No applications yet"
            description="Funnel analytics appear once candidates apply to your jobs."
          />
        ) : (
          <FunnelView data={funnel.data} />
        ))}
    </CompanyShell>
  );
}
