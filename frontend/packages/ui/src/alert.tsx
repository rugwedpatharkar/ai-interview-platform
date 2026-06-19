import { type VariantProps, cva } from "class-variance-authority";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  type LucideIcon,
} from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "./cn.js";

const alertVariants = cva(
  "relative flex gap-3 rounded-lg border border-l-4 px-4 py-3 text-sm",
  {
    variants: {
      tone: {
        info: "border-info-border border-l-info bg-info-surface text-info-foreground",
        success:
          "border-success-border border-l-success bg-success-surface text-success-foreground",
        warning:
          "border-warning-border border-l-warning bg-warning-surface text-warning-foreground",
        danger:
          "border-danger-border border-l-danger bg-danger-surface text-danger-foreground",
      },
    },
    defaultVariants: { tone: "info" },
  },
);

const toneIcon: Record<NonNullable<VariantProps<typeof alertVariants>["tone"]>, LucideIcon> =
  {
    info: Info,
    success: CheckCircle2,
    warning: AlertTriangle,
    danger: AlertCircle,
  };

export interface AlertProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof alertVariants> {
  /** Optional bold heading rendered above the body. */
  title?: ReactNode;
}

export function Alert({ className, tone, title, children, ...props }: AlertProps) {
  const ToneIcon = toneIcon[tone ?? "info"];
  return (
    <div role="alert" className={cn(alertVariants({ tone }), className)} {...props}>
      <ToneIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="mb-0.5 font-medium">{title}</p>}
        {children}
      </div>
    </div>
  );
}
