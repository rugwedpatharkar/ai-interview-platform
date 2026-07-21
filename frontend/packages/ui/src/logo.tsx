import { cn } from "./cn.js";

const markSizes = { sm: "size-6", md: "size-7", lg: "size-9" } as const;
const textSizes = { sm: "text-sm", md: "text-base", lg: "text-lg" } as const;

/**
 * Brand mark — the Aptura **aperture** glyph: an outer ring + six iris blades,
 * drawn in `currentColor` so it takes the surrounding text/brand colour. Bare
 * by design (no tile) to match the landing mark everywhere. Pure inline SVG
 * (CSP-safe). Pass `spin` for the slow rotation used in the landing nav — it
 * animates via the shared `.mark .spin` keyframe inside a `.lucent .brand`.
 */
export function LogoMark({
  size = "md",
  spin = false,
  className,
}: {
  size?: keyof typeof markSizes;
  spin?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={cn("mark shrink-0", markSizes[size], className)}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" strokeWidth={3} />
      <g
        className={spin ? "spin" : undefined}
        stroke="currentColor"
        strokeWidth={2.6}
        strokeLinecap="round"
      >
        <line x1="43" y1="32" x2="55.4" y2="45.5" />
        <line x1="37.5" y1="41.5" x2="32" y2="59" />
        <line x1="26.5" y1="41.5" x2="8.6" y2="45.5" />
        <line x1="21" y1="32" x2="8.6" y2="18.5" />
        <line x1="26.5" y1="22.5" x2="32" y2="5" />
        <line x1="37.5" y1="22.5" x2="55.4" y2="18.5" />
      </g>
    </svg>
  );
}

/**
 * Full logo: mark + wordmark. `label` overrides the default wordmark text so
 * each app can brand itself. Set `markOnly` to hide the text.
 */
export function Logo({
  label = "Aptura",
  size = "md",
  markOnly = false,
  className,
}: {
  label?: string;
  size?: keyof typeof markSizes;
  markOnly?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={size} />
      {!markOnly && (
        <span
          className={cn(
            "font-display font-semibold tracking-tight text-foreground",
            textSizes[size],
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}
