import type { ComponentType, ReactNode } from "react";

import { Card, CardContent, cn } from "@ip/ui";

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
  default: "text-foreground",
  positive: "text-success-foreground",
  warning: "text-warning-foreground",
  danger: "text-danger-foreground",
};

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: KpiCardProps) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
        </div>
        <span className={cn("text-3xl font-semibold tabular-nums", TONE[tone])}>
          {value}
        </span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </CardContent>
    </Card>
  );
}
