import { cn } from "./cn.js";

const markSizes = { sm: "size-6", md: "size-7", lg: "size-9" } as const;
const textSizes = { sm: "text-sm", md: "text-base", lg: "text-lg" } as const;

/**
 * Brand mark — a rounded violet tile with a stylised spark glyph. Standalone,
 * or paired with the wordmark via <Logo>. Pure inline SVG (CSP-safe).
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
        "inline-flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm",
        markSizes[size],
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="size-[62%]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 2.5l1.9 5.2a4 4 0 0 0 2.4 2.4L21.5 12l-5.2 1.9a4 4 0 0 0-2.4 2.4L12 21.5l-1.9-5.2a4 4 0 0 0-2.4-2.4L2.5 12l5.2-1.9a4 4 0 0 0 2.4-2.4L12 2.5z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

/**
 * Full logo: mark + wordmark. `label` overrides the default wordmark text so
 * each app can brand itself. Set `markOnly` to hide the text.
 */
export function Logo({
  label = "Interview Platform",
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
