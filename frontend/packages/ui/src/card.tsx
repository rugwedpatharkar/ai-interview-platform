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
        // Lucent card standard — matches the .ap-cell primitive (22px radius +
        // --elev-1 depth) so every product card reads consistently app-wide.
        "rounded-[var(--rad-xl)] border border-border bg-surface shadow-elev-1",
        hoverable &&
          "transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-elev-2 active:scale-[0.99] active:shadow-elev-1",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
}

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Override the heading level. Defaults to "h2". Use "h1" on standalone pages
   *  that have no other h1 in scope (e.g. a full-page verify card). */
  as?: "h1" | "h2" | "h3" | "h4";
}

export function CardTitle({ className, as: Tag = "h2", ...props }: CardTitleProps) {
  return (
    <Tag
      className={cn(
        // Product register: card headings are sans (Geist), not the editorial serif.
        // Page-level titles/greetings opt into font-display explicitly where they want character.
        "text-lg font-semibold tracking-tight text-foreground",
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
