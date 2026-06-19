import type { HTMLAttributes } from "react";

import { cn } from "./cn.js";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds a subtle lift + shadow on hover (good for clickable cards). */
  hoverable?: boolean;
}

export function Card({ className, hoverable, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface shadow-sm",
        hoverable &&
          "transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "font-display text-xl font-semibold tracking-tight text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}
