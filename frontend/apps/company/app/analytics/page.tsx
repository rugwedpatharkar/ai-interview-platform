"use client";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@ip/ui";
import { errorMessage, useAuthedQuery } from "@ip/shared";
import type { FunnelAnalytics } from "@ip/api-client";

import { CompanyShell } from "../../components/company-shell";
import { FunnelChart } from "../../components/funnel-chart";
import { useAuth } from "../../lib/auth";

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function FunnelView({ data }: { data: FunnelAnalytics }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Kpi label="Total applications" value={String(Number(data.total))} />
        <Kpi
          label="Conversion to hire"
          value={`${Math.round(data.conversionRate * 100)}%`}
        />
      </div>

      <FunnelChart data={data} />
    </div>
  );
}

export default function AnalyticsPage() {
  const { api, token } = useAuth();
  const funnel = useAuthedQuery(token, {
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
