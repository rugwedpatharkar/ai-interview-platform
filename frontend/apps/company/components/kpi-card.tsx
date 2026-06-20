import type { ComponentType, ReactNode } from "react";

import { cn } from "@ip/ui";

export interface KpiCardProps {
  label: string;
  value: ReactNode; // pre-formatted (e.g. "92%", "18h")
  hint?: string; // sub-caption under the value
  icon?: ComponentType<{ className?: string }>;
  tone?: "default" | "positive" | "warning" | "danger";
  className?: string;
}

// Tones reuse the @ip/ui status-foreground families (see badge.tsx); "default" is the
// plain foreground. Kept app-local rather than in @ip/ui to avoid cross-agent contention.
const TONE: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "text-muted-foreground",
  positive: "text-success-foreground",
  warning: "text-warning-foreground",
  danger: "text-danger-foreground",
};

// Midnight `.kpi` tile: icon-prefixed label, big serif tabular value, muted delta line.
export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: KpiCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface p-6",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon ? <Icon className="size-4" /> : null}
        <span>{label}</span>
      </div>
      <div className="mt-2 font-display text-3xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </div>
      {hint ? (
        <div className={cn("mt-1.5 text-sm tabular-nums", TONE[tone])}>{hint}</div>
      ) : null}
    </div>
  );
}
