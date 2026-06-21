"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ApIcon } from "./aperture-sprite.js";

/* ============================================================
   APTURA · v3 — Marketing chrome (public surfaces)
   MegaNav      · sticky blurred nav with audience-aware links + side-switcher
   MegaFooter   · 4-column sitemap with audience-aware first column
   MarketingShell · wraps a public page with MegaNav + MegaFooter
   ============================================================ */

export type LandingAudience = "applicants" | "hiring-teams";

/* ---------- MegaNav ---------- */

export interface MegaNavLink {
  label: string;
  href?: string;
}

const APPLICANTS_LINKS: MegaNavLink[] = [
  { label: "How it works", href: "/#journey" },
  { label: "Sample report", href: "/sample-report" },
  { label: "Privacy", href: "/what-we-dont-do" },
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
          <ApIcon name="mark" className="size-7 text-teal" />
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
            onClick={() => setMobileOpen((v) => !v)}
            className="ap-btn ap-btn-ghost ap-btn-sm flex h-10 w-10 items-center justify-center p-0 lg:hidden"
          >
            <ApIcon name="menu" className="size-5 text-ink-deep" />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="ap-wrap border-t border-line py-4 lg:hidden" aria-label="Primary mobile">
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

/* ---------- MegaFooter ---------- */

export interface FooterColumn {
  heading: string;
  links: { label: string; href: string }[];
}

export interface MegaFooterProps {
  audience?: LandingAudience;
  tagline?: string;
  badges?: { label: string; sub?: string }[];
  columns?: FooterColumn[];
  legalLinks?: { label: string; href: string }[];
  marker?: string;
}

const APPLICANT_COLUMNS: FooterColumn[] = [
  {
    heading: "For applicants",
    links: [
      { label: "Find roles", href: "/jobs" },
      { label: "Practice interview", href: "/practice" },
      { label: "Join the waitlist", href: "/waitlist" },
      { label: "Accessibility & accommodations", href: "/accessibility" },
    ],
  },
  {
    heading: "For hiring teams",
    links: [
      { label: "How it works", href: "/hiring-teams" },
      { label: "Request a pilot", href: "/pilot" },
      { label: "Sample report", href: "/sample-report" },
    ],
  },
  {
    heading: "Trust",
    links: [
      { label: "Trust Architecture", href: "/trust" },
      { label: "AI Explainability Statement", href: "/ai-explainability" },
      { label: "What Aptura does not do", href: "/what-we-dont-do" },
      { label: "Status", href: "/status" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Sign in", href: "/#sign-in" },
      { label: "Contact", href: "/pilot" },
    ],
  },
];

const HIRING_TEAMS_COLUMNS: FooterColumn[] = [
  {
    heading: "For hiring teams",
    links: [
      { label: "Book a pilot", href: "/pilot" },
      { label: "Sample report", href: "/sample-report" },
      { label: "Integrations roadmap", href: "/trust" },
      { label: "Aptura vs. take-home tests", href: "/compare/take-home" },
    ],
  },
  {
    heading: "For applicants",
    links: [
      { label: "Find roles", href: "/jobs" },
      { label: "Practice interview", href: "/practice" },
      { label: "Join the waitlist", href: "/waitlist" },
    ],
  },
  {
    heading: "Trust",
    links: [
      { label: "Trust Architecture", href: "/trust" },
      { label: "AI Explainability Statement", href: "/ai-explainability" },
      { label: "What Aptura does not do", href: "/what-we-dont-do" },
      { label: "Status", href: "/status" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Sign in", href: "/hiring-teams#sign-in" },
      { label: "Contact", href: "/pilot" },
    ],
  },
];

const DEFAULT_BADGES = [
  { label: "GDPR", sub: "design-aligned" },
  { label: "WCAG 2.2 AA", sub: "target" },
  { label: "SOC 2", sub: "on the roadmap" },
];

const DEFAULT_LEGAL = [
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Cookies", href: "/cookies" },
  { label: "DPA", href: "/dpa" },
];

export function MegaFooter({
  audience = "applicants",
  tagline = "The hiring marketplace built on a verified interview. Cheat-proof by design. Answered, always. Pre-launch.",
  badges = DEFAULT_BADGES,
  columns,
  legalLinks = DEFAULT_LEGAL,
  marker = "v3 · Aperture Pro",
}: MegaFooterProps) {
  const cols =
    columns ?? (audience === "hiring-teams" ? HIRING_TEAMS_COLUMNS : APPLICANT_COLUMNS);
  return (
    <footer className="mt-8 border-t border-line bg-surface-2 pt-14 pb-8">
      <div className="ap-wrap">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Link
              href={audience === "hiring-teams" ? "/hiring-teams" : "/"}
              className="flex items-center gap-2 text-[1.1rem] font-bold tracking-tight text-ink-deep"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <ApIcon name="mark" className="size-7 text-teal" />
              Aptura
            </Link>
            <p className="mt-3 max-w-[30ch] text-[0.9rem] leading-snug text-ink-2">{tagline}</p>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
              {badges.map((b) => (
                <span key={b.label} className="ap-badge">
                  <ApIcon name="shield-check" />
                  <b>{b.label}</b>
                  {b.sub ? <span>{b.sub}</span> : null}
                </span>
              ))}
            </div>
          </div>

          {cols.map((col) => (
            <div key={col.heading} className="min-w-0">
              <h5
                className="mb-3 text-[0.9rem] font-semibold tracking-[-0.005em] text-ink-deep"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {col.heading}
              </h5>
              <div className="grid gap-1">
                {col.links.map((l) => (
                  <Link
                    key={l.label}
                    href={l.href}
                    className="block py-1 text-[0.92rem] text-ink-2 transition-colors hover:text-ink-deep"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-[0.86rem] text-ink-3">
          <span>© 2026 Aptura, Inc.</span>
          <span className="flex flex-wrap gap-x-5 gap-y-2">
            {legalLinks.map((l) => (
              <Link key={l.label} href={l.href} className="text-ink-3 transition-colors hover:text-ink-deep">
                {l.label}
              </Link>
            ))}
            <span className="font-mono" style={{ fontFamily: "var(--font-mono)" }}>
              {marker}
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}

/* ---------- MarketingShell — wraps a public page with MegaNav + MegaFooter ---------- */

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
      <MegaNav audience={audience} {...nav} />
      <main>{children}</main>
      <MegaFooter audience={audience} {...footer} />
    </>
  );
}
