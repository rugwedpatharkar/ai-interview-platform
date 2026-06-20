import { cn } from "@ip/ui";

/** Pure geometry for the donut — exported so it stays trivially reasoned-about. */
export function ringGeometry(value: number, size: number, stroke: number) {
  const v = Math.min(1, Math.max(0, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return { radius, circumference, offset: circumference * (1 - v) };
}

const TONE = {
  brand: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
} as const;

export interface ScoreRingProps {
  /** 0..1 */
  value: number;
  size?: number; // px, default 96
  stroke?: number; // px, default 8
  tone?: keyof typeof TONE;
  label?: string; // centered caption under the % (e.g. "Overall")
  className?: string;
}

/** Circular score donut. Renders `value` as a percentage with an accessible label. */
export function ScoreRing({
  value,
  size = 96,
  stroke = 8,
  tone = "brand",
  label,
  className,
}: ScoreRingProps) {
  const { radius, circumference, offset } = ringGeometry(value, size, stroke);
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const c = size / 2;
  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      role="img"
      aria-label={`${label ? label + " " : ""}score ${pct} percent`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={c}
          cy={c}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-muted"
        />
        <circle
          cx={c}
          cy={c}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(
            "transition-[stroke-dashoffset] duration-[350ms] ease-out",
            TONE[tone],
            "stroke-current",
          )}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span
          className="font-display font-semibold tabular-nums text-foreground"
          style={{ fontSize: Math.max(16, Math.round(size * 0.28)) }}
        >
          {pct}
          <span className="text-[0.6em] text-muted-foreground">%</span>
        </span>
        {label && (
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
