"use client";

import type { LucideIcon } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { cn } from "./cn.js";

export interface SidebarNavEntry {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  /** Optional trailing count badge (rendered by the app via `renderBadge`). */
  badge?: number;
}

export interface SidebarNavGroup {
  /** Section eyebrow shown above the group (e.g. "For you", "Hiring"). */
  title: string;
  items: SidebarNavEntry[];
}

/** Active-rail style for a sidebar nav item.
 *  - `before`: candidate's inset pseudo-element bar (needs the row `relative`).
 *  - `border`: company's `border-l` rail. */
export type SidebarNavAccent = "before" | "border";

/** Class string for a desktop sidebar nav row: the shared hover/press motion plus
 *  the active cyan left-accent. Returned as a string (not a wrapping element) so each
 *  app keeps its own Next.js `<Link>` for client-side navigation — only the styling is
 *  shared, navigation behavior is unchanged. */
export function sidebarNavItemClass(active: boolean, accent: SidebarNavAccent = "before"): string {
  // Active rail: candidate uses an inset pseudo-element bar; company a left border.
  const activeRail =
    accent === "before"
      ? "bg-surface-muted font-medium text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:content-['']"
      : "border-l-2 border-primary bg-surface-muted font-medium text-foreground";
  return cn(
    "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:bg-surface-muted hover:text-foreground active:scale-[0.99]",
    active && activeRail,
  );
}

/** Class string for a mobile nav-row link (the horizontal scroller shown < lg). */
export function sidebarMobileLinkClass(active: boolean, accent: SidebarNavAccent = "before"): string {
  const activeRail =
    accent === "before"
      ? "border-b-2 border-primary bg-surface-muted font-medium text-foreground"
      : "border-l-2 border-primary bg-surface-muted font-medium text-foreground";
  return cn(
    "shrink-0 rounded-md px-3 py-1.5 transition-colors duration-150 hover:bg-surface-muted hover:text-foreground active:scale-[0.99]",
    active && activeRail,
  );
}

/** Shared presentational frame for the signed-in app shells: the
 *  sidebar + topbar + content grid. Purely a layout skeleton — it owns no auth,
 *  role gating, or data. Each app passes its own brand, nav, topbar chrome, and
 *  sidebar footer, and renders nav items through `renderNavItem` so the app keeps
 *  ownership of badges and active-rail style. The mobile nav row is generated
 *  from the flattened `navGroups` via `renderMobileLink`. */
export function SidebarShell({
  brand,
  mobileBrand,
  navGroups,
  renderNavItem,
  renderMobileLink,
  sidebarFooter,
  topbar,
  children,
}: {
  /** Sidebar brand block (desktop, top of the rail). */
  brand: ReactNode;
  /** Brand shown in the mobile topbar where the sidebar is hidden. */
  mobileBrand: ReactNode;
  navGroups: SidebarNavGroup[];
  /** Render a desktop sidebar nav item (app owns badges + active-rail style). */
  renderNavItem: (item: SidebarNavEntry) => ReactNode;
  /** Render a single mobile nav-row link from a flattened nav entry. */
  renderMobileLink: (item: SidebarNavEntry) => ReactNode;
  /** Sidebar footer (user identity block). */
  sidebarFooter: ReactNode;
  /** Topbar content: breadcrumb + search + actions cluster. */
  topbar: ReactNode;
  children: ReactNode;
}) {
  const mobileItems = navGroups.flatMap((g) => g.items);
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[248px_1fr]">
      {/* Skip link — first focusable element; visually hidden until focused. */}
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-1 border-r border-border bg-surface px-4 py-5 lg:flex">
        {brand}
        {navGroups.map((group, gi) => (
          <Fragment key={group.title}>
            <p
              className={cn(
                "px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground",
                // First group hugs the brand (pt-2); later groups get a wider gap (pt-4).
                gi === 0 ? "pt-2" : "pt-4",
              )}
            >
              {group.title}
            </p>
            {group.items.map((item) => renderNavItem(item))}
          </Fragment>
        ))}
        <div className="mt-auto flex items-center gap-3 border-t border-border px-2 pt-4">
          {sidebarFooter}
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-border bg-surface/80 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
          {mobileBrand}
          {topbar}
        </header>

        {/* Mobile nav row — sidebar is hidden < lg, so surface the key links here. */}
        <nav aria-label="Primary" className="flex items-center gap-1 overflow-x-auto border-b border-border bg-surface px-4 py-2 text-sm text-muted-foreground lg:hidden">
          {mobileItems.map((item) => renderMobileLink(item))}
        </nav>

        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-6 py-8 focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
