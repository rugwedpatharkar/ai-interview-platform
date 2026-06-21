"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ApIcon } from "./aperture-sprite.js";
import { cn } from "./cn.js";

/* ============================================================
   APTURA · v3 — Marketing chrome (public surfaces)
   UtilityRule  · top-most pre-launch announcement band
   MegaNav      · sticky blurred nav with mega-menu + dual CTAs
   MegaFooter   · 6-column sitemap with truthful badges
   ============================================================ */

/* ---------- UtilityRule ---------- */

export interface UtilityRuleProps {
  pill?: string;
  message?: string;
  href?: string;
  cta?: string;
}

export function UtilityRule({
  pill = "Pre-launch",
  message = "Aptura is opening pilots with a small set of teams hiring on proven merit.",
  href = "/pilot",
  cta = "Request a pilot →",
}: UtilityRuleProps) {
  return (
    <div className="border-b border-line bg-gradient-to-r from-bg via-surface-2 to-bg text-[var(--step--1)] text-ink-2">
      <div className="ap-wrap flex h-9 items-center gap-3 sm:gap-5">
        <span className="rounded-full bg-coral-soft px-2 py-0.5 text-[var(--step--2)] font-semibold tracking-wider text-coral">
          {pill}
        </span>
        <span className="hidden flex-1 truncate sm:inline">{message}</span>
        <span className="flex-1 sm:hidden" />
        <Link href={href} className="shrink-0 text-ink-2 transition-colors hover:text-ink-deep">
          {cta}
        </Link>
      </div>
    </div>
  );
}

/* ---------- MegaNav ---------- */

export type MegaItem = { title: string; subtitle: string; href: string; icon: string };
export type MegaColumn = { heading: string; items: MegaItem[] };

export interface MegaNavLink {
  label: string;
  href?: string;
  /** When provided, renders a mega-menu instead of a flat link. */
  mega?: MegaColumn[];
}

export interface MegaNavProps {
  links?: MegaNavLink[];
  showAudienceSwitch?: boolean;
  signInHref?: string;
  signInLabel?: string;
  primaryHref?: string;
  primaryLabel?: string;
}

const DEFAULT_LINKS: MegaNavLink[] = [
  {
    label: "Platform",
    mega: [
      {
        heading: "The product",
        items: [
          { title: "Proctored Interview", subtitle: "Live, fullscreen-locked. Camera + mic required.", href: "/trust", icon: "cam" },
          { title: "Integrity Report", subtitle: "Timeline + severity + evidence clips.", href: "/sample-report", icon: "shield-check" },
          { title: "Evidence-Based Scoring", subtitle: "Quoted transcript proof for every score.", href: "/sample-report", icon: "report" },
        ],
      },
      {
        heading: "Workflow",
        items: [
          { title: "Job Marketplace", subtitle: "Reach verified talent. Standalone today.", href: "/jobs", icon: "grid" },
          { title: "Pipeline & Decisions", subtitle: "Advisory recommendations, recruiter decides.", href: "/ai-explainability", icon: "users" },
          { title: "Always Answered", subtitle: "Outcome + feedback to every applicant.", href: "/what-we-dont-do", icon: "bell" },
        ],
      },
      {
        heading: "Trust",
        items: [
          { title: "Trust Architecture", subtitle: "How proctoring works — and what it doesn't do.", href: "/trust", icon: "shield" },
          { title: "AI Explainability", subtitle: "How recommendations are formed and reviewed.", href: "/ai-explainability", icon: "spark" },
          { title: "What Aptura does not do", subtitle: "The constraints we ship by design.", href: "/what-we-dont-do", icon: "globe" },
        ],
      },
    ],
  },
  { label: "How it works", href: "/trust" },
  { label: "Sample report", href: "/sample-report" },
  { label: "Compare", href: "/compare/take-home" },
  { label: "Accessibility", href: "/accessibility" },
];

