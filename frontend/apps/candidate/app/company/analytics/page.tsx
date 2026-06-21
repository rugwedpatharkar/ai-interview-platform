"use client";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  applicationPillStatus,
  cn,
} from "@ip/ui";
import { errorMessage, useAuthedQuery, useRequireRole } from "@ip/shared";
import type { FunnelAnalytics } from "@ip/api-client";
import { Activity, BarChart3, Clock, ShieldCheck, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { CompanyShell } from "../../../components/company-shell";
import { useAuth } from "../../../lib/auth";

// Time-range chip filter values. The funnel RPC takes no window today (it returns
// last-30-days), so the chip is presentation-only — the BE owns the canonical window.
// When `getFunnelAnalytics` learns a windowDays arg, drop the const and pass it through.
const RANGES = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

// Hiring analytics page. Funnel + KPI stat band on top, bento of supporting cells below.
// Preserves api.analytics.getFunnelAnalytics; KPIs that don't have a generated RPC yet are
// truthfully marked "—" (no fake numbers).
export default function AnalyticsPage() {
  const { api, token, identity, ready } = useAuth();
  useRequireRole(identity?.role, ["recruiter", "company_admin"], ready);

  const [range, setRange] = useState<RangeId>("30d");

  const funnel = useAuthedQuery(token, {
    queryKey: ["analytics", "funnel"],
    queryFn: () => api.analytics.getFunnelAnalytics({}),
  });

  return (
    <CompanyShell>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="ap-eyebrow">Analytics</p>
          <h1 className="ap-h2">Your hiring, in numbers.</h1>
          <p className="ap-lead mt-3 text-base">
            Funnel KPIs and integrity signals across every published role.
          </p>
        </div>
        <RangeChips value={range} onChange={setRange} />
      </header>

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
            icon={BarChart3}
            title="No applications yet"
            description="Funnel analytics appear once candidates apply to your jobs."
          />
        ) : (
          <FunnelView data={funnel.data} />
        ))}
    </CompanyShell>
  );
}

function RangeChips({
  value,
  onChange,
}: {
  value: RangeId;
  onChange: (id: RangeId) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface-2 p-1">
      {RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          className={cn(
            "px-3 py-1.5 text-xs font-semibold tracking-wide rounded-lg transition-colors",
            value === r.id
              ? "bg-surface text-foreground shadow-sm"
              : "text-ink-2 hover:text-foreground",
          )}
          aria-pressed={value === r.id}
          onClick={() => onChange(r.id)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function FunnelView({ data }: { data: FunnelAnalytics }) {
  // Widen the wire-bigints once per data snapshot — drives the bar widths and the KPI band.
  const rows = useMemo(() => {
    const widened = data.states.map((s) => ({
      state: s.state,
      status: applicationPillStatus(s.state),
      count: Number(s.count),
    }));
    const max = Math.max(1, ...widened.map((r) => r.count));
    return widened.map((r) => ({ ...r, pct: (r.count / max) * 100 }));
  }, [data]);

  const total = Number(data.total);
  const conversionPct = Math.round(data.conversionRate * 100);

  return (
    <div className="flex flex-col gap-6">
      {/* KPI stat band — funnel + integrity in one sweep. RPCs not yet generated render "—". */}
      <div className="ap-cell">
        <div className="ap-stats">
          <Stat
            n={total.toLocaleString()}
            l="Total applications across all jobs."
            icon={Users}
          />
          <Stat
            n={String(conversionPct)}
            unit="%"
            l="Conversion to hire (applied → hired)."
            icon={Activity}
          />
          <Stat n="—" l="Integrity flag rate. RPC pending." icon={ShieldCheck} />
          <Stat n="—" l="Decision turnaround. RPC pending." icon={Clock} />
        </div>
      </div>

      {/* Bento: anchor funnel cell + three supporting cells. */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="ap-cell ap-cell--anchor lg:col-span-2">
          <span className="ap-cell-tag">FUNNEL</span>
          <h2 className="ap-h4">Active hiring funnel</h2>
          <p className="mt-1 text-sm text-ink-2">
            Where every application currently sits — top-of-funnel to outcome.
          </p>

          <p className="sr-only">
            Applications by stage: {rows.map((r) => `${r.status.label}, ${r.count}`).join("; ")}.
          </p>
          <ul aria-hidden className="mt-6 flex flex-col gap-4">
            {rows.map((r) => (
              <li key={r.state} className="ap-bar">
                <span className="name">{r.status.label}</span>
                <span className="v">{r.count}</span>
                <span className="t">
                  <i style={{ width: `${r.pct}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="ap-cell">
          <span className="ap-cell-tag">CONVERSION</span>
          <h3 className="ap-h4">By stage</h3>
          <p className="mt-1 text-sm text-ink-2">
            Drop-off between adjacent funnel states.
          </p>
          <ul className="mt-4 flex flex-col gap-3 text-sm">
            {rows.slice(0, -1).map((r, i) => {
              const next = rows[i + 1];
              if (!next) return null;
              const pct = r.count > 0 ? Math.round((next.count / r.count) * 100) : 0;
              return (
                <li key={r.state} className="flex items-center justify-between gap-3">
                  <span className="truncate text-ink-2">
                    {r.status.label} → {next.status.label}
                  </span>
                  <span className="font-mono text-foreground tabular-nums">{pct}%</span>
                </li>
              );
            })}
            {rows.length < 2 && (
              <li className="text-sm text-ink-3">Not enough stages to compare yet.</li>
            )}
          </ul>
        </div>

        <div className="ap-cell">
          <span className="ap-cell-tag">DECISIONS</span>
          <h3 className="ap-h4">Recent decisions</h3>
          <p className="mt-1 text-sm text-ink-2">
            Hire, reject, shortlist — last seven days.
          </p>
          <p className="mt-4 text-sm text-ink-3">
            Audit-feed RPC pending. The audit log shows individual decisions today.
          </p>
        </div>

        <div className="ap-cell lg:col-span-2">
          <span className="ap-cell-tag">INTEGRITY</span>
          <h3 className="ap-h4">Integrity events trend</h3>
          <p className="mt-1 text-sm text-ink-2">
            On-device proctoring signals per interview, normalised.
          </p>
          <p className="mt-4 text-sm text-ink-3">
            Trend chart wires up after the integrity time-series RPC lands.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({
  n,
  unit,
  l,
  icon: Icon,
}: {
  n: string;
  unit?: string;
  l: string;
  icon: typeof Users;
}) {
  return (
    <div className="ap-stat">
      <div className="mb-3 inline-flex items-center gap-2 text-ink-3">
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="ap-stat-n">
        {n}
        {unit && <span className="ap-stat-unit">{unit}</span>}
      </div>
      <div className="ap-stat-l">{l}</div>
    </div>
  );
}
