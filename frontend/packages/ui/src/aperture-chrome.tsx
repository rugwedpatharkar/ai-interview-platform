// Backwards-compat facade: aperture-chrome.tsx used to hold MegaNav + MegaFooter
// + MarketingShell all in one "use client" file, which forced marketing/legal
// routes to hydrate the whole tree. The pieces now live in split files:
//
//   - mega-nav.tsx        · client (mobile menu owns useState)
//   - mega-footer.tsx     · server
//   - marketing-shell.tsx · server (composes both)
//
// Existing importers keep writing `import { MarketingShell } from "@ip/ui"`;
// this file just re-exports so no page had to change.

export { MegaNav, type MegaNavProps, type MegaNavLink, type LandingAudience } from "./mega-nav.js";
export { MegaFooter, type MegaFooterProps, type FooterColumn } from "./mega-footer.js";
export { MarketingShell, type MarketingShellProps } from "./marketing-shell.js";
