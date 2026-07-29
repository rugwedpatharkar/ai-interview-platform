"use client";

import { useState } from "react";
import Link from "next/link";
import { ApIcon } from "./aperture-sprite.js";

/* ============================================================
   APTURA · v3 — Marketing top nav
   Sticky blurred nav with audience-aware links + side-switcher.
   Client-only because the mobile menu toggle owns useState — this
   is the ONE piece of aperture-chrome that actually needs the
   client boundary; MegaFooter + MarketingShell now live in server
   components so marketing/legal routes ship less JS.
   ============================================================ */

export type LandingAudience = "applicants" | "hiring-teams";

export interface MegaNavLink {
  label: string;
  href?: string;
}

const APPLICANTS_LINKS: MegaNavLink[] = [
  { label: "How it works", href: "/#journey" },
  { label: "Sample report", href: "/sample-report" },
  { label: "Privacy", href: "/privacy" },
  { label: "Accessibility", href: "/accessibility" },
];

const HIRING_TEAMS_LINKS: MegaNavLink[] = [
  { label: "How it works", href: "/hiring-teams#how" },
  { label: "Sample report", href: "/sample-report" },
  { label: "Compare", href: "/compare/take-home" },
  { label: "Trust", href: "/trust" },
];

export interface MegaNavProps {
  audience?: LandingAudience;
  links?: MegaNavLink[];
}

export function MegaNav({ audience = "applicants", links }: MegaNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navLinks =
    links ??
    (audience === "hiring-teams" ? HIRING_TEAMS_LINKS : APPLICANTS_LINKS);
  const brandHref = audience === "hiring-teams" ? "/hiring-teams" : "/";
  const switcherHref = audience === "hiring-teams" ? "/" : "/hiring-teams";
  const switcherLabel =
    audience === "hiring-teams" ? "For applicants →" : "For hiring teams →";
  // Coral switcher on applicants page (points to hiring teams = teal world);
  // teal switcher on hiring teams page (points to applicants = coral world).
  const switcherTone =
    audience === "hiring-teams" ? "ap-pill--teal" : "ap-pill--coral";

  return (
    <header className="sticky top-0 z-40 border-b border-line backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-[color-mix(in_oklch,var(--bg)_82%,transparent)] bg-bg/90">
      <div className="ap-wrap flex h-[72px] items-center gap-3 lg:gap-7">
        <Link
          href={brandHref}
          className="flex items-center gap-2 text-[1.25rem] font-bold tracking-tight text-ink-deep"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <ApIcon name="mark" className="size-7 text-brand" />
          Aptura
        </Link>

        <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="Primary">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href ?? "#"}
              className="rounded-lg px-2.5 py-2 text-[0.96rem] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-deep"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Link
            href={switcherHref}
            className={`ap-pill ${switcherTone} hidden sm:inline-flex`}
            data-testid="side-switcher"
          >
            {switcherLabel}
          </Link>
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            aria-controls="ap-mobile-nav"
            onClick={() => setMobileOpen((v) => !v)}
            className="ap-btn ap-btn-ghost ap-btn-sm flex h-10 w-10 items-center justify-center p-0 lg:hidden"
          >
            <ApIcon name="menu" className="size-5 text-ink-deep" />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav id="ap-mobile-nav" className="ap-wrap border-t border-line py-4 lg:hidden" aria-label="Primary mobile">
          <ul className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <li key={link.label}>
                <Link
                  href={link.href ?? "#"}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-lg px-3 py-2 font-medium text-ink-2 hover:bg-surface-2 hover:text-ink-deep"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="mt-2 border-t border-line pt-3">
              <Link
                href={switcherHref}
                onClick={() => setMobileOpen(false)}
                className={`ap-pill ${switcherTone} block w-full text-center`}
              >
                {switcherLabel}
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
