import type { HTMLAttributes } from "react";

import { cn } from "./cn.js";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // Directional shimmer sweep over a muted base; the ::before freezes off-screen
        // under prefers-reduced-motion (global rule zeroes the duration), leaving a calm base.
        "relative isolate overflow-hidden rounded-md bg-surface-muted",
        "before:absolute before:inset-0 before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-foreground/10 before:to-transparent before:content-['']",
        className,
      )}
      {...props}
    />
  );
}
