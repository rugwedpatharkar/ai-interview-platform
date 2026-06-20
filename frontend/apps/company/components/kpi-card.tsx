"use client";

import type { ComponentType, ReactNode } from "react";

import { cn } from "@ip/ui";
import { useCountUp } from "@ip/shared";

export interface KpiCardProps {
  label: string;
  value: ReactNode; // pre-formatted string (e.g. "92%", "18h") or a raw number to count up
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

// Raw numeric values count up on mount; pre-formatted strings (e.g. "92%") render as-is.
function KpiValue({ value }: { value: ReactNode }) {
  const animated = useCountUp(typeof value === "number" ? value : 0);
  return <>{typeof value === "number" ? Math.round(animated) : value}</>;
}

// Midnight `.kpi` tile: icon-prefixed label, big sans tabular value, muted delta line.
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
      <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
        <KpiValue value={value} />
      </div>
      {hint ? (
        <div className={cn("mt-1.5 text-sm tabular-nums", TONE[tone])}>{hint}</div>
      ) : null}
    </div>
  );
}