export function MegaNav({
  links = DEFAULT_LINKS,
  showAudienceSwitch = true,
  signInHref = "/login",
  signInLabel = "Sign in",
  primaryHref = "/pilot",
  primaryLabel = "Book a pilot",
}: MegaNavProps) {
  const [audience, setAudience] = useState<"companies" | "candidates">("companies");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-[color-mix(in_oklch,var(--bg)_82%,transparent)] bg-bg/90">
      <div className="ap-wrap flex h-[72px] items-center gap-3 lg:gap-7">
        <Link
          href="/"
          className="flex items-center gap-2 text-[1.25rem] font-bold tracking-tight text-ink-deep"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <ApIcon name="mark" className="size-7 text-teal" />
          Aptura
        </Link>

        {/* Desktop nav */}
        <nav className="hidden flex-1 items-center gap-1 lg:flex" aria-label="Primary">
          {links.map((link) => (
            <MegaNavLinkItem key={link.label} link={link} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {showAudienceSwitch && (
            <div className="hidden rounded-full border border-line bg-surface-2 p-[3px] text-[0.84rem] sm:inline-flex">
              <button
                type="button"
                onClick={() => setAudience("companies")}
                aria-pressed={audience === "companies"}
                className={cn(
                  "rounded-full px-3 py-[6px] font-semibold transition-colors",
                  audience === "companies"
                    ? "bg-surface text-ink-deep shadow-[0_1px_0_var(--line)]"
                    : "text-ink-2 hover:text-ink-deep",
                )}
              >
                For Companies
              </button>
              <button
                type="button"
                onClick={() => setAudience("candidates")}
                aria-pressed={audience === "candidates"}
                className={cn(
                  "rounded-full px-3 py-[6px] font-semibold transition-colors",
                  audience === "candidates"
                    ? "bg-surface text-ink-deep shadow-[0_1px_0_var(--line)]"
                    : "text-ink-2 hover:text-ink-deep",
                )}
              >
                For Candidates
              </button>
            </div>
          )}
          <Link href={signInHref} className="ap-btn ap-btn-ghost ap-btn-sm hidden sm:inline-flex">
            {signInLabel}
          </Link>
          <Link
            href={audience === "candidates" ? "/waitlist" : primaryHref}
            className="ap-btn ap-btn-primary ap-btn-sm"
          >
            {audience === "candidates" ? "Join waitlist" : primaryLabel}
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
        <nav
          className="ap-wrap border-t border-line py-4 lg:hidden"
          aria-label="Primary mobile"
        >
          <ul className="flex flex-col gap-1">
            {links.map((link) => (
              <li key={link.label}>
                {link.mega ? (
                  <details className="group rounded-lg px-3 py-2 hover:bg-surface-2">
                    <summary className="flex cursor-pointer items-center gap-2 font-semibold text-ink-deep">
                      {link.label}
                      <ApIcon
                        name="arrow"
                        className="ml-auto size-4 text-ink-3 transition-transform group-open:rotate-90"
                      />
                    </summary>
                    <div className="mt-2 grid gap-2 pl-1">
                      {link.mega.flatMap((col) =>
                        col.items.map((item) => (
                          <Link
                            key={item.title}
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className="flex items-start gap-2 rounded-md px-2 py-2 text-sm text-ink-2 hover:bg-surface hover:text-ink-deep"
                          >
                            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-teal-soft text-teal">
                              <ApIcon name={item.icon} className="size-4" />
                            </span>
                            <span>
                              <span className="block font-semibold text-ink-deep">{item.title}</span>
                              <span className="block text-[0.8rem] leading-tight text-ink-2">{item.subtitle}</span>
                            </span>
                          </Link>
                        )),
                      )}
                    </div>
                  </details>
                ) : (
                  <Link
                    href={link.href ?? "#"}
                    onClick={() => setMobileOpen(false)}
                    className="block rounded-lg px-3 py-2 font-medium text-ink-2 hover:bg-surface-2 hover:text-ink-deep"
                  >
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
            <li className="mt-2 flex gap-2 border-t border-line pt-3">
              <Link href={signInHref} className="ap-btn ap-btn-ghost ap-btn-sm flex-1 justify-center">
                {signInLabel}
              </Link>
              <Link
                href={audience === "candidates" ? "/waitlist" : primaryHref}
                className="ap-btn ap-btn-primary ap-btn-sm flex-1 justify-center"
              >
                {audience === "candidates" ? "Join waitlist" : primaryLabel}
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}

function MegaNavLinkItem({ link }: { link: MegaNavLink }) {
  if (!link.mega) {
    return (
      <Link
        href={link.href ?? "#"}
        className="rounded-lg px-2.5 py-2 text-[0.96rem] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-deep"
      >
        {link.label}
      </Link>
    );
  }
  return (
    <div className="group relative">
      <button
        type="button"
        className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-[0.96rem] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink-deep"
      >
        {link.label}
        <span className="inline-block translate-y-[-2px] opacity-60 text-[10px]">▾</span>
      </button>
      <div className="invisible absolute left-1/2 top-full z-50 mt-1.5 w-[min(960px,calc(100vw-2rem))] -translate-x-1/2 translate-y-1 rounded-2xl border border-line bg-surface p-7 opacity-0 shadow-[0_30px_80px_-30px_color-mix(in_oklch,var(--ink-deep)_50%,transparent)] transition-all duration-200 ease-out group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 focus-within:visible focus-within:translate-y-0 focus-within:opacity-100">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6">
          {link.mega.map((col) => (
            <div key={col.heading}>
              <h4 className="mb-3 text-[0.78rem] font-semibold uppercase tracking-[0.14em] text-ink-3">
                {col.heading}
              </h4>
              <div className="grid gap-1">
                {col.items.map((item) => (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="grid grid-cols-[32px_1fr] gap-3 rounded-lg p-2 transition-colors hover:bg-surface-2"
                  >
                    <span className="grid size-8 place-items-center rounded-md bg-teal-soft text-teal">
                      <ApIcon name={item.icon} className="size-[18px]" />
                    </span>
                    <span>
                      <b className="block text-[0.95rem] font-semibold text-ink-deep">{item.title}</b>
                      <span className="block text-[0.85rem] leading-snug text-ink-2">{item.subtitle}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- MegaFooter ---------- */

export interface FooterColumn {
  heading: string;
  links: { label: string; href: string }[];
}

export interface MegaFooterProps {
  tagline?: string;
  badges?: { label: string; sub?: string }[];
  columns?: FooterColumn[];
  legalLinks?: { label: string; href: string }[];
  marker?: string;
}

const DEFAULT_COLUMNS: FooterColumn[] = [
  {
    heading: "Platform",
    links: [
      { label: "Proctored Interview", href: "/trust" },
      { label: "Integrity Report", href: "/sample-report" },
      { label: "Evidence Scoring", href: "/sample-report" },
      { label: "Marketplace", href: "/jobs" },
    ],
  },
  {
    heading: "For Candidates",
    links: [
      { label: "Find roles", href: "/jobs" },
      { label: "Practice interview", href: "/practice" },
      { label: "Join the waitlist", href: "/waitlist" },
      { label: "Accessibility & accommodations", href: "/accessibility" },
    ],
  },
  {
    heading: "For Companies",
    links: [
      { label: "Request a pilot", href: "/pilot" },
      { label: "Sample report", href: "/sample-report" },
      { label: "Integrations roadmap", href: "/trust" },
      { label: "Aptura vs. take-home tests", href: "/compare/take-home" },
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
      { label: "Sign in", href: "/login" },
      { label: "Contact sales", href: "/pilot" },
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
  tagline = "The hiring marketplace built on a verified interview. Cheat-proof by design. Answered, always. Pre-launch.",
  badges = DEFAULT_BADGES,
  columns = DEFAULT_COLUMNS,
  legalLinks = DEFAULT_LEGAL,
  marker = "v3 · Aperture Pro",
}: MegaFooterProps) {
  return (
    <footer className="mt-8 border-t border-line bg-surface-2 pt-14 pb-8">
      <div className="ap-wrap">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-[1.4fr_repeat(5,1fr)]">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1">
            <Link
              href="/"
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

          {columns.map((col) => (
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

/* ---------- MarketingShell — wraps a public page with UtilityRule + MegaNav + MegaFooter ---------- */

export interface MarketingShellProps {
  children: ReactNode;
  showUtilityRule?: boolean;
  nav?: Partial<MegaNavProps>;
  footer?: Partial<MegaFooterProps>;
}

export function MarketingShell({
  children,
  showUtilityRule = true,
  nav,
  footer,
}: MarketingShellProps) {
  return (
    <>
      {showUtilityRule && <UtilityRule />}
      <MegaNav {...nav} />
      <main>{children}</main>
      <MegaFooter {...footer} />
    </>
  );
}
