import { type VariantProps, cva } from "class-variance-authority";
import type { HTMLAttributes, ReactNode, SVGAttributes } from "react";

import { cn } from "./cn.js";
import { AlertCircleIcon } from "./internal-icons.js";

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

function SvgBase({ children, ...props }: SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

function InfoIcon(props: SVGAttributes<SVGSVGElement>) {
  return (
    <SvgBase {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </SvgBase>
  );
}

function CheckCircle2Icon(props: SVGAttributes<SVGSVGElement>) {
  return (
    <SvgBase {...props}>
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      <path d="m9 12 2 2 4-4" />
    </SvgBase>
  );
}

function AlertTriangleIcon(props: SVGAttributes<SVGSVGElement>) {
  return (
    <SvgBase {...props}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </SvgBase>
  );
}

type ToneKey = NonNullable<VariantProps<typeof alertVariants>["tone"]>;

const toneIcon: Record<ToneKey, (props: SVGAttributes<SVGSVGElement>) => React.ReactElement> = {
  info: InfoIcon,
  success: CheckCircle2Icon,
  warning: AlertTriangleIcon,
  danger: AlertCircleIcon,
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
