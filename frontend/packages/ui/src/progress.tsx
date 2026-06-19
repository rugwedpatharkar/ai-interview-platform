import type { HTMLAttributes } from "react";

import { cn } from "./cn.js";

const sizes = { sm: "h-1.5", md: "h-2", lg: "h-3" } as const;

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 0–100. Clamped. Omit for an indeterminate bar. */
  value?: number | null;
  size?: keyof typeof sizes;
}

/** Determinate (value 0–100) or indeterminate progress bar in the brand color. */
export function Progress({
  value,
  size = "md",
  className,
  ...props
}: ProgressProps) {
  const indeterminate = value == null;
  const pct = indeterminate ? 0 : Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : pct}
      className={cn(
        "w-full overflow-hidden rounded-full bg-surface-muted",
        sizes[size],
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-full bg-primary transition-[width] duration-300 ease-out",
          indeterminate && "w-2/5 animate-pulse !transition-none",
        )}
        style={indeterminate ? undefined : { width: `${pct}%` }}
      />
    </div>
  );
}
