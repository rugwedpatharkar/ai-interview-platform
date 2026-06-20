import { cn } from "./cn.js";

const markSizes = { sm: "size-6", md: "size-7", lg: "size-9" } as const;
const textSizes = { sm: "text-sm", md: "text-base", lg: "text-lg" } as const;

/**
 * Brand mark — a rounded Midnight tile with the Aptura **aperture/lens** glyph.
 * Standalone, or paired with the wordmark via <Logo>. Pure inline SVG (CSP-safe).
 */
export function LogoMark({
  size = "md",
  className,
}: {
  size?: keyof typeof markSizes;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm",
        markSizes[size],
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[64%]"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Aperture/lens — outer ring + six iris blades. */}
        <circle cx="12" cy="12" r="10" />
        <path d="M14.31 8l5.74 9.94" />
        <path d="M9.69 8h11.48" />
        <path d="M7.38 12l5.74-9.94" />
        <path d="M9.69 16L3.95 6.06" />
        <path d="M14.31 16H2.83" />
        <path d="M16.62 12l-5.74 9.94" />
      </svg>
    </span>
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
