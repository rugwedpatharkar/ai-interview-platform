"use client";

import { ErrorState, LoadingState, PageHeader } from "@ip/ui";
import { errorMessage, useAuthedQuery } from "@ip/shared";
import { Clock, Inbox, TrendingUp, Users } from "lucide-react";

import { CompanyShell } from "../components/company-shell";
import { FunnelChart } from "../components/funnel-chart";
import { KpiCard } from "../components/kpi-card";
import { RecentJobs } from "../components/recent-jobs";
import { useAuth } from "../lib/auth";

import { formatHours, formatPct, kpiTone, makeMockKpis } from "./dashboard-kpis";

export function RecruiterDashboard() {
  const { api, token } = useAuth();
  // Shares the ["analytics","funnel"] key with /analytics — TanStack dedups the fetch.
  const funnel = useAuthedQuery(token, {
    queryKey: ["analytics", "funnel"],
    queryFn: () => api.analytics.getFunnelAnalytics({}),
  });
  // KPI strip: mock until Analytics.GetNoGhostingKpis lands; then
  // api.analytics.getNoGhostingKpis({ windowDays: 30 }) (widen bigints with Number(...)).
  const kpis = makeMockKpis();

  return (
    <CompanyShell>
      <PageHeader
        title="Dashboard"
        description="Your hiring at a glance — no applicant left without an outcome."
      />
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Outcome rate"
            value={formatPct(kpis.outcomeRate)}
            hint={`${kpis.totalApplicants} applicants · ${kpis.windowDays}d`}
            icon={TrendingUp}
            tone={kpiTone(kpis.outcomeRate)}
          />
          <KpiCard
            label="Awaiting outcome"
            value={kpis.openNoOutcome}
            hint="Applicants with no decision yet"
            icon={Inbox}
            tone={kpis.openNoOutcome > 0 ? "warning" : "positive"}
          />
          <KpiCard
            label="Avg response time"
            value={formatHours(kpis.avgResponseHours)}
            hint={`Median ${formatHours(kpis.medianResponseHours)}`}
            icon={Clock}
          />
          <KpiCard
            label="Total applicants"
            value={kpis.totalApplicants}
            hint={`Last ${kpis.windowDays} days`}
            icon={Users}
          />
        </div>

        {funnel.isLoading && <LoadingState />}
        {funnel.isError && (
          <ErrorState
            message={errorMessage(funnel.error)}
            retry={() => funnel.refetch()}
          />
        )}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {funnel.data && <FunnelChart data={funnel.data} />}
          <RecentJobs />
        </div>
      </div>
    </CompanyShell>
  );
}
