import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  applicationStatus,
} from "@ip/ui";
import type { FunnelAnalytics } from "@ip/api-client";

// Shared by the dashboard (`/`) and analytics (`/analytics`) so the hiring funnel
// renders identically in both places. Counts are int64 (bigint on the wire); widen to
// number for display + bar widths.
export function FunnelChart({ data }: { data: FunnelAnalytics }) {
  const max = data.states.reduce((m, s) => Math.max(m, Number(s.count)), 0) || 1;

  return (
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
                .map((s) => `${applicationStatus(s.state).label}, ${Number(s.count)}`)
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
  );
}
