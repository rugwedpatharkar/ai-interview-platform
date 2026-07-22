/**
 * The one true Aptura aperture — an outer ring plus six iris spokes, drawn in
 * `currentColor` so it takes the surrounding text/brand colour.
 *
 * Both <LogoMark> (logo.tsx) and the `#ap-mark` sprite symbol (aperture-sprite.tsx)
 * render this. They previously carried independent copies that silently drifted
 * apart, so the path data lives here and nowhere else.
 */
export const APERTURE_MARK_VIEWBOX = "0 0 64 64";

export function ApertureMarkPaths({ spin = false }: { spin?: boolean }) {
  return (
    <>
      <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" strokeWidth="3" />
      <g
        className={spin ? "spin" : undefined}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      >
        <line x1="43" y1="32" x2="55.4" y2="45.5" />
        <line x1="37.5" y1="41.5" x2="32" y2="59" />
        <line x1="26.5" y1="41.5" x2="8.6" y2="45.5" />
        <line x1="21" y1="32" x2="8.6" y2="18.5" />
        <line x1="26.5" y1="22.5" x2="32" y2="5" />
        <line x1="37.5" y1="22.5" x2="55.4" y2="18.5" />
      </g>
    </>
  );
}
