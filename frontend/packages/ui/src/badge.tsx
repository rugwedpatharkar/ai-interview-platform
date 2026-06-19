import { type VariantProps, cva } from "class-variance-authority";
import type { HTMLAttributes } from "react";

import { cn } from "./cn.js";

// `tone` picks the color family; `variant` picks the fill style. The default
// (subtle neutral) matches the original tinted pill so existing call sites are
// visually unchanged while solid/outline are now available.
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "",
        info: "",
        success: "",
        warning: "",
        danger: "",
      },
      variant: {
        subtle: "",
        solid: "text-white",
        outline: "border bg-transparent",
      },
    },
    compoundVariants: [
      // subtle (tinted surface + colored text)
      { tone: "neutral", variant: "subtle", class: "bg-surface-muted text-foreground" },
      { tone: "info", variant: "subtle", class: "bg-info-surface text-info-foreground" },
      {
        tone: "success",
        variant: "subtle",
        class: "bg-success-surface text-success-foreground",
      },
      {
        tone: "warning",
        variant: "subtle",
        class: "bg-warning-surface text-warning-foreground",
      },
      {
        tone: "danger",
        variant: "subtle",
        class: "bg-danger-surface text-danger-foreground",
      },
      // solid (filled)
      { tone: "neutral", variant: "solid", class: "bg-foreground text-background" },
      { tone: "info", variant: "solid", class: "bg-info" },
      { tone: "success", variant: "solid", class: "bg-success" },
      { tone: "warning", variant: "solid", class: "bg-warning text-warning-foreground" },
      { tone: "danger", variant: "solid", class: "bg-danger" },
      // outline (ring + colored text)
      { tone: "neutral", variant: "outline", class: "border-border text-foreground" },
      { tone: "info", variant: "outline", class: "border-info-border text-info-foreground" },
      {
        tone: "success",
        variant: "outline",
        class: "border-success-border text-success-foreground",
      },
      {
        tone: "warning",
        variant: "outline",
        class: "border-warning-border text-warning-foreground",
      },
      {
        tone: "danger",
        variant: "outline",
        class: "border-danger-border text-danger-foreground",
      },
    ],
    defaultVariants: { tone: "neutral", variant: "subtle" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;
export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone, variant }), className)} {...props} />
  );
}
