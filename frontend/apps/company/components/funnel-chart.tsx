import { applicationStatus } from "@ip/ui";
import type { FunnelAnalytics } from "@ip/api-client";

// Shared by the dashboard (`/`) and analytics (`/analytics`) so the hiring funnel
// renders identically in both places. Counts are int64 (bigint on the wire); widen to
// number for display + bar widths.
export function FunnelChart({ data }: { data: FunnelAnalytics }) {
  const max = data.states.reduce((m, s) => Math.max(m, Number(s.count)), 0) || 1;

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-display text-xl font-semibold tracking-tight text-foreground">
          Hiring funnel
        </h3>
        <span className="rounded-md border border-border px-2 py-0.5 font-mono text-xs uppercase tracking-wide text-muted-foreground">
          Last 30 days
        </span>
      </div>

      {data.states.length === 0 ? (
        <p className="text-sm text-muted-foreground">No applications yet.</p>
      ) : (
        <>
          {/* Accessible alternative to the bar chart for screen readers. */}
          <p className="sr-only">
            Applications by stage:{" "}
            {data.states
              .map((s) => `${applicationStatus(s.state).label}, ${Number(s.count)}`)
              .join("; ")}
            .
          </p>
          <ul aria-hidden className="flex flex-col gap-4">
            {data.states.map((s) => {
              const status = applicationStatus(s.state);
              const count = Number(s.count);
              return (
                <li
                  key={s.state}
                  className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-4 sm:grid-cols-[9.5rem_1fr_3rem]"
                >
                  <span className="text-sm font-medium text-muted-foreground">
                    {status.label}
                  </span>
                  <div className="h-3 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(count / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-right text-sm font-semibold tabular-nums text-foreground">
                    {count}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
