import { APERTURE_MARK_VIEWBOX, ApertureMarkPaths } from "./aperture-mark-geometry.js";
import { cn } from "./cn.js";

const markSizes = { sm: "size-6", md: "size-7", lg: "size-9" } as const;
const textSizes = { sm: "text-sm", md: "text-base", lg: "text-lg" } as const;

/**
 * Brand mark — the Aptura **aperture** glyph, bare by design (no tile) so it
 * matches the landing mark everywhere. Geometry lives in
 * `aperture-mark-geometry.tsx`, shared with the `#ap-mark` sprite symbol. Pure
 * inline SVG (CSP-safe). Pass `spin` for the slow rotation used in the landing
 * nav — it animates via the shared `.mark .spin` keyframe inside `.lucent .brand`.
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
      viewBox={APERTURE_MARK_VIEWBOX}
      fill="none"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <ApertureMarkPaths spin={spin} />
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
