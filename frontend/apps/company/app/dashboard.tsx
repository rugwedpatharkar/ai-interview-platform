"use client";

import { Avatar, Button, ErrorState, Skeleton } from "@ip/ui";
import { errorMessage, useAuthedQuery } from "@ip/shared";
import { Clock, Inbox, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { CompanyShell } from "../components/company-shell";
import { FunnelChart } from "../components/funnel-chart";
import { KpiCard } from "../components/kpi-card";
import { EmployerFirstRun } from "../components/onboarding/employer-firstrun";
import { RecentJobs } from "../components/recent-jobs";
import { useAuth } from "../lib/auth";

import { formatHours, formatPct, kpiTone, makeMockKpis } from "./dashboard-kpis";

// Advisory "Needs your decision" surface — render-only no-ghosting backlog. The
// real Advance/Reject wiring lives in the pipeline; here it mirrors the mockup queue.
const DECISIONS = [
  { name: "Aisha Rahman", detail: "Score 91 · passed gate" },
  { name: "Marcus Olsen", detail: "Score 88 · passed gate" },
  { name: "Jia Li", detail: "Score 84 · 2 flags" },
];

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

  // Derive the KPI tiles once per kpis snapshot — formatting + tone math is pure.
  const kpiCards = useMemo(
    () => [
      {
        label: "Outcome rate",
        value: formatPct(kpis.outcomeRate),
        hint: `${kpis.totalApplicants} applicants · ${kpis.windowDays}d`,
        icon: TrendingUp,
        tone: kpiTone(kpis.outcomeRate),
      },
      {
        label: "Awaiting outcome",
        value: kpis.openNoOutcome,
        hint: "Applicants with no decision yet",
        icon: Inbox,
        tone: kpis.openNoOutcome > 0 ? ("warning" as const) : ("positive" as const),
      },
      {
        label: "Avg response time",
        value: formatHours(kpis.avgResponseHours),
        hint: `Median ${formatHours(kpis.medianResponseHours)}`,
        icon: Clock,
      },
      {
        label: "Total applicants",
        value: kpis.totalApplicants,
        hint: `Last ${kpis.windowDays} days`,
        icon: Users,
      },
    ],
    [kpis],
  );

  return (
    <CompanyShell>
      {/* Greeting + no-ghosting reassurance + primary CTA */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
            Good morning
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your hiring at a glance — no applicant left without an outcome.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-surface px-2.5 py-1 text-xs font-medium text-success-foreground before:size-1.5 before:rounded-full before:bg-current">
            100% answered
          </span>
          <Link
            href="/jobs/new"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            + Post a job
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <EmployerFirstRun />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpiCards.map((card) => (
            <KpiCard key={card.label} {...card} />
          ))}
        </div>

        {/* Two-column body: hiring funnel LEFT · recent jobs + decision queue RIGHT */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_360px]">
          <div className="flex flex-col gap-4">
            {funnel.isLoading && <FunnelSkeleton />}
            {funnel.isError && (
              <ErrorState
                message={errorMessage(funnel.error)}
                retry={() => funnel.refetch()}
              />
            )}
            {funnel.data && <FunnelChart data={funnel.data} />}
          </div>

          <div className="flex flex-col gap-4">
            <RecentJobs />

            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  Needs your decision
                </h2>
                <span className="inline-flex items-center rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium tabular-nums text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                  {DECISIONS.length}
                </span>
              </div>
              <ul>
                {DECISIONS.map((d, i) => (
                  <li
                    key={d.name}
                    className="flex animate-rise-in items-center justify-between gap-3 border-b border-border py-3 last:border-b-0"
                    style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={d.name} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {d.name}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {d.detail}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button size="sm">Advance</Button>
                      <Button size="sm" variant="ghost">
                        Reject
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </CompanyShell>
  );
}

// Funnel placeholder shaped like FunnelChart: header row + six stage bars.
function FunnelSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-5 w-20" />
      </div>
      <div className="flex flex-col gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-4 sm:grid-cols-[9.5rem_1fr_3rem]"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-4 w-8 justify-self-end" />
          </div>
        ))}
      </div>
    </div>
  );
}
