"use client";

import { applicationStatus } from "@ip/ui";
import type { FunnelAnalytics } from "@ip/api-client";
import { useMemo } from "react";

// Shared by the dashboard (`/`) and analytics (`/analytics`) so the hiring funnel
// renders identically in both places. Counts are int64 (bigint on the wire); widen to
// number for display + bar widths.
export function FunnelChart({ data }: { data: FunnelAnalytics }) {
  // Rows widened to numbers once per data snapshot — drives both bar widths and labels.
  const rows = useMemo(() => {
    const widened = data.states.map((s) => ({
      state: s.state,
      status: applicationStatus(s.state),
      count: Number(s.count),
    }));
    const max = Math.max(1, ...widened.map((r) => r.count));
    return widened.map((r) => ({ ...r, pct: (r.count / max) * 100 }));
  }, [data]);

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-xl font-semibold tracking-tight text-foreground">
          Hiring funnel
        </h3>
        <span className="rounded-md border border-border px-2 py-0.5 font-mono text-xs uppercase tracking-wide text-muted-foreground">
          Last 30 days
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No applications yet.</p>
      ) : (
        <>
          {/* Accessible alternative to the bar chart for screen readers. */}
          <p className="sr-only">
            Applications by stage:{" "}
            {rows.map((r) => `${r.status.label}, ${r.count}`).join("; ")}.
          </p>
          <ul aria-hidden className="flex flex-col gap-4">
            {rows.map((r) => (
              <li
                key={r.state}
                className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-4 sm:grid-cols-[9.5rem_1fr_3rem]"
              >
                <span className="text-sm font-medium tabular-nums text-muted-foreground">
                  {r.status.label}
                </span>
                <div className="h-3 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${r.pct}%` }}
                  />
                </div>
                <span className="text-right text-sm font-semibold tabular-nums text-foreground">
                  {r.count}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
