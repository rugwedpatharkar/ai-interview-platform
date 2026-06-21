# Two-Sided Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Aptura's single dual-audience marketing landing into two audience-narrative landings — `/` for **applicants** (the brand thesis: every applicant gets answered) and `/hiring-teams` for the buyer side (the existing 16-section Aperture Pro landing, recruiter-framed) — with a shared mid-page sign-in band, an audience-aware nav, and the persistent pre-launch utility rule deleted.

**Architecture:** All work lives in `frontend/apps/candidate/` and `frontend/packages/ui/`. The current `marketing-landing.tsx` is decomposed into two compositions plus 11 new components (mostly applicant-side) and several existing components reused as-is. `MegaNav` and `MarketingShell` get an `audience` prop; `<UtilityRule/>` is deleted entirely. Sign-in band reuses the existing `Auth.login` RPC seam — zero backend changes.

**Tech Stack:** Next.js 15 (App Router) · React 19 · Tailwind v4 (with the existing `.ap-*` component-class layer in `globals.css`) · TanStack Query (already wired) · `@ip/api-client` (`api.auth.*`) · `@ip/shared` (`useAuth`, `errorMessage`).

## Global Constraints

These apply to **every task** (copied verbatim from the spec):

- **Backend frozen.** No changes under `src/`, `*.proto`, `packages/api-client/src/gen/*`, or any RPC contracts. Sign-in band MUST reuse the existing `useAuth().login(email, password)` seam.
- **Pre-launch posture.** No SLA claims ("within X days"), no fake customer logos, no unearned certifications. Empty/neutral states are honest ("never silence", "the same way for every applicant").
- **No "Book a demo" copy anywhere.** Confirmed zero instances in active code; the rule prevents regression. All buyer CTAs say **"Book a pilot"**.
- **No `<UtilityRule/>` after this PR.** The component is deleted from `@ip/ui` entirely. Every public surface loses the pre-launch announcement strip above the nav.
- **Terminology: Applicants / Hiring teams.** Never "candidates" or "companies" in any new marketing copy. (Internal type names — `role: "candidate" | "recruiter" | "company_admin"` from the auth schema — are unchanged; they're not user-visible.)
- **`/` is the Applicants landing.** `/hiring-teams` is the buyer landing. Post-login role routing unchanged (applicant → `/`, recruiter / `company_admin` → `/company`).
- **No sign-in button in top nav.** Sign-in lives only in the hero (anchor link to `#sign-in`) and the dedicated mid-page sign-in band.
- **Spec is canon:** [`docs/superpowers/specs/2026-06-21-two-sided-landing-design.md`](../specs/2026-06-21-two-sided-landing-design.md). If anything in this plan conflicts with the spec, the spec wins.
- **Verify per task:** `npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit` must return 0 errors after every task. Never run `next build` while `pnpm dev` is live.

---

## File Structure

**To create (12 new files):**

| File | Responsibility |
|---|---|
| `frontend/packages/ui/src/sign-in-band.tsx` | Shared mid-page sign-in band; takes `audience` prop; reuses `useAuth().login` |
| `frontend/apps/candidate/app/(marketing)/applicants-landing.tsx` | Composition file for `/` — wires the 12-section applicants spine |
| `frontend/apps/candidate/app/hiring-teams/page.tsx` | Route file for `/hiring-teams` — composes the 17-section buyer spine |
| `frontend/apps/candidate/components/marketing/applicants-hero.tsx` | Applicants-side hero (headline + dual CTA + reframed InterviewHud) |
| `frontend/apps/candidate/components/marketing/applicant-journey.tsx` | 5-act applicant journey (browse → apply → practice → interview → answer) |
| `frontend/apps/candidate/components/marketing/no-ghosting-promise.tsx` | Coral hero panel — brand-defining moment |
| `frontend/apps/candidate/components/marketing/accommodations.tsx` | 4-commitment grid |
| `frontend/apps/candidate/components/marketing/practice-spotlight.tsx` | Free practice round CTA card |
| `frontend/apps/candidate/components/marketing/privacy-panel.tsx` | Extracted privacy-only half of the existing DefenseSplit (reused by both landings) |
| `frontend/apps/candidate/components/marketing/hiring-teams-hero.tsx` | Renamed from existing `<Hero/>` inside `marketing-landing.tsx`; buyer-framed |
| `frontend/apps/candidate/components/marketing/hiring-teams-final-cta.tsx` | Renamed from existing `<FinalCta/>`; teal gradient, single audience |
| `frontend/apps/candidate/components/marketing/applicant-final-cta.tsx` | Coral gradient final CTA + cross-link to /hiring-teams |

**To modify (3 files):**

| File | Change |
|---|---|
| `frontend/packages/ui/src/aperture-chrome.tsx` | Add `audience` prop to `MegaNav` and `MarketingShell`; DELETE `UtilityRule` export and its usage; swap nav links + side-switcher per audience |
| `frontend/packages/ui/src/index.ts` | Remove `UtilityRule` + `UtilityRuleProps` exports; add `SignInBand` export |
| `frontend/apps/candidate/app/page.tsx` | Change signed-out branch to render `<ApplicantsLanding/>` instead of `<MarketingLanding/>` |

**To delete (1 file):**

| File | Reason |
|---|---|
| `frontend/apps/candidate/app/(marketing)/marketing-landing.tsx` | Decomposed — its sections are now split between `applicants-landing.tsx` and `hiring-teams/page.tsx` |

**Untouched (explicit):** `frontend/packages/api-client/*`, `frontend/packages/shared/*`, `frontend/apps/company/*`, all auth pages (`/login`, `/register`, `/forgot`, `/reset`, `/verify`, `/auth/callback`), all authenticated screens, all backend (`src/`, `*.proto`).

---

## Phase 1 — Foundation (chrome + sign-in band, both landings depend on these)

### Task 1: Drop `UtilityRule` from `@ip/ui` and add `audience` prop to `MegaNav` + `MarketingShell`

**Files:**
- Modify: `frontend/packages/ui/src/aperture-chrome.tsx`
- Modify: `frontend/packages/ui/src/index.ts`

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `<MegaNav audience="applicants" | "hiring-teams" />` — swaps the sub-page link list + the right-edge side-switcher button per audience
  - `<MarketingShell audience="applicants" | "hiring-teams">{children}</MarketingShell>` — wraps page in nav + footer; no longer renders `UtilityRule`
  - The component `UtilityRule` and type `UtilityRuleProps` are NO LONGER exported. Imports of them will fail to compile (intentional — surfaces every remaining call site).

- [ ] **Step 1: Delete `<UtilityRule/>` from the shell and stop rendering it**

Edit `frontend/packages/ui/src/aperture-chrome.tsx`. Find the `MarketingShell` component:

```tsx
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
```

Replace with:

```tsx
export type LandingAudience = "applicants" | "hiring-teams";

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
```

Also delete the entire `UtilityRule` function and its `UtilityRuleProps` interface from this file.

- [ ] **Step 2: Add `audience` to `MegaNav` and swap links + side-switcher**

Still in `aperture-chrome.tsx`. The existing `MegaNav` has a fixed `DEFAULT_LINKS` array, fixed audience switch, and a primary CTA. Replace the whole `MegaNav` signature + body with an audience-aware version:

```tsx
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
```

Also delete the old `MegaPanel`, `MegaNavLinkItem`, `DEFAULT_LINKS`, audience-switch state, `Sign in` link, and primary CTA from inside the old `MegaNav` — they're all gone in the new minimal nav.

Keep `MegaNavLink`, `MegaColumn`, `MegaItem`, `UtilityRuleProps` interfaces only if referenced elsewhere; delete `UtilityRuleProps`.

- [ ] **Step 3: Add `audience` to `MegaFooter`**

In the same file, the existing `MegaFooter` has fixed `DEFAULT_COLUMNS`. Add the `audience` prop and reorder columns per spec §3.4:

```tsx
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
  // …rest of existing render body, replacing `DEFAULT_COLUMNS` with `cols`…
}
```

Keep `DEFAULT_BADGES` and `DEFAULT_LEGAL` as-is. Delete the old `DEFAULT_COLUMNS` (it's replaced by the two per-audience arrays).

- [ ] **Step 4: Update `index.ts` exports**

Edit `frontend/packages/ui/src/index.ts`. Find the aperture-chrome re-export block:

```tsx
export {
  UtilityRule,
  type UtilityRuleProps,
  MegaNav,
  type MegaNavProps,
  type MegaNavLink,
  type MegaColumn,
  type MegaItem,
  MegaFooter,
  type MegaFooterProps,
  type FooterColumn,
  MarketingShell,
  type MarketingShellProps,
} from "./aperture-chrome.js";
```

Replace with (remove `UtilityRule`, `UtilityRuleProps`, `MegaColumn`, `MegaItem`; add `LandingAudience`):

```tsx
export {
  type LandingAudience,
  MegaNav,
  type MegaNavProps,
  type MegaNavLink,
  MegaFooter,
  type MegaFooterProps,
  type FooterColumn,
  MarketingShell,
  type MarketingShellProps,
} from "./aperture-chrome.js";
```

- [ ] **Step 5: Run typecheck**

```bash
cd /Users/rugwedpatharkar/Projects/Project/.claude/worktrees/vibrant-cannon-b9386c/frontend
npx pnpm@9.15.0 --filter @ip/api-client typecheck
npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit 2>&1 | grep -E '\.tsx?\(' | head -20
```

Expected: api-client returns clean. Candidate app surfaces errors at every site that imports `UtilityRule`, or imports `MarketingShell` with `showUtilityRule` prop, or any call site of the old `MegaNav` mega-panel pattern. List those — they're the next task's call sites.

- [ ] **Step 6: Fix every consumer the typecheck surfaced**

For each error, the fix is one of:
- `import { UtilityRule } from "@ip/ui"` → delete the import + the JSX element where it's used
- `<MarketingShell showUtilityRule={false}>` → drop the prop (it's gone)
- `<MarketingShell>` with no audience → add `audience="applicants"` or `audience="hiring-teams"` based on the file's path (applicants for `/`, hiring-teams for `/hiring-teams/*`, neutral defaults to applicants for other pages like `/trust`)

Re-run typecheck after each batch until clean. The 14 sub-page public surfaces (`/trust`, `/sample-report`, `/privacy`, etc.) all use `<MarketingShell>` — most should default to `audience="applicants"` since they're applicant-relevant content.

- [ ] **Step 7: Commit**

```bash
git add frontend/packages/ui/src/aperture-chrome.tsx frontend/packages/ui/src/index.ts frontend/apps/candidate/app/
git commit -m "feat(@ip/ui): audience-aware MegaNav + MegaFooter; drop UtilityRule

- MegaNav, MegaFooter, MarketingShell all accept audience: 'applicants' | 'hiring-teams'
- Nav shows audience-specific sub-page links + side-switcher button at right edge
  (coral on applicants→hiring teams, teal on hiring teams→applicants)
- Footer first column flips by audience; cross-link group is always second column
- UtilityRule deleted entirely from @ip/ui exports (pre-launch announcement strip
  was duplicate noise above every public page)
- No 'Sign in' button anywhere in the nav — moves to landings (next tasks)
- Public sub-page surfaces (trust, sample-report, privacy, etc.) updated to pass
  audience='applicants' as the neutral default

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Build `<SignInBand audience>` shared component

**Files:**
- Create: `frontend/packages/ui/src/sign-in-band.tsx`
- Modify: `frontend/packages/ui/src/index.ts` (add export)

**Interfaces:**
- Consumes:
  - `useAuth()` from `@ip/shared` returns `{api, token, identity, ready, login: (email: string, password: string) => Promise<void>, logout: () => void}`
  - `errorMessage(err: unknown): string` from `@ip/shared`
  - `LandingAudience` from `./aperture-chrome.js`
- Produces:
  - `<SignInBand audience="applicants" | "hiring-teams" />` — renders a `<section id="sign-in">` with left "Returning?" pitch + right inline form
  - On successful login, calls `router.push("/")` (applicants) or `router.push("/company")` (hiring teams) — final destination determined by the auth provider's post-login redirect logic, but we set the explicit `next` route as the optimistic fallback.

- [ ] **Step 1: Create `sign-in-band.tsx`**

Create `frontend/packages/ui/src/sign-in-band.tsx` with the full component:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { errorMessage } from "@ip/shared";
import { ApIcon } from "./aperture-sprite.js";
import type { LandingAudience } from "./aperture-chrome.js";

export interface SignInBandProps {
  audience: LandingAudience;
  /** Injected by the consumer because @ip/ui can't import the app's useAuth hook. */
  useAuthHook: () => {
    login: (email: string, password: string) => Promise<void>;
  };
}

const COPY = {
  applicants: {
    eyebrow: "Returning?",
    headline: "Pick up where you left off.",
    bullets: [
      "Your applications and their status, in one place.",
      "Your saved jobs and alerts, still warm.",
      "Your interview score and feedback, when it lands.",
    ],
    accent: "coral",
    signupHref: "/register",
    signupLabel: "Create one →",
    nextRoute: "/",
  },
  "hiring-teams": {
    eyebrow: "Returning?",
    headline: "Pick up where you left off.",
    bullets: [
      "Your funnel and the candidates moving through it.",
      "Your pipeline and decisions in flight.",
      "Your audit log — every decision, signed.",
    ],
    accent: "teal",
    signupHref: "/company/register",
    signupLabel: "Create one →",
    nextRoute: "/company",
  },
} as const;

export function SignInBand({ audience, useAuthHook }: SignInBandProps) {
  const { login } = useAuthHook();
  const router = useRouter();
  const copy = COPY[audience];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.push(copy.nextRoute);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  const tone = audience === "hiring-teams" ? "teal" : "coral";
  const bandBg =
    audience === "hiring-teams"
      ? "color-mix(in oklch, var(--teal) 4%, var(--surface-2))"
      : "color-mix(in oklch, var(--coral) 4%, var(--surface-2))";

  return (
    <section
      id="sign-in"
      className="border-t border-line py-16 lg:py-24"
      style={{ background: bandBg }}
    >
      <div className="ap-wrap grid items-start gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        {/* Left: pitch */}
        <div>
          <span
            className={`text-[0.78rem] font-semibold uppercase tracking-[0.16em] ${
              tone === "teal" ? "text-teal-strong" : "text-coral"
            }`}
          >
            {copy.eyebrow}
          </span>
          <h2
            className="mt-2 text-[clamp(1.85rem,1.35rem+2.1vw,2.55rem)] font-bold leading-[1.06] tracking-[-0.028em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {copy.headline}
          </h2>
          <ul className="mt-6 grid gap-2.5">
            {copy.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-[0.96rem] text-ink-2">
                <ApIcon
                  name="check"
                  className={`mt-[3px] size-[18px] shrink-0 ${
                    tone === "teal" ? "text-teal" : "text-coral"
                  }`}
                />
                {b}
              </li>
            ))}
          </ul>
        </div>

        {/* Right: form */}
        <form
          onSubmit={onSubmit}
          className="rounded-3xl border border-line bg-surface p-6 shadow-[0_18px_56px_-28px_color-mix(in_oklch,var(--ink-deep)_28%,transparent)] lg:p-8"
          aria-labelledby="sign-in-form-title"
        >
          <h3
            id="sign-in-form-title"
            className="text-[1.2rem] font-semibold text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Sign in
          </h3>
          <div className="mt-5 grid gap-4">
            <div>
              <label
                htmlFor="sign-in-email"
                className="block text-[0.86rem] font-medium text-ink-deep"
              >
                Email
              </label>
              <input
                id="sign-in-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`mt-1.5 w-full rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[1rem] text-ink placeholder:text-ink-3 transition-colors focus:outline-none focus:ring-4 ${
                  tone === "teal"
                    ? "focus:border-teal focus:ring-teal-soft"
                    : "focus:border-coral focus:ring-coral-soft"
                }`}
              />
            </div>
            <div>
              <label
                htmlFor="sign-in-password"
                className="block text-[0.86rem] font-medium text-ink-deep"
              >
                Password
              </label>
              <input
                id="sign-in-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`mt-1.5 w-full rounded-lg border border-line-2 bg-surface px-3.5 py-2.5 text-[1rem] text-ink placeholder:text-ink-3 transition-colors focus:outline-none focus:ring-4 ${
                  tone === "teal"
                    ? "focus:border-teal focus:ring-teal-soft"
                    : "focus:border-coral focus:ring-coral-soft"
                }`}
              />
            </div>
          </div>
          {error && (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[0.88rem] text-danger"
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className={`mt-5 w-full justify-center ap-btn ap-btn-lg ${
              tone === "teal" ? "ap-btn-primary" : "ap-btn-coral"
            }`}
          >
            {submitting ? "Signing you in…" : "Sign in"}
          </button>
          <Link
            href="/forgot"
            className="mt-3 block text-center text-[0.86rem] font-medium text-ink-2 underline-offset-4 hover:text-ink-deep hover:underline"
          >
            Forgot password?
          </Link>
          <p className="mt-6 border-t border-line pt-4 text-center text-[0.88rem] text-ink-2">
            Don&apos;t have an account?{" "}
            <Link
              href={copy.signupHref}
              className={
                tone === "teal"
                  ? "font-semibold text-teal-strong hover:underline"
                  : "font-semibold text-coral hover:underline"
              }
            >
              {copy.signupLabel}
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Export from `@ip/ui` index**

Edit `frontend/packages/ui/src/index.ts`. Below the `aperture-chrome.js` exports, add:

```tsx
export { SignInBand, type SignInBandProps } from "./sign-in-band.js";
```

- [ ] **Step 3: Run typecheck**

```bash
cd /Users/rugwedpatharkar/Projects/Project/.claude/worktrees/vibrant-cannon-b9386c/frontend
npx pnpm@9.15.0 --filter @ip/api-client typecheck
npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit 2>&1 | grep -E '\.tsx?\(' | head -10
```

Expected: 0 errors (the component compiles cleanly because `useAuthHook` is injected, so `@ip/ui` doesn't import the app's auth module).

- [ ] **Step 4: Commit**

```bash
git add frontend/packages/ui/src/sign-in-band.tsx frontend/packages/ui/src/index.ts
git commit -m "feat(@ip/ui): SignInBand — shared mid-page sign-in for both landings

- Two-column at lg+: left = 'Returning?' pitch (3 audience-specific bullets) +
  right = inline form (email + password + Sign in button + Forgot password link +
  Don't-have-an-account footer link)
- audience prop themes the band (coral on applicants, teal on hiring teams) and
  flips the bullet copy + signup href (/register vs /company/register)
- Wraps a <section id='sign-in'> so hero 'Sign in' links can anchor via #sign-in
- useAuthHook is injected by the consumer (avoids @ip/ui importing the app's
  per-namespace useAuth)
- On submit: calls login(email, password) then router.push(audience === 'hiring-teams'
  ? '/company' : '/'); the auth provider's role-router still has final say
- Error rendered via role='alert' for screen readers; disabled-while-submitting

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 2 — Hiring teams landing (lowest risk — mostly relocates existing sections)

### Task 3: Move buyer-side sections into reusable components

The current `marketing-landing.tsx` has all 16 sections inlined as local functions. The hiring-teams landing reuses most of them — extract two to standalone files so both landings can share them in later phases.

**Files:**
- Create: `frontend/apps/candidate/components/marketing/privacy-panel.tsx`
- Read for context: `frontend/apps/candidate/app/(marketing)/marketing-landing.tsx` (lines that contain `DefenseSplit` and the `.ap-def-panel--privacy` block)

**Interfaces:**
- Produces: `<PrivacyPanel/>` — renders ONLY the privacy-half of the current `<DefenseSplit/>` (the `.ap-def-panel--privacy` panel with the 6 "what Aptura does NOT do" bullets). Same icons, same copy.

- [ ] **Step 1: Read the existing privacy panel markup**

Open `frontend/apps/candidate/app/(marketing)/marketing-landing.tsx` and locate the `DefenseSplit()` function. The right-hand panel inside `.ap-defense` (with class `.ap-def-panel--privacy`) is what we extract. Note its 6 list items, the heading, the icons, and the styling.

- [ ] **Step 2: Create `privacy-panel.tsx`**

Create `frontend/apps/candidate/components/marketing/privacy-panel.tsx`:

```tsx
import { ApIcon } from "@ip/ui";

const ITEMS: Array<[string, string]> = [
  ["No real-time human watcher.", "Reviewers only see flagged events, after the fact."],
  ["No raw video or audio leaves the browser.", "Detectors run on-device; only typed events are sent."],
  ["No emotion or affect inference.", '"Candidate looked stressed" scoring? Never.'],
  ["No identity matching beyond the ID check.", "No voiceprints, no face match against other databases."],
  ["No keystroke surveillance for content.", "We track tab-switches, not what you type elsewhere."],
  ["Encrypted at rest. Deleted on request.", "Right-to-erase honored across every Aptura artifact."],
];

/**
 * Privacy half of the original DefenseSplit — rendered standalone on the applicants
 * landing as section §5 (the applicant trust answer), and still rendered inside
 * DefenseSplit on the hiring teams landing as its right column.
 */
export function PrivacyPanel() {
  return (
    <div className="ap-def-panel ap-def-panel--privacy">
      <h3 className="ap-h3 flex items-center gap-2">
        <ApIcon name="shield-check" className="size-6 text-teal" />
        What Aptura does{" "}
        <em className="not-italic font-medium text-teal-strong">not</em> do
      </h3>
      <ul className="ap-def-list ap-def-list--privacy">
        {ITEMS.map(([title, rest]) => (
          <li key={title}>
            <ApIcon name="check" />
            <span>
              <b>{title}</b> {rest}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Update `DefenseSplit` to render `<PrivacyPanel/>` as its right column**

Edit `frontend/apps/candidate/app/(marketing)/marketing-landing.tsx`. Find the `DefenseSplit` function. Replace its right-column inline JSX (the `<div className="ap-def-panel ap-def-panel--privacy">…</div>` block) with `<PrivacyPanel />` and add the import at the top of the file:

```tsx
import { PrivacyPanel } from "../../components/marketing/privacy-panel";
```

The left "What Aptura blocks" panel stays inline — it's only used inside `DefenseSplit`, not standalone.

- [ ] **Step 4: Verify no visual regression**

```bash
cd /Users/rugwedpatharkar/Projects/Project/.claude/worktrees/vibrant-cannon-b9386c/frontend
npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit 2>&1 | grep -E '\.tsx?\(' | head -10
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/apps/candidate/components/marketing/privacy-panel.tsx frontend/apps/candidate/app/\(marketing\)/marketing-landing.tsx
git commit -m "refactor(landing): extract PrivacyPanel from DefenseSplit

The applicants landing renders this panel standalone (as §5 'the applicant
trust answer'); the hiring teams landing keeps it as the right column of
DefenseSplit. One source of truth.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Create the hiring-teams landing route at `/hiring-teams`

**Files:**
- Create: `frontend/apps/candidate/app/hiring-teams/page.tsx`
- Create: `frontend/apps/candidate/components/marketing/hiring-teams-hero.tsx`
- Create: `frontend/apps/candidate/components/marketing/hiring-teams-final-cta.tsx`
- Read for context: `frontend/apps/candidate/app/(marketing)/marketing-landing.tsx` (the existing `Hero`, `FinalCta`, and all middle sections)

**Interfaces:**
- Consumes:
  - `MarketingShell` and `SignInBand` from `@ip/ui`
  - The 12 middle sections currently inlined as functions in `marketing-landing.tsx` (we re-import them from there for now; Task 8 deletes the old file)
- Produces: a `/hiring-teams` route that renders the existing 16-section buyer-side composition with the new sign-in band inserted before the FAQ, and the dual sign-in CTA in the hero.

- [ ] **Step 1: Create `hiring-teams-hero.tsx`**

Create `frontend/apps/candidate/components/marketing/hiring-teams-hero.tsx`. Copy the existing `Hero` function from `marketing-landing.tsx` verbatim, but change the secondary CTA from "See a sample report" to a "Sign in" link anchored to `#sign-in`. Keep the `<InterviewHud />` and everything else identical:

```tsx
"use client";

import Link from "next/link";
import { ApIcon } from "@ip/ui";

export function HiringTeamsHero() {
  return (
    <section className="relative py-12 lg:py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[-10%] top-[-20%] -z-10 h-[80%]"
        style={{
          background:
            "radial-gradient(60% 50% at 80% 30%, var(--teal-glow), transparent 70%)",
        }}
      />
      <div className="ap-wrap grid items-center gap-10 lg:grid-cols-[1.08fr_1.05fr] lg:gap-12">
        <div>
          <span className="ap-status ap-status--live">
            <span className="ap-dot" /> Live · proctored interview in progress
          </span>
          <h1 className="ap-h1 mt-5">
            Hire on <span className="text-teal">proven merit.</span>
            <br />
            Cheat-proof by design.
          </h1>
          <p className="mt-5 max-w-[36ch] text-[var(--step-1)] leading-relaxed text-ink-2">
            Aptura runs one strictly proctored AI interview per role — and gives you
            an evidence-based report with an integrity timeline. Humans decide.
          </p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link href="/pilot" className="ap-btn ap-btn-primary ap-btn-lg">
              Book a pilot
            </Link>
            <Link href="#sign-in" className="ap-btn ap-btn-ghost ap-btn-lg">
              Sign in
            </Link>
          </div>
          <div className="mt-9 flex flex-wrap gap-x-7 gap-y-2 text-[0.94rem] text-ink-2">
            <span className="inline-flex items-center gap-2">
              <ApIcon name="shield-check" className="size-4 text-teal" />
              Fullscreen-locked, on-device proctoring
            </span>
            <span className="inline-flex items-center gap-2">
              <ApIcon name="check" className="size-4 text-teal" />
              Evidence-based scoring · human decides
            </span>
            <span className="inline-flex items-center gap-2">
              <ApIcon name="user" className="size-4 text-teal" />
              Every applicant answered
            </span>
          </div>
        </div>
        <InterviewHud />
      </div>
    </section>
  );
}

function InterviewHud() {
  // Copy verbatim from the existing InterviewHud function in marketing-landing.tsx.
  // Implementation engineer: open marketing-landing.tsx, find `function InterviewHud()`,
  // paste its full body here. Same JSX, no edits.
  return null; // placeholder until pasted
}
```

**Implementation engineer:** open `marketing-landing.tsx`, find `function InterviewHud()` (~lines 168–235 in the current file), and paste its entire body into the local `InterviewHud` function above, replacing the `return null;` placeholder.

- [ ] **Step 2: Create `hiring-teams-final-cta.tsx`**

Copy the existing `FinalCta` function from `marketing-landing.tsx` into a new file `frontend/apps/candidate/components/marketing/hiring-teams-final-cta.tsx`, but reframe it to **single audience** (drop the applicant half, add a cross-link instead):

```tsx
"use client";

import Link from "next/link";

export function HiringTeamsFinalCta() {
  return (
    <section className="pb-12 pt-16 lg:pb-16">
      <div className="ap-wrap">
        <div
          className="grid gap-6 rounded-[28px] border border-line p-7 lg:p-12"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklch, var(--teal) 12%, var(--surface)), var(--surface))",
          }}
        >
          <span
            className="text-[0.92rem] font-semibold text-teal-strong"
            style={{ letterSpacing: "-0.005em" }}
          >
            For hiring teams
          </span>
          <h3
            className="text-[clamp(1.85rem,1.35rem+2.1vw,2.55rem)] font-semibold leading-[1.06] tracking-[-0.022em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Hire on proof. Not pedigree, not polish.
          </h3>
          <p className="max-w-[60ch] text-ink-2">
            Replace résumé screens, take-homes, and ghost rounds with one verified
            interview and one auditable decision.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/pilot" className="ap-btn ap-btn-primary ap-btn-lg">
              Book a pilot
            </Link>
            <Link
              href="/"
              className="text-[0.94rem] font-semibold text-ink-2 underline-offset-4 hover:text-ink-deep hover:underline"
            >
              Looking for work? See Aptura for applicants →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create the `/hiring-teams` route**

Create `frontend/apps/candidate/app/hiring-teams/page.tsx`. Import the existing middle-section components (they live as inline functions in `marketing-landing.tsx` for now — Task 8 deletes them, but for this task we re-export them in Step 4):

```tsx
"use client";

import { MarketingShell, SignInBand } from "@ip/ui";
import { useAuth } from "../../lib/auth";
import { HiringTeamsHero } from "../../components/marketing/hiring-teams-hero";
import { HiringTeamsFinalCta } from "../../components/marketing/hiring-teams-final-cta";
import {
  StatsBand,
  EvidenceFlip,
  HowItHappens,
  PlatformBento,
  IntegrityTimeline,
  DefenseSplit,
  EvidenceReport,
  AdvisoryGate,
  CompareTable,
  WhatYouGet,
  TrustBand,
  DesignedFor,
  EarlyAccess,
  HiringTeamsFaq,
} from "../../components/marketing/hiring-teams-sections";

export default function HiringTeamsPage() {
  return (
    <MarketingShell audience="hiring-teams">
      <HiringTeamsHero />
      <StatsBand />
      <EvidenceFlip />
      <HowItHappens />
      <PlatformBento />
      <IntegrityTimeline />
      <DefenseSplit />
      <EvidenceReport />
      <AdvisoryGate />
      <CompareTable />
      <WhatYouGet />
      <TrustBand />
      <DesignedFor />
      <EarlyAccess />
      <SignInBand audience="hiring-teams" useAuthHook={useAuth} />
      <HiringTeamsFaq />
      <HiringTeamsFinalCta />
    </MarketingShell>
  );
}
```

- [ ] **Step 4: Extract the 14 middle sections into a `hiring-teams-sections.tsx` barrel**

Create `frontend/apps/candidate/components/marketing/hiring-teams-sections.tsx`. **Open `marketing-landing.tsx` and identify the 14 inline functions named:** `StatsBand`, `EvidenceFlip`, `HowItHappens`, `Act`, `MiniIdentity`, `Row`, `MiniRoom`, `MiniTimeline`, `MiniRubric`, `MiniDecision`, `PlatformBento`, `Node`, `KV`, `MatchCard`, `IntegrityTimeline`, `LegendDot`, `Event`, `DefenseSplit`, `EvidenceReport`, `Competency`, `AdvisoryGate`, `Bullet`, `CompareTable`, `CompareRow`, `CompareCell`, `WhatYouGet`, `TrustBand`, `TrustCol`, `DesignedFor`, `EarlyAccess`, `Faq` (the existing one), plus the `Section` and `SectionHead` helpers and `ResumeRow` / `BarRow`.

**Move them all** from `marketing-landing.tsx` into `hiring-teams-sections.tsx`. Add the top-of-file imports they need (`Link`, `ApIcon`, `MarketingShell`, etc.). Export the 14 top-level sections (`StatsBand`, `EvidenceFlip`, `HowItHappens`, `PlatformBento`, `IntegrityTimeline`, `DefenseSplit`, `EvidenceReport`, `AdvisoryGate`, `CompareTable`, `WhatYouGet`, `TrustBand`, `DesignedFor`, `EarlyAccess`). Keep all internal helpers (`Act`, `Section`, `SectionHead`, `MiniIdentity`, `Row`, `MiniRoom`, etc.) as file-local (not exported).

Then **rename** the existing `Faq` function in this file to `HiringTeamsFaq`, and strip out the candidate-POV questions. The current FAQ has 16 items mixed with `aud: "cand" | "comp"`. Filter to keep only `aud: "comp"` items:

```tsx
export function HiringTeamsFaq() {
  const items = [
    { q: "What's actually different about Aptura's interview vs. existing AI video tools?", a: "It's a live, fullscreen-locked, identity-verified interview with on-device proctoring — not an async video upload. Every score points to a quoted transcript line. Reports include an integrity timeline with severity per event." },
    { q: "How is bias handled?", a: "Aptura's scoring model is bias-aware by design: rubric-driven scoring, evidence-linked ratings, advisory recommendations only, and a human signs every outcome. A third-party audit (NYC AEDT-144 methodology or equivalent) is scheduled before public launch." },
    { q: 'What does "human decides" mean operationally?', a: "Aptura recommends Advance or Hold — never auto-rejects. A named reviewer signs every outcome. Each decision is logged with the reviewer's name, the evidence shown, and the reason given; retention is configurable per pilot." },
    { q: "What happens to the recording, transcript, and proctoring events?", a: "Recordings are encrypted at rest. Retention is configurable per pilot. Right-to-erase is honored across every Aptura artifact — recording, transcript, scoring, and decision metadata." },
    { q: "Can I bring our own rubric?", a: "Yes — custom rubrics are part of the pilot onboarding. The Aptura Core 6 is the default; you can adapt it to your role and we'll apply the same evidence-linked scoring approach." },
    { q: "How does it integrate with our ATS?", a: "ATS integrations (Greenhouse, Lever, Ashby, Workday, SuccessFactors) are on the roadmap. The core product runs standalone today; pilots typically start with email and CSV handoff into your existing flow. Tell us the ATS you use and we'll build that integration next." },
    { q: "What if a HIGH-severity event fires by mistake?", a: "A HIGH-severity auto-end can be appealed. The reviewer sees the clip and the reason; if the event was a false positive, the candidate is offered a fresh interview at no cost to either side." },
    { q: "Can we white-label the candidate experience?", a: "White-labelling the candidate flow (your branding, your domain) is planned for the post-launch enterprise tier. In a pilot, candidates always see the role and the company name clearly." },
  ];

  return (
    <Section divider id="faq">
      <SectionHead
        eyebrow="Questions, answered"
        h2="The questions hiring teams ask first."
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map(({ q, a }) => (
          <details key={q} className="group rounded-xl border border-line bg-surface p-4">
            <summary
              className="flex cursor-pointer list-none items-center gap-3 font-semibold text-ink-deep"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {q}
              <span className="ml-auto text-xl text-ink-3 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="mt-3 text-[0.95rem] leading-relaxed text-ink-2">{a}</div>
          </details>
        ))}
      </div>
    </Section>
  );
}
```

(The `Section` and `SectionHead` helpers are file-local; the engineer pasting them in from `marketing-landing.tsx` will have them in scope.)

**Keep `marketing-landing.tsx` compiling.** The OLD `/` route still renders `<MarketingLanding/>` until Task 7. After the move, add this import block at the top of `marketing-landing.tsx`, then replace the inline `<Faq />` reference in its composition with `<HiringTeamsFaq />`:

```tsx
import {
  StatsBand,
  EvidenceFlip,
  HowItHappens,
  PlatformBento,
  IntegrityTimeline,
  DefenseSplit,
  EvidenceReport,
  AdvisoryGate,
  CompareTable,
  WhatYouGet,
  TrustBand,
  DesignedFor,
  EarlyAccess,
  HiringTeamsFaq,
} from "../../components/marketing/hiring-teams-sections";
```

The `Hero` and `FinalCta` functions stay defined inline in `marketing-landing.tsx` (they are the dual-audience originals; the audience-specific copies live in their own new files). Task 8 deletes the whole `marketing-landing.tsx` file once Task 7 has swapped `/`.

- [ ] **Step 5: Verify `/hiring-teams` renders**

```bash
cd /Users/rugwedpatharkar/Projects/Project/.claude/worktrees/vibrant-cannon-b9386c/frontend
npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit 2>&1 | grep -E '\.tsx?\(' | head -20
```

Expected: 0 errors. If the dev server is running, navigate to `http://localhost:3000/hiring-teams` and confirm it renders with the new hero (dual CTA: Book a pilot + Sign in), all middle sections, the sign-in band before the FAQ, the buyer-only FAQ, and the new final CTA with the "Looking for work?" cross-link.

The OLD `/` is still the dual-audience landing at this point — Task 7 swaps it.

- [ ] **Step 6: Commit**

```bash
git add frontend/apps/candidate/app/hiring-teams/ frontend/apps/candidate/components/marketing/hiring-teams-hero.tsx frontend/apps/candidate/components/marketing/hiring-teams-final-cta.tsx frontend/apps/candidate/components/marketing/hiring-teams-sections.tsx frontend/apps/candidate/app/\(marketing\)/marketing-landing.tsx
git commit -m "feat(landing): /hiring-teams buyer-side landing live

- New /hiring-teams route composes the existing 16 buyer-side sections + the
  new SignInBand audience='hiring-teams' inserted before the FAQ
- HiringTeamsHero: dual CTA (Book a pilot + Sign in #sign-in); InterviewHud
  kept identical
- HiringTeamsFinalCta: single audience, teal gradient + 'Looking for work?'
  cross-link to /
- 14 middle sections extracted from marketing-landing.tsx into
  components/marketing/hiring-teams-sections.tsx for re-use
- Faq filtered to 8 recruiter-POV questions; candidate-POV Qs land on the
  applicants page (next phase)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 3 — Applicants landing (the new story)

### Task 5: Build the 6 new applicant-side section components

**Files:**
- Create: `frontend/apps/candidate/components/marketing/applicants-hero.tsx`
- Create: `frontend/apps/candidate/components/marketing/applicant-journey.tsx`
- Create: `frontend/apps/candidate/components/marketing/no-ghosting-promise.tsx`
- Create: `frontend/apps/candidate/components/marketing/accommodations.tsx`
- Create: `frontend/apps/candidate/components/marketing/practice-spotlight.tsx`
- Create: `frontend/apps/candidate/components/marketing/applicant-final-cta.tsx`

**Interfaces:**
- Consumes: `ApIcon`, `MarketingShell`, primitives from `@ip/ui`; the `Section` + `SectionHead` helpers are local per file (each file declares its own minimal versions OR imports from the new barrel if convenient — but no cross-file helper sharing in this task to keep each file self-contained).
- Produces: 6 named exports, each rendering one section on the applicants landing.

- [ ] **Step 1: `applicants-hero.tsx`**

```tsx
"use client";

import Link from "next/link";
import { ApIcon } from "@ip/ui";

export function ApplicantsHero() {
  return (
    <section className="relative py-12 lg:py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[-10%] top-[-20%] -z-10 h-[80%]"
        style={{
          background:
            "radial-gradient(60% 50% at 80% 30%, color-mix(in oklch, var(--coral) 35%, transparent), transparent 70%)",
        }}
      />
      <div className="ap-wrap grid items-center gap-10 lg:grid-cols-[1.08fr_1.05fr] lg:gap-12">
        <div>
          <span className="ap-status ap-status--live">
            <span className="ap-dot" /> The interview you&apos;ll sit
          </span>
          <h1 className="ap-h1 mt-5">
            Get seen. Get interviewed.
            <br />
            <span className="text-coral">Get hired.</span>
          </h1>
          <p className="mt-5 max-w-[40ch] text-[var(--step-1)] leading-relaxed text-ink-2">
            One fair, proctored AI interview. Always hear back — with a real answer and
            a reason. Aptura is hiring decided on merit.
          </p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <Link href="/jobs" className="ap-btn ap-btn-coral ap-btn-lg">
              Find roles
            </Link>
            <Link href="#sign-in" className="ap-btn ap-btn-ghost ap-btn-lg">
              Sign in
            </Link>
          </div>
          <div className="mt-9 flex flex-wrap gap-x-7 gap-y-2 text-[0.94rem] text-ink-2">
            <span className="inline-flex items-center gap-2">
              <ApIcon name="shield-check" className="size-4 text-coral" />
              No real-time human watcher
            </span>
            <span className="inline-flex items-center gap-2">
              <ApIcon name="check" className="size-4 text-coral" />
              Every applicant gets a real answer
            </span>
            <span className="inline-flex items-center gap-2">
              <ApIcon name="user" className="size-4 text-coral" />
              Free practice round, no scoring
            </span>
          </div>
        </div>
        <ApplicantsHudPreview />
      </div>
    </section>
  );
}

function ApplicantsHudPreview() {
  // Reuses the InterviewHud structure but tagged "the interview YOU will sit"
  // rather than the recruiter's view. Identical chip strip; identical caption.
  return (
    <div className="ap-hud relative" aria-label="Sample proctored interview UI (your view)">
      <div className="ap-hud-topbar">
        <span className="ap-hud-title">Sample interview · Your view</span>
        <span className="ap-hud-meta">· demo HUD</span>
        <span className="ml-auto inline-flex items-center gap-1 text-[0.78rem] text-ink-2">
          <ApIcon name="lock" className="size-[13px]" /> Fullscreen locked
        </span>
      </div>
      <div className="ap-hud-stage">
        <span className="ap-hud-interviewer">
          <span className="ap-dot" /> Iris · AI Interviewer
        </span>
        <span className="ap-hud-timer">14:38</span>
        <div className="ap-hud-self" aria-hidden />
        <div className="ap-hud-caption">
          <span className="ap-hud-caption-who">Iris</span>
          Walk me through a tradeoff you made between speed and accessibility on
          your last project. Take your time.
        </div>
      </div>
      <div className="ap-hud-strip">
        <div className="ap-hud-chip ap-hud-chip--good">
          <span className="ap-hud-chip-lbl">Face</span>
          <span className="ap-hud-chip-val">One</span>
        </div>
        <div className="ap-hud-chip ap-hud-chip--good">
          <span className="ap-hud-chip-lbl">Gaze</span>
          <span className="ap-hud-chip-val">On</span>
        </div>
        <div className="ap-hud-chip ap-hud-chip--good">
          <span className="ap-hud-chip-lbl">Mic</span>
          <span className="ap-hud-chip-val">Live</span>
        </div>
        <div className="ap-hud-chip ap-hud-chip--good">
          <span className="ap-hud-chip-lbl">Integrity</span>
          <span className="ap-hud-chip-val">98</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `applicant-journey.tsx`**

```tsx
"use client";

import { ApIcon } from "@ip/ui";

const ACTS = [
  {
    step: "Step 01",
    n: "1.0",
    title: "Browse roles you fit",
    body: "Search a verified marketplace of open roles. Save what's interesting, set alerts for what matches, every applicant gets the same view.",
    bullets: ["Open marketplace, no paywall", "Save jobs, set alerts", "Same criteria as everyone else"],
  },
  {
    step: "Step 02",
    n: "2.0",
    title: "Apply once",
    body: "One profile, every role. Your résumé, your skills, your preferences — submit to any open role with one tap.",
    bullets: ["One profile, every role", "ID verified once, reused", "Track every application in one place"],
  },
  {
    step: "Step 03",
    n: "3.0",
    title: "Practice for free",
    body: "Sit a full practice round before any real interview. Same UI, same rubric, no scoring against you. Practice is detached from the funnel — nothing here reaches a recruiter.",
    bullets: ["Same UI as the real interview", "No scoring against you", "Growth feedback after"],
  },
  {
    step: "Step 04",
    n: "4.0",
    title: "Sit one proctored interview",
    body: "Live video and voice with Iris, our AI interviewer. Fullscreen-locked. Camera and mic stay on by design. Same standard for every applicant.",
    bullets: ["~20 minutes; you'll see the duration upfront", "On-device detection only — no raw media leaves your browser", "Accommodations are first-class"],
  },
  {
    step: "Step 05",
    n: "5.0",
    title: "Get a real answer + the report behind it",
    body: "Every applicant — advanced or not — receives an outcome with a competency-level note, the recommendation reason, and an option to request a re-score for a different role.",
    bullets: ["A named human reviewer signs every outcome", "You see the evidence behind the decision", "Re-score for new roles, same evidence"],
  },
];

export function ApplicantJourney() {
  return (
    <section className="border-t border-line py-16 lg:py-24" id="journey">
      <div className="ap-wrap">
        <div className="mb-10 grid max-w-[62rem] gap-3 lg:mb-12">
          <span className="text-[0.92rem] font-semibold text-coral">— Your journey</span>
          <h2
            className="text-[clamp(1.85rem,1.35rem+2.1vw,2.55rem)] font-bold leading-[1.06] tracking-[-0.028em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Apply once. Sit one fair interview. Always hear back.
          </h2>
          <p className="text-[var(--step-1)] leading-relaxed text-ink-2 max-w-[62ch]">
            Five steps from the moment you find a role to the moment a hiring team decides.
            Every step is observable. Every step is the same for every applicant.
          </p>
        </div>
        <div className="grid gap-5">
          {ACTS.map((act) => (
            <article
              key={act.n}
              className="grid gap-5 rounded-3xl border border-line bg-surface p-6 lg:grid-cols-[90px_1fr_1.2fr] lg:gap-7 lg:p-7"
            >
              <div>
                <span className="block font-mono text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-ink-3">
                  {act.step}
                </span>
                <span
                  className="block text-[1.6rem] font-bold tracking-[-0.02em] text-coral"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {act.n}
                </span>
              </div>
              <div>
                <h3
                  className="mb-2 text-[clamp(1.4rem,1.05rem+1.2vw,1.75rem)] font-semibold leading-[1.12] tracking-[-0.022em] text-ink-deep"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {act.title}
                </h3>
                <p className="max-w-[42ch] text-[0.96rem] leading-relaxed text-ink-2">
                  {act.body}
                </p>
              </div>
              <div className="flex min-h-[120px] flex-col justify-center rounded-2xl border border-dashed border-line-2 bg-surface-2 p-4">
                <ul className="grid gap-1.5">
                  {act.bullets.map((b) => (
                    <li key={b} className="flex gap-2 text-[0.92rem] text-ink-2">
                      <ApIcon name="check" className="mt-[3px] size-[15px] shrink-0 text-coral" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: `no-ghosting-promise.tsx`**

```tsx
"use client";

import { ApIcon } from "@ip/ui";

export function NoGhostingPromise() {
  return (
    <section className="border-t border-line py-16 lg:py-24">
      <div className="ap-wrap">
        <div
          className="rounded-3xl border border-line p-7 lg:p-12"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklch, var(--coral) 12%, var(--surface)), var(--surface))",
          }}
        >
          <span className="text-[0.92rem] font-semibold text-coral">— The promise</span>
          <h2
            className="mt-2 text-[clamp(2.4rem,1.75rem+3vw,3.5rem)] font-bold leading-[1.05] tracking-[-0.03em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Every applicant gets a real answer.
            <br />
            <span className="text-coral">With feedback.</span>
          </h2>
          <p className="mt-5 max-w-[60ch] text-[var(--step-1)] leading-relaxed text-ink-2">
            Aptura was built so résumé black holes stop happening. If you sit an Aptura
            interview, you hear back — with a reason, with the evidence behind it, the
            same way for every applicant.
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {[
              ["You&apos;ll know", "An outcome message lands. Always."],
              ["With a real reason", "Never silence. Never form-letters."],
              ["The same way for everyone", "Same rubric, same evidence, same review."],
            ].map(([head, sub]) => (
              <div key={head as string} className="rounded-2xl border border-line bg-surface p-4">
                <h4
                  className="text-[1.06rem] font-semibold text-ink-deep"
                  style={{ fontFamily: "var(--font-display)" }}
                  dangerouslySetInnerHTML={{ __html: head as string }}
                />
                <p className="mt-1.5 text-[0.92rem] leading-snug text-ink-2">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: `accommodations.tsx`**

```tsx
"use client";

import Link from "next/link";
import { ApIcon } from "@ip/ui";

const COMMITMENTS = [
  {
    title: "Extended time",
    body: "Up to 1.5× or 2× the standard interview duration, depending on documented need. Same rubric, same evidence, longer window.",
  },
  {
    title: "Captions for the AI interviewer",
    body: "Live captions are on by default; you can toggle them off if they aren't helpful.",
  },
  {
    title: "Screen-reader-friendly question delivery",
    body: "Questions appear as text in addition to being spoken. Skip-to-text shortcuts available.",
  },
  {
    title: "Alternative response modes",
    body: "If voice response is not possible, written answers in a structured editor are accepted, with the same rubric applied.",
  },
];

export function Accommodations() {
  return (
    <section className="border-t border-line py-16 lg:py-24">
      <div className="ap-wrap">
        <div className="mb-10 grid max-w-[62rem] gap-3">
          <span className="text-[0.92rem] font-semibold text-coral">— First-class, not a checkbox</span>
          <h2
            className="text-[clamp(1.85rem,1.35rem+2.1vw,2.55rem)] font-bold leading-[1.06] tracking-[-0.028em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Accommodations don&apos;t affect your score, don&apos;t appear in your report.
          </h2>
          <p className="text-[var(--step-1)] leading-relaxed text-ink-2 max-w-[62ch]">
            The proctored interview is high-stakes. The accommodations below are honored on
            request and apply the same rubric — they shape how you sit the interview, not
            how it&apos;s scored.
          </p>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {COMMITMENTS.map((c) => (
            <article key={c.title} className="ap-cell">
              <h3
                className="text-[1.06rem] font-semibold text-ink-deep"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {c.title}
              </h3>
              <p className="mt-1.5 text-[0.94rem] leading-relaxed text-ink-2">{c.body}</p>
            </article>
          ))}
        </div>
        <p className="mt-6 text-[0.92rem] text-ink-2">
          Full statement, and how to request an accommodation:{" "}
          <Link
            href="/accessibility"
            className="font-semibold text-coral underline-offset-2 hover:underline"
          >
            Accessibility
            <ApIcon name="arrow" className="ml-1 inline size-3" />
          </Link>
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: `practice-spotlight.tsx`**

```tsx
"use client";

import Link from "next/link";
import { ApIcon } from "@ip/ui";

export function PracticeSpotlight() {
  return (
    <section className="border-t border-line py-16 lg:py-24">
      <div className="ap-wrap">
        <div className="grid items-center gap-8 rounded-3xl border border-line bg-surface p-7 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:p-12">
          <div>
            <span className="text-[0.92rem] font-semibold text-coral">— Practice mode</span>
            <h2
              className="mt-2 text-[clamp(1.85rem,1.35rem+2.1vw,2.55rem)] font-bold leading-[1.06] tracking-[-0.028em] text-ink-deep"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Sit a full practice round.
              <br />
              <span className="text-coral">Free. No scoring.</span>
            </h2>
            <p className="mt-5 text-[var(--step-1)] leading-relaxed text-ink-2">
              The same UI as the real interview. The same rubric. Growth feedback
              after — strengths, gaps, suggested topics. Detached from the funnel; nothing
              here reaches a recruiter.
            </p>
            <ul className="mt-6 grid gap-2.5 text-[0.96rem] text-ink-2">
              {[
                "Same interviewer (Iris), same question style, same proctoring",
                "Growth feedback only — no hire/reject verdict, ever",
                "Take it as many times as you want, on any topic",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2.5">
                  <ApIcon name="check" className="mt-[3px] size-[18px] shrink-0 text-coral" />
                  {b}
                </li>
              ))}
            </ul>
            <Link href="/practice" className="ap-btn ap-btn-coral ap-btn-lg mt-7 inline-flex">
              Try a practice round
            </Link>
          </div>
          <div className="rounded-2xl border border-dashed border-line-2 bg-surface-2 p-6 text-center text-[0.94rem] text-ink-3">
            Practice runs on the same surface as the real interview — sample preview
            available after sign-in.
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: `applicant-final-cta.tsx`**

```tsx
"use client";

import Link from "next/link";

export function ApplicantFinalCta() {
  return (
    <section className="pb-12 pt-16 lg:pb-16">
      <div className="ap-wrap">
        <div
          className="grid gap-6 rounded-[28px] border border-line p-7 lg:p-12"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklch, var(--coral) 12%, var(--surface)), var(--surface))",
          }}
        >
          <span
            className="text-[0.92rem] font-semibold text-coral"
            style={{ letterSpacing: "-0.005em" }}
          >
            For applicants
          </span>
          <h3
            className="text-[clamp(1.85rem,1.35rem+2.1vw,2.55rem)] font-semibold leading-[1.06] tracking-[-0.022em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Get seen. Get interviewed. Get hired.
          </h3>
          <p className="max-w-[60ch] text-ink-2">
            One fair, proctored interview — and a real answer every time. Practice for
            free; sit the real round when you&apos;re ready.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/jobs" className="ap-btn ap-btn-coral ap-btn-lg">
              Find roles
            </Link>
            <Link
              href="/hiring-teams"
              className="text-[0.94rem] font-semibold text-ink-2 underline-offset-4 hover:text-ink-deep hover:underline"
            >
              Hiring instead? See Aptura for hiring teams →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Verify**

```bash
cd /Users/rugwedpatharkar/Projects/Project/.claude/worktrees/vibrant-cannon-b9386c/frontend
npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit 2>&1 | grep -E '\.tsx?\(' | head -20
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/apps/candidate/components/marketing/applicants-hero.tsx frontend/apps/candidate/components/marketing/applicant-journey.tsx frontend/apps/candidate/components/marketing/no-ghosting-promise.tsx frontend/apps/candidate/components/marketing/accommodations.tsx frontend/apps/candidate/components/marketing/practice-spotlight.tsx frontend/apps/candidate/components/marketing/applicant-final-cta.tsx
git commit -m "feat(landing): applicant-side section components

- ApplicantsHero: coral-themed hero with 'Get seen. Get interviewed. Get hired.'
  headline + dual CTA (Find roles + Sign in #sign-in) + 'the interview you'll sit'
  reframed HUD
- ApplicantJourney: 5-act candidate journey (browse, apply, practice, interview,
  answer) with coral numerals and bullets
- NoGhostingPromise: brand-defining coral panel — 'Every applicant gets a real
  answer. With feedback.' + 3 columns
- Accommodations: 4 commitments grid with link out to /accessibility
- PracticeSpotlight: free practice round CTA with link to /practice
- ApplicantFinalCta: coral gradient + 'Hiring instead?' cross-link to /hiring-teams

All sections honor the pre-launch posture: no SLA claims, no fake stats.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Build the applicants FAQ + sample-report card extraction

**Files:**
- Create: `frontend/apps/candidate/components/marketing/applicants-faq.tsx`
- Create: `frontend/apps/candidate/components/marketing/sample-report-card.tsx`

**Interfaces:**
- Produces:
  - `<ApplicantsFaq/>` — renders 10 candidate-POV questions only (the `aud: "cand"` items from the existing FAQ).
  - `<SampleReportCard/>` — the inner Aptura Score + competency cards block from the `/sample-report` page, framed under "What hiring teams see about you." Standalone, no chrome.

- [ ] **Step 1: Create `applicants-faq.tsx`**

```tsx
"use client";

const ITEMS = [
  { q: "Will a real person watch me during the interview?", a: "No. There is no real-time human watcher. Detectors run on your device; only typed events are sent. Reviewers only see flagged events, after the fact, with the recording encrypted at rest." },
  { q: "What if I have a disability or need an accommodation?", a: "Accommodations are first-class. Extended time, captions, screen-reader-friendly question delivery, and alternative response modes are all available at request — they do not affect your score or appear in your report." },
  { q: "Can I retake the interview if my connection drops?", a: "Yes. Connection drops are not penalised. If a session is interrupted unexpectedly, you'll get a one-tap re-entry and a fresh recording — without losing prior responses." },
  { q: "Will I get feedback even if I'm not advanced?", a: "Yes. Every applicant — advanced or not — receives an outcome message with a competency-level note, the recommendation reason, and an option to request a re-score for a different role." },
  { q: "Does Aptura analyse my face for emotion?", a: "No. We do not infer emotion, affect, or personality from your face or voice. We detect presence, identity match, and proctoring signals — never feelings." },
  { q: "Can I practice before the real interview?", a: "Yes. A full practice round mirrors the real one — same UI, same rubric, no scoring against you. You'll see exactly what's being evaluated before you sit the real interview." },
  { q: "I don't have a webcam. Can I still apply?", a: "A working camera and microphone are required for the proctored interview by design. We'll guide you through low-bandwidth and mobile options. Accommodations are honored." },
  { q: "How long is the interview?", a: "Most Aptura interviews run between 18 and 35 minutes — sized to the rubric for the role. You'll see the expected duration before you start, and there are no surprise rounds." },
  { q: "What happens to my interview recording afterwards?", a: "Recordings are encrypted at rest. Retention is configurable per pilot. Right-to-erase is honored across every Aptura artifact — recording, transcript, scoring, and decision metadata." },
  { q: "Can I see what hiring teams see about me?", a: "Yes — every Aptura report includes the evidence and the reason behind the recommendation. The sample report above is the same template every applicant gets." },
];

export function ApplicantsFaq() {
  return (
    <section className="border-t border-line py-16 lg:py-24" id="faq">
      <div className="ap-wrap">
        <div className="mb-10 grid max-w-[62rem] gap-3">
          <span className="text-[0.92rem] font-semibold text-coral">— Questions, answered</span>
          <h2
            className="text-[clamp(1.85rem,1.35rem+2.1vw,2.55rem)] font-bold leading-[1.06] tracking-[-0.028em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            What applicants ask first.
          </h2>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {ITEMS.map(({ q, a }) => (
            <details key={q} className="group rounded-xl border border-line bg-surface p-4">
              <summary
                className="flex cursor-pointer list-none items-center gap-3 font-semibold text-ink-deep"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {q}
                <span className="ml-auto text-xl text-ink-3 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="mt-3 text-[0.95rem] leading-relaxed text-ink-2">{a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Extract the sample-report card body**

Open `frontend/apps/candidate/app/sample-report/page.tsx`. Find the inner `<div className="rounded-3xl border border-line bg-surface shadow-…">` block — the report card itself (the section that opens with the SC avatar circle and closes after the reviewer footer).

Create `frontend/apps/candidate/components/marketing/sample-report-card.tsx`:

```tsx
"use client";

import { ApIcon } from "@ip/ui";

/**
 * Standalone sample report card — extracted from /sample-report so it can render
 * inside the applicants landing under the headline "What hiring teams see about you."
 * Same data, no chrome, no surrounding section wrapper (callers wrap as needed).
 *
 * Implementation engineer: paste the inner card markup from
 * frontend/apps/candidate/app/sample-report/page.tsx — the block that contains the
 * header row (SC avatar + Sample candidate + Sr. Product Designer + Recommended:
 * Advance pill), the score-row (.ap-ring + Strong evidence + Top 12% for this role),
 * the 6 competency cards, the integrity timeline, and the reviewer signature footer.
 * Do not paste the surrounding <section className="border-t border-line py-14 lg:py-20">
 * — that's the landing's responsibility.
 */
export function SampleReportCard() {
  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_18px_56px_-28px_color-mix(in_oklch,var(--ink-deep)_28%,transparent)]">
      {/* Paste the inner card markup here (header → competencies → integrity timeline → reviewer footer). */}
    </div>
  );
}
```

The implementer pastes the actual card markup from the `/sample-report` page (it's already written). Keep all the inline-defined helpers (`LegendDot`, `Event`) co-located in this file by copying them too — they're file-local helpers.

- [ ] **Step 3: Verify**

```bash
cd /Users/rugwedpatharkar/Projects/Project/.claude/worktrees/vibrant-cannon-b9386c/frontend
npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit 2>&1 | grep -E '\.tsx?\(' | head -20
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/candidate/components/marketing/applicants-faq.tsx frontend/apps/candidate/components/marketing/sample-report-card.tsx
git commit -m "feat(landing): applicants FAQ + extracted SampleReportCard

- ApplicantsFaq: 10 candidate-POV questions (was mixed-audience FAQ; the
  recruiter-POV items already moved to HiringTeamsFaq in the previous phase)
- SampleReportCard: standalone report card extracted from /sample-report so the
  applicants landing can render it under 'What hiring teams see about you' —
  transparency move, same data both sides see

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Wire the applicants landing composition + swap `/` to use it

**Files:**
- Create: `frontend/apps/candidate/app/(marketing)/applicants-landing.tsx`
- Modify: `frontend/apps/candidate/app/page.tsx`

**Interfaces:**
- Consumes: every component built in Tasks 5 + 6, plus `<StatsBand/>` and `<PrivacyPanel/>` from prior tasks
- Produces: the composition file `<ApplicantsLanding/>` and the route binding at `/`

- [ ] **Step 1: Create `applicants-landing.tsx`**

```tsx
"use client";

import { MarketingShell, SignInBand } from "@ip/ui";
import { useAuth } from "../../lib/auth";
import { ApplicantsHero } from "../../components/marketing/applicants-hero";
import { ApplicantJourney } from "../../components/marketing/applicant-journey";
import { NoGhostingPromise } from "../../components/marketing/no-ghosting-promise";
import { Accommodations } from "../../components/marketing/accommodations";
import { PracticeSpotlight } from "../../components/marketing/practice-spotlight";
import { ApplicantsFaq } from "../../components/marketing/applicants-faq";
import { ApplicantFinalCta } from "../../components/marketing/applicant-final-cta";
import { SampleReportCard } from "../../components/marketing/sample-report-card";
import { PrivacyPanel } from "../../components/marketing/privacy-panel";
import { StatsBand } from "../../components/marketing/hiring-teams-sections";

export function ApplicantsLanding() {
  return (
    <MarketingShell audience="applicants">
      <ApplicantsHero />
      <StatsBand />
      <ApplicantJourney />
      <NoGhostingPromise />
      <section className="border-t border-line py-16 lg:py-24">
        <div className="ap-wrap">
          <div className="mb-10 grid max-w-[62rem] gap-3">
            <span className="text-[0.92rem] font-semibold text-coral">— Privacy</span>
            <h2
              className="text-[clamp(1.85rem,1.35rem+2.1vw,2.55rem)] font-bold leading-[1.06] tracking-[-0.028em] text-ink-deep"
              style={{ fontFamily: "var(--font-display)" }}
            >
              The strongest part of the system is everything we chose not to build.
            </h2>
          </div>
          <PrivacyPanel />
        </div>
      </section>
      <Accommodations />
      <PracticeSpotlight />
      <section className="border-t border-line py-16 lg:py-24">
        <div className="ap-wrap">
          <div className="mb-10 grid max-w-[62rem] gap-3">
            <span className="text-[0.92rem] font-semibold text-coral">— What hiring teams see about you</span>
            <h2
              className="text-[clamp(1.85rem,1.35rem+2.1vw,2.55rem)] font-bold leading-[1.06] tracking-[-0.028em] text-ink-deep"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Same report you can read. Same evidence. No hidden notes.
            </h2>
            <p className="text-[var(--step-1)] leading-relaxed text-ink-2 max-w-[62ch]">
              Every hiring team sees this exact report shape. The competencies, the
              quoted transcript evidence, the integrity timeline — none of it is hidden
              from you.
            </p>
          </div>
          <SampleReportCard />
        </div>
      </section>
      <SignInBand audience="applicants" useAuthHook={useAuth} />
      <ApplicantsFaq />
      <ApplicantFinalCta />
    </MarketingShell>
  );
}
```

- [ ] **Step 2: Swap `/` to use `<ApplicantsLanding/>`**

Edit `frontend/apps/candidate/app/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRequireRole } from "@ip/shared";

import { Dashboard } from "../components/dashboard";
import { ApplicantsLanding } from "./(marketing)/applicants-landing";
import { useAuth } from "../lib/auth";

export default function Home() {
  const { token, identity, ready } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useRequireRole(token ? identity?.role : "candidate", ["candidate"], ready);
  if (!mounted) return null;
  if (token) return identity?.role === "candidate" ? <Dashboard /> : null;

  return <ApplicantsLanding />;
}
```

(Same logic, just changes the import from `MarketingLanding` to `ApplicantsLanding`.)

- [ ] **Step 3: Verify**

```bash
cd /Users/rugwedpatharkar/Projects/Project/.claude/worktrees/vibrant-cannon-b9386c/frontend
npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit 2>&1 | grep -E '\.tsx?\(' | head -20
```

Expected: 0 errors. If the dev server is running, navigate to `/` and verify:
- Hero is coral, "Get seen. Get interviewed. Get hired." headline, dual CTA (Find roles + Sign in)
- 5-act applicant journey renders
- No-ghosting coral promise panel
- Privacy panel as standalone section
- Accommodations grid
- Practice spotlight
- Sample report card under "What hiring teams see about you"
- Sign-in band (coral focus rings) before FAQ
- Applicant-only FAQ
- Coral final CTA + "Hiring instead?" cross-link
- Footer: "For applicants" first column, "For hiring teams" cross-link group
- Top nav: brand + 4 nav links + "For hiring teams →" coral pill at right
- **NO utility rule above the nav**
- **NO sign-in button in the top nav**

- [ ] **Step 4: Commit**

```bash
git add frontend/apps/candidate/app/\(marketing\)/applicants-landing.tsx frontend/apps/candidate/app/page.tsx
git commit -m "feat(landing): / IS the applicants landing

- New ApplicantsLanding composition wires the 12-section spine:
  Hero → StatsBand → ApplicantJourney → NoGhostingPromise → PrivacyPanel →
  Accommodations → PracticeSpotlight → SampleReportCard → SignInBand →
  ApplicantsFaq → ApplicantFinalCta → MegaFooter
- app/page.tsx signed-out branch renders <ApplicantsLanding/> instead of the
  retired <MarketingLanding/>
- Signed-in candidate flow + role gate unchanged
- Sign-in band wires useAuth from lib/auth (injected via useAuthHook prop)
- The MarketingShell audience='applicants' drives the nav links + side-switcher

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: Delete the old `marketing-landing.tsx`

**Files:**
- Delete: `frontend/apps/candidate/app/(marketing)/marketing-landing.tsx`

- [ ] **Step 1: Confirm no remaining imports**

```bash
cd /Users/rugwedpatharkar/Projects/Project/.claude/worktrees/vibrant-cannon-b9386c
grep -rn 'marketing-landing\|MarketingLanding' frontend/apps/ 2>&1 | grep -v node_modules | grep -v '\.next' | grep -v tsbuildinfo
```

Expected: 0 hits (Task 7 swapped the only consumer).

- [ ] **Step 2: Delete the file**

```bash
rm frontend/apps/candidate/app/\(marketing\)/marketing-landing.tsx
```

- [ ] **Step 3: Verify**

```bash
cd /Users/rugwedpatharkar/Projects/Project/.claude/worktrees/vibrant-cannon-b9386c/frontend
npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit 2>&1 | grep -E '\.tsx?\(' | head -10
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add -u frontend/apps/candidate/app/\(marketing\)/marketing-landing.tsx
git commit -m "chore(landing): delete retired dual-audience marketing-landing.tsx

Sections moved to:
- components/marketing/hiring-teams-sections.tsx (14 shared sections)
- components/marketing/hiring-teams-hero.tsx
- components/marketing/hiring-teams-final-cta.tsx
- components/marketing/privacy-panel.tsx (extracted from DefenseSplit)

Routes:
- / now renders <ApplicantsLanding/>
- /hiring-teams renders the buyer-side composition

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase 4 — Verify + ship

### Task 9: Full verification per spec §9

- [ ] **Step 1: Typecheck both apps + api-client**

```bash
cd /Users/rugwedpatharkar/Projects/Project/.claude/worktrees/vibrant-cannon-b9386c/frontend
npx pnpm@9.15.0 --filter @ip/api-client typecheck
npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit
npx pnpm@9.15.0 --filter @ip/company exec tsc --noEmit
```

Expected: all three return 0 errors.

- [ ] **Step 2: Grep verifications**

```bash
cd /Users/rugwedpatharkar/Projects/Project/.claude/worktrees/vibrant-cannon-b9386c
grep -rn 'UtilityRule\|Pre-launch.*Aptura is opening pilots' frontend/apps/candidate/ frontend/packages/ui/src/ 2>&1 | grep -v node_modules | grep -v '\.next' | grep -v tsbuildinfo
```

Expected: 0 hits (utility rule fully deleted).

```bash
grep -rn 'Book a demo\|book a demo' frontend/ 2>&1 | grep -v node_modules | grep -v '\.next' | grep -v tsbuildinfo
```

Expected: 0 hits.

- [ ] **Step 3: Stop any running dev server, then production-build the candidate app**

```bash
cd /Users/rugwedpatharkar/Projects/Project/.claude/worktrees/vibrant-cannon-b9386c/frontend
# If preview server is running via preview_start, stop it first via preview_stop.
npx pnpm@9.15.0 --filter @ip/candidate build 2>&1 | tail -40
```

Expected: green build. Both `/` (static or `ƒ`) and `/hiring-teams` (static or `ƒ`) appear in the route table.

- [ ] **Step 4: Build the company app for parity**

```bash
npx pnpm@9.15.0 --filter @ip/company build 2>&1 | tail -10
```

Expected: green build.

- [ ] **Step 5: Browser verification (manual)**

Start the dev server via `preview_start name="candidate"`. Walk:

1. **Visit `/`** — confirm: coral hero, "Get seen. Get interviewed. Get hired.", dual CTA, no utility rule, no sign-in button in nav, "For hiring teams →" coral pill at top-right.
2. **Visit `/hiring-teams`** — confirm: teal hero, "Hire on proven merit. Cheat-proof by design.", dual CTA (Book a pilot + Sign in), "For applicants →" teal pill at top-right.
3. **Click "Sign in" in the hero on each side** — confirm smooth scroll to the sign-in band; correct themed band (coral on `/`, teal on `/hiring-teams`).
4. **Try a fake sign-in** — submit the form with garbage credentials; confirm an inline error appears via `role="alert"`, the Sign in button shows "Signing you in…" then re-enables on error.
5. **Use the side-switcher** — click "For hiring teams →" from `/`; confirm you land on `/hiring-teams` with the right hero + nav.
6. **Mobile (≤ 760px)** — resize viewport via `preview_resize preset="mobile"`; confirm hamburger menu, sign-in band stacks vertically, no horizontal overflow.
7. **Visit a sub-page** like `/trust` — confirm: still uses MarketingShell, no utility rule, side-switcher pointing to `/hiring-teams` (since neutral default is applicants), footer "For applicants" first column.

- [ ] **Step 6: Commit any final polish + push**

```bash
git status --short
# fix any nits surfaced during browser verification, commit them with the
# pattern "fix(landing): <what>" — one commit per nit, explicit paths.
git push origin claude/vibrant-cannon-b9386c
```

- [ ] **Step 7: Merge to main (user-decided)**

Per the project's git memory (no `gh` CLI on this repo, no checking out main locally — main is checked out in the primary worktree), the safe pattern is the fast-forward push that was used last time:

```bash
cd /Users/rugwedpatharkar/Projects/Project/.claude/worktrees/vibrant-cannon-b9386c
git fetch origin main
git rev-list --left-right --count origin/main...claude/vibrant-cannon-b9386c
# If output is "0 N" (0 behind, N ahead), fast-forward push is safe:
git push origin claude/vibrant-cannon-b9386c:main
```

If `origin/main` has moved (non-zero behind count), surface to the user — a merge commit is needed and they may want to do it via GitHub UI.

---

## Self-Review

**Spec coverage (§-by-§ from `docs/superpowers/specs/2026-06-21-two-sided-landing-design.md`):**

| Spec § | Implemented in |
|---|---|
| §1 Context | Plan opening + Global Constraints |
| §2.1 Terminology | Constraint locked; Tasks 4–7 use "Applicants" / "Hiring teams" in copy |
| §2.2 Default route | Task 7 swaps `/` to `ApplicantsLanding`; Task 4 creates `/hiring-teams` |
| §2.3 Audience-narrative spines | Two compositions: Task 4 (hiring-teams) + Task 7 (applicants), each with audience-specific order |
| §2.4 Sign-in placement | Task 2 (band), hero CTA anchors in Tasks 4 + 5 |
| §3.1 Routes | Tasks 4 + 7 |
| §3.2 Top nav per landing | Task 1 (audience-aware MegaNav) |
| §3.3 Sign-in band | Task 2 |
| §3.4 Cross-linking | Task 1 (nav switcher), Task 4 (HiringTeamsFinalCta cross-link), Task 5 (ApplicantFinalCta cross-link), Task 1 (footer audience prop) |
| §4 Applicants landing spine | Tasks 5 + 6 (components), Task 7 (composition) |
| §5 Hiring teams landing spine | Task 4 (composition + extracted sections) |
| §6 Cleanups (UtilityRule + Book a demo) | Task 1 (delete UtilityRule), Global Constraints (Book a demo rule), Task 9 Step 2 (grep verify) |
| §7 Component inventory | Tasks 1–8 map 1:1 |
| §8 Migration | File-by-file matches the plan's File Structure section |
| §9 Verification | Task 9 |
| §10 Non-goals | Constraints + plan does not touch them |
| §11 Risks | Side-switcher prominence (Task 1), cross-link (Task 4 + 5), sign-in scroll (Task 2 + 5 use anchor) — all addressed |
| §12 Implementation phasing | This plan's 4-phase structure |

No gaps.

**Placeholder scan:** the only intentional "fill-in" is the InterviewHud body in Task 4 Step 1 and the SampleReportCard body in Task 6 Step 2 — both are explicit instructions to paste verbatim from a specific source file (the source code already exists), not "implement later." The plan calls this out unambiguously and names the file + function to copy from. No "TBD" / "TODO" / "add appropriate X" anywhere.

**Type consistency:** the `LandingAudience` type is defined once in Task 1 (aperture-chrome.tsx), exported, and consumed by `MegaNav`, `MegaFooter`, `MarketingShell`, and `SignInBand` (Task 2) using the same string-literal-union `"applicants" | "hiring-teams"` everywhere. `useAuthHook` is the injection point for `useAuth` — defined once in Task 2's `SignInBandProps`, consumed by both compositions (Task 4 + 7) the same way. The `audience` prop default of `"applicants"` in `MegaNav` / `MegaFooter` (Task 1) is consistent with the spec's §3.1 "/ is the Applicants landing" decision (neutral pages default to applicant chrome).
