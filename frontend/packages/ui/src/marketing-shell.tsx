// Server component — server-renders the shell so marketing/legal routes ship
// zero JS for the layout. Client-only pieces (MegaNav's mobile-menu toggle)
// hydrate as their own islands inside this tree.

import type { ReactNode } from "react";

import { MegaFooter, type MegaFooterProps } from "./mega-footer.js";
import { MegaNav, type MegaNavProps, type LandingAudience } from "./mega-nav.js";
import { SkipToContent } from "./skip-to-content.js";

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
      <SkipToContent />
      <MegaNav audience={audience} {...nav} />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <MegaFooter audience={audience} {...footer} />
    </>
  );
}
