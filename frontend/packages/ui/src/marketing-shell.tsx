// Server component — server-renders the shell so marketing/legal routes ship
// zero JS for the layout. Client-only pieces (MegaNav's mobile-menu toggle)
// hydrate as their own islands inside this tree.

import type { ReactNode } from "react";

import { MegaFooter, type MegaFooterProps } from "./mega-footer.js";
import { MegaNav, type MegaNavProps, type LandingAudience } from "./mega-nav.js";

export interface MarketingShellProps {
  children: ReactNode;
  audience?: LandingAudience;
  nav?: Partial<MegaNavProps>;
  footer?: Partial<MegaFooterProps>;
}

export function MarketingShell({
  children,
  audience,
  nav,
  footer,
}: MarketingShellProps) {
  return (
    <>
      {/* Skip-to-content: promised on /accessibility, visible only on keyboard focus. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink-deep focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
      >
        Skip to main content
      </a>
      <MegaNav audience={audience} {...nav} />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <MegaFooter audience={audience} {...footer} />
    </>
  );
}
