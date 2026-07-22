import { APERTURE_MARK_VIEWBOX, ApertureMarkPaths } from "./aperture-mark-geometry.js";

/**
 * APTURA · v3 — single SVG sprite mounted once in the root layout.
 * Every Aperture Pro component references icons via <svg><use href="#…"/></svg>.
 * Keep additions alphabetized within their group.
 */
export function ApertureSprite() {
  return (
    <svg
      width={0}
      height={0}
      aria-hidden
      focusable={false}
      style={{ position: "absolute", width: 0, height: 0 }}
    >
      <defs>
        {/* Aperture brand mark — geometry shared with <LogoMark>, single-sourced. */}
        <symbol id="ap-mark" viewBox={APERTURE_MARK_VIEWBOX}>
          <ApertureMarkPaths />
        </symbol>

        {/* Lucide-style outline glyphs */}
        <symbol id="ap-check" viewBox="0 0 24 24">
          <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </symbol>
        <symbol id="ap-x" viewBox="0 0 24 24">
          <path fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
        </symbol>
        <symbol id="ap-shield" viewBox="0 0 24 24">
          <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6z" />
        </symbol>
        <symbol id="ap-shield-check" viewBox="0 0 24 24">
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6z" />
            <path d="M9 12l2 2 4-4" />
          </g>
        </symbol>
        <symbol id="ap-lock" viewBox="0 0 24 24">
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 1 1 8 0v3" />
          </g>
        </symbol>
        <symbol id="ap-cam" viewBox="0 0 24 24">
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="14" height="12" rx="2" />
            <path d="M22 8l-6 4 6 4z" />
          </g>
        </symbol>
        <symbol id="ap-mic" viewBox="0 0 24 24">
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </g>
        </symbol>
        <symbol id="ap-bolt" viewBox="0 0 24 24">
          <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M13 2L4 14h7l-1 8 9-12h-7z" />
        </symbol>
        <symbol id="ap-user" viewBox="0 0 24 24">
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
          </g>
        </symbol>
        <symbol id="ap-users" viewBox="0 0 24 24">
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2 20c1.2-3.5 3.6-5.5 7-5.5s5.8 2 7 5.5" />
            <circle cx="17" cy="10" r="2.5" />
            <path d="M16 14.5c2.5.4 4 1.9 5 4.5" />
          </g>
        </symbol>
        <symbol id="ap-report" viewBox="0 0 24 24">
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
            <path d="M9 12h6M9 16h6M9 8h3" />
          </g>
        </symbol>
        <symbol id="ap-timer" viewBox="0 0 24 24">
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v5M9 2h6" />
          </g>
        </symbol>
        <symbol id="ap-bell" viewBox="0 0 24 24">
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 16V11a6 6 0 1 0-12 0v5l-2 3h16l-2-3z" />
            <path d="M10 21h4" />
          </g>
        </symbol>
        <symbol id="ap-globe" viewBox="0 0 24 24">
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18" />
          </g>
        </symbol>
        <symbol id="ap-dl" viewBox="0 0 24 24">
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12M7 11l5 5 5-5" />
            <path d="M5 19h14" />
          </g>
        </symbol>
        <symbol id="ap-arrow" viewBox="0 0 24 24">
          <path fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
        </symbol>
        <symbol id="ap-building" viewBox="0 0 24 24">
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21h18M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 21V11a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v10" />
            <path d="M8 7h4M8 11h4M8 15h4" />
          </g>
        </symbol>
        <symbol id="ap-heart" viewBox="0 0 24 24">
          <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.7A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" />
        </symbol>
        <symbol id="ap-academy" viewBox="0 0 24 24">
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-4 9 4-9 4-9-4z" />
            <path d="M7 11v5c2 1.5 8 1.5 10 0v-5" />
          </g>
        </symbol>
        <symbol id="ap-dollar" viewBox="0 0 24 24">
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v10M15 9.5c-.5-1.2-1.6-2-3-2-1.7 0-3 1-3 2.3 0 1.4 1.3 2 3 2.4 1.7.4 3 1 3 2.4S13.7 17 12 17c-1.4 0-2.5-.8-3-2" />
          </g>
        </symbol>
        <symbol id="ap-bag" viewBox="0 0 24 24">
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h16l-1 13H5L4 8z" />
            <path d="M9 8V5a3 3 0 0 1 6 0v3" />
          </g>
        </symbol>
        <symbol id="ap-chip" viewBox="0 0 24 24">
          <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="6" width="12" height="12" rx="2" />
            <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
          </g>
        </symbol>
        <symbol id="ap-menu" viewBox="0 0 24 24">
          <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
        </symbol>
      </defs>
    </svg>
  );
}

/** All sprite ids defined in <ApertureSprite>. Unknown names are a type error. */
export type ApIconName =
  | "mark"
  | "check"
  | "x"
  | "shield"
  | "shield-check"
  | "lock"
  | "cam"
  | "mic"
  | "bolt"
  | "user"
  | "users"
  | "report"
  | "timer"
  | "bell"
  | "globe"
  | "dl"
  | "arrow"
  | "building"
  | "heart"
  | "academy"
  | "dollar"
  | "bag"
  | "chip"
  | "menu";

/** Shorthand <ApIcon name="check" /> for component-internal use. */
export function ApIcon({
  name,
  className,
  ...rest
}: { name: ApIconName } & React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg className={className} aria-hidden focusable={false} {...rest}>
      <use href={`#ap-${name}`} />
    </svg>
  );
}
