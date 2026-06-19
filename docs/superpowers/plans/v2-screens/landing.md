# Screen: Landing / marketing — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 0, reposition + foundation).
> **Route:** `frontend/apps/candidate/app/(marketing)/page.tsx` (NEW, public SSR) · **Mockup:** `aptura_landing_page_proctored` · **Pillar:** [landing-page-design](../../v2/2026-06-20-landing-page-design.md) (the full section-by-section spec) + [screens-frontend-build-plan §A](../../v2/2026-06-19-screens-frontend-build-plan.md)
> **Goal:** A public, crawlable, SSR marketing front door that leads with Aptura's three differentiators (no-ghosting · proctored/cheat-proof · merit), forks the two audiences, and routes the candidate hero **search** into the marketplace (`/jobs`) — **no new backend**.

This is the **one public, token-free marketing surface**. It diverges from the authed-gRPC pattern: it's a server component tree of **presentational** sections (no `useAuth`, no query), with a single small `"use client"` island for the hero search bar (which pushes to `/jobs?q=…&location=…`). It rides the existing `/public/jobs` read surface (from [marketplace-search](./marketplace-search.md)); stats are static demo values now, optionally hydrated from analytics KPIs later.

**Routing note (important):** the candidate app's current `app/page.tsx` is **landing-or-dashboard inline** (`components/dashboard.tsx` for authed, an inline hero for signed-out — verified in code). v2 splits the marketing landing into its **own route group** `app/(marketing)/page.tsx` so it is unambiguously public/SSR and the authed dashboard owns `app/page.tsx`. Because a route group `(marketing)` does **not** add a path segment, `(marketing)/page.tsx` and `page.tsx` would both resolve to `/` and **collide**. Resolve this in Task 6: the authed dashboard moves behind an explicit decision in `app/page.tsx` that renders the **marketing tree** when signed out and `<Dashboard/>` when signed in (keeping one `/` route), and the new sections live under `app/(marketing)/` as **components** imported by `app/page.tsx`. (Do **not** ship two `page.tsx` that both map to `/`.) The doc below builds the sections as a self-contained `MarketingLanding` tree; Task 6 wires it into the existing `/` decision.

---

## A. Backend contract (hand this to a backend session)

**Status:** EXISTING (no new backend) · **Service:** none new.

The landing page consumes **no gRPC and no new REST**. Two existing/optional touch points:

1. **Hero search** → routes (client-side `router.push`) to `/jobs?q=<title>&location=<loc>`; the **marketplace** screen owns the actual `/public/jobs` fetch ([marketplace-search](./marketplace-search.md) Part A). The landing never fetches jobs itself — it just composes the querystring and navigates.
2. **Stat strip numbers** → **static demo constants** for the first build (`100% answered · 12,400+ interviews · 1 fair interview · 3-day avg feedback`). A later enhancement may hydrate the outcome-rate + avg-response-time from the existing `Analytics` KPIs server-side; that is **out of scope here** and adds no new RPC (it reuses `api.analytics.*` if/when wired). Ship static first.

- **Auth/scope:** none — fully public, token-free, crawlable.
- **Backed by:** nothing new. No collection, no event, no proto delta. (Per [landing-page-design §4](../../v2/2026-06-20-landing-page-design.md): "No new backend, no new collections, no new events.")
- **SEO:** `app/sitemap.ts` + `app/robots.ts` are added in the [marketplace-search](./marketplace-search.md) Task 6 (sourcing published jobs from `/public/jobs`); the landing only needs static `metadata`.

**FE "contract"** — there is no data contract; the only typed shapes are the **static content models** the sections render off (defined in `content.ts`, Task 1). No `types.ts` mirroring a proto.

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `frontend/apps/candidate/app/(marketing)/content.ts` (static copy/data: stats, steps, diff cards, feature columns, value pills, testimonials — the proctored copy)
- Create: `frontend/apps/candidate/app/(marketing)/marketing-landing.tsx` (the section tree — server component composing the primitives below)
- Create: `frontend/apps/candidate/components/marketing/marketing-nav.tsx`
- Create: `frontend/apps/candidate/components/marketing/hero.tsx` (+ the `"use client"` `HeroSearch` island)
- Create: `frontend/apps/candidate/components/marketing/role-fork.tsx`
- Create: `frontend/apps/candidate/components/marketing/stat-strip.tsx`
- Create: `frontend/apps/candidate/components/marketing/how-it-works.tsx`
- Create: `frontend/apps/candidate/components/marketing/diff-strip.tsx`
- Create: `frontend/apps/candidate/components/marketing/merit-flow.tsx`
- Create: `frontend/apps/candidate/components/marketing/feature-columns.tsx`
- Create: `frontend/apps/candidate/components/marketing/value-pills.tsx`
- Create: `frontend/apps/candidate/components/marketing/testimonial.tsx`
- Create: `frontend/apps/candidate/components/marketing/marketing-footer.tsx`
- Create: `frontend/apps/candidate/app/(marketing)/content.test.ts` (copy invariants: proctored, not "no surveillance")
- Modify: `frontend/apps/candidate/app/page.tsx` (render `MarketingLanding` when signed out — Task 6)

**Components:** all **new presentational** marketing primitives (no auth, no query). Reuse from `@ip/ui`: `Logo`, `LogoMark`, `Button`/`buttonVariants`, `Card`/`CardContent`, `Badge`, `Input`, `ThemeToggle`, `cn`. Icons: `lucide-react` **outline** (declared in `apps/candidate/package.json` already), used **in the app** (never re-exported through `@ip/ui`).
**Query keys:** none (no data fetching).
**`--gradient-brand`:** allowed **only** on the Hero band and the Final-CTA band (`bg-[linear-gradient(135deg,#7c3aed,#4f46e5)]` or the documented `--gradient-brand` utility). Everything between uses flat semantic tokens so dark mode is automatic.

> **Copy source of truth:** [landing-page-design §2 table](../../v2/2026-06-20-landing-page-design.md) (the 11 sections) + §"Copy principles" (frame proctoring as **fairness — "same rules for everyone"**, never scrutiny; candidates are people, not "resources"). The mockup's older "no surveillance" copy is **superseded** — match `aptura_landing_page_proctored`.

### Task 1: Static content model + the proctored-copy guard test

- [ ] **Step 1: Write the failing test** — `frontend/apps/candidate/app/(marketing)/content.test.ts`. This locks the proctoring pivot in code (no "no surveillance" copy regresses in):
```ts
import { describe, it, expect } from "vitest";
import { STATS, DIFFERENTIATORS, STEPS, VALUE_PILLS, HERO } from "./content";

describe("landing content (proctored repositioning)", () => {
  it("ships the four outcome stats", () => {
    expect(STATS.map((s) => s.value)).toEqual(["100%", "12,400+", "1", "3-day"]);
  });
  it("leads with the three differentiators", () => {
    expect(DIFFERENTIATORS.map((d) => d.key)).toEqual(["answered", "cheatproof", "merit"]);
  });
  it("uses proctored/fair framing, never 'no surveillance'", () => {
    const blob = JSON.stringify({ STATS, DIFFERENTIATORS, STEPS, VALUE_PILLS, HERO }).toLowerCase();
    expect(blob).not.toContain("no surveillance");
    expect(blob).not.toContain("unmonitored");
    expect(blob).toContain("same rules for everyone");
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/candidate test content` → FAIL (`content.ts` not defined). *(If `apps/candidate` has no test runner wired, add `vitest` to its devDeps + a `test` script first — fold into this task; mirror whatever [marketplace-search](./marketplace-search.md) Task 1 establishes.)*
- [ ] **Step 3: Implement** `content.ts` (the proctored copy, typed):
```ts
import type { LucideIcon } from "lucide-react";
import {
  Bell, ShieldCheck, Scale, Search, Video, MessageSquareText, CheckCircle2,
  Sparkles, Building2, FileSearch, UserCheck, Send,
} from "lucide-react";

export const HERO = {
  eyebrow: "Unified hiring platform",
  h1: "Get seen. Get interviewed. Get hired.",
  subhead:
    "One place to apply, interview, and hear back — on a result you can trust.",
  // Trust microcopy — fairness framing, NOT scrutiny.
  micro: [
    "Free for candidates",
    "Proctored & fair — same rules for everyone",
    "Every application gets an answer",
  ],
} as const;

export interface Stat { value: string; label: string; }
export const STATS: Stat[] = [
  { value: "100%", label: "of applications answered" },
  { value: "12,400+", label: "interviews completed" },
  { value: "1", label: "fair interview — live video + voice" },
  { value: "3-day", label: "average feedback" },
];

export interface Diff { key: "answered" | "cheatproof" | "merit"; icon: LucideIcon; title: string; body: string; }
export const DIFFERENTIATORS: Diff[] = [
  { key: "answered", icon: Bell, title: "Answered, always",
    body: "Every application gets a real response — no ghosting, ever." },
  { key: "cheatproof", icon: ShieldCheck, title: "Cheat-proof",
    body: "A rigorously proctored interview — same rules for everyone — so a pass means something." },
  { key: "merit", icon: Scale, title: "On merit",
    body: "Judged on evidence from the interview, not pedigree or who you know." },
];

export interface Step { icon: LucideIcon; title: string; body: string; }
export const STEPS: Step[] = [
  { icon: Search, title: "Search & apply", body: "Find roles that fit and apply in a click." },
  { icon: Video, title: "Take your live interview", body: "A single proctored live video + voice interview — same for everyone." },
  { icon: MessageSquareText, title: "Get evidence-based feedback", body: "See how you did, grounded in what you actually said." },
  { icon: CheckCircle2, title: "Hear back, always", body: "A real answer on every application." },
];

export interface FlowNode { icon: LucideIcon; label: string; }
export const MERIT_FLOW: FlowNode[] = [
  { icon: Video, label: "Evidence captured" },
  { icon: Sparkles, label: "AI structures it" },
  { icon: UserCheck, label: "A human decides" },
  { icon: Bell, label: "You're notified" },
];

export interface FeatureCol { audience: "candidates" | "companies"; icon: LucideIcon; title: string; items: string[]; cta: { label: string; href: string }; }
export const FEATURES: FeatureCol[] = [
  { audience: "candidates", icon: Sparkles, title: "For candidates",
    items: ["Live video + voice interview", "Private practice runs", "Skill-gap feedback", "Real-time application status"],
    cta: { label: "Find your next job", href: "/jobs" } },
  { audience: "companies", icon: Building2, title: "For companies",
    items: ["Merit-based screening", "Advisory gate — you decide", "Evidence-based reports", "No-ghosting analytics"],
    cta: { label: "Start hiring on merit", href: COMPANY_HIRE_HREF } },
];

export const VALUE_PILLS = [
  "SOC 2", "GDPR-ready", "EEOC-aligned", "Bias-tested",
  "Proctored integrity", "Human-in-the-loop", "Audit trail",
] as const;

export interface Quote { body: string; name: string; role: string; }
export const TESTIMONIALS: Quote[] = [
  { body: "I applied, interviewed, and heard back in days — with actual feedback. Unheard of.",
    name: "Representative candidate", role: "Hired in 1 week" },
  { body: "We screen on merit at volume now, and our response rate is 100%. Our rating climbed.",
    name: "Representative recruiter", role: "Talent lead" },
];

// The "I'm hiring" fork + company feature CTA deep-link the company app. Configurable so
// the candidate origin never hard-codes a company hostname.
export const COMPANY_HIRE_HREF =
  process.env.NEXT_PUBLIC_COMPANY_URL ?? "http://localhost:3001";

export const FOOTER_TAGLINE = "Proctored. No ghosting. On merit.";
```
- [ ] **Step 4: Run test, verify it passes** — `npx pnpm@9.15.0 --filter @ip/candidate test content` → PASS.
- [ ] **Step 5: Commit** — `git add frontend/apps/candidate/app/\(marketing\) && git commit -m "feat(landing): static proctored content model + copy guard test"`. *(Per the global constraint this repo is local-only — replace the commit with the verify gate if the executor isn't committing. The skill's commit cadence is per-task.)*

### Task 2: `MarketingNav` + `MarketingFooter` (the bookends)

- [ ] **Step 1:** Create `components/marketing/marketing-nav.tsx` (server component — no auth):
```tsx
import Link from "next/link";
import { Logo, ThemeToggle, buttonVariants, cn } from "@ip/ui";
import { COMPANY_HIRE_HREF } from "../../app/(marketing)/content";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" aria-label="Aptura home"><Logo size="md" /></Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <a href={COMPANY_HIRE_HREF} className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">For companies</a>
          <a href="#how-it-works" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">How it works</a>
          <ThemeToggle />
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>Sign in</Link>
          <Link href="/register" className={cn(buttonVariants({ size: "sm" }))}>Get started</Link>
        </div>
      </nav>
    </header>
  );
}
```
- [ ] **Step 2:** Create `components/marketing/marketing-footer.tsx` (mark + wordmark + 3 link columns + `© 2026 Aptura · Proctored. No ghosting. On merit.`). Use `LogoMark`, token text colors, `FOOTER_TAGLINE`. Columns: **Candidates** (`/jobs`, `/login`, `/register`), **Companies** (`COMPANY_HIRE_HREF` deep-links), **Company** (`#how-it-works`, About — `#`).
- [ ] **Step 3: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate typecheck` → clean (fix any `@ip/ui` prop mismatch against source — `buttonVariants({variant,size})`, `Logo size`).
- [ ] **Step 4: Commit** — `git commit -am "feat(landing): MarketingNav + MarketingFooter"`.

### Task 3: `Hero` (gradient band + role fork + search island)

- [ ] **Step 1:** Create `components/marketing/role-fork.tsx` (`"use client"` — two pills that swap the hero's active panel; default *I'm looking for a job*):
```tsx
"use client";
import { cn } from "@ip/ui";

export type Role = "seeker" | "hirer";
export function RoleFork({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  const tab = (r: Role, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={value === r}
      onClick={() => onChange(r)}
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
        value === r ? "bg-white text-brand-700" : "text-white/80 hover:text-white",
      )}
    >
      {label}
    </button>
  );
  return (
    <div role="tablist" aria-label="What brings you here" className="inline-flex gap-1 rounded-full bg-white/15 p-1">
      {tab("seeker", "I'm looking for a job")}
      {tab("hirer", "I'm hiring")}
    </div>
  );
}
```
- [ ] **Step 2:** Create `components/marketing/hero.tsx`. The band uses `--gradient-brand`; it holds the `RoleFork` + a `"use client"` `HeroSearch` (title/skill `Input` + location `Input` + a Search `Button`) that `router.push`es to `/jobs`. When the fork is *I'm hiring*, swap the search for a "Post a job" CTA → `COMPANY_HIRE_HREF`. Because the fork + search are interactive, the **hero is a client component**; the surrounding `MarketingLanding` stays a server component and renders `<Hero/>`.
```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, cn } from "@ip/ui";
import { Search, ArrowRight } from "lucide-react";
import { HERO, COMPANY_HIRE_HREF } from "../../app/(marketing)/content";
import { RoleFork, type Role } from "./role-fork";

export function Hero() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("seeker");
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState("");

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (loc.trim()) params.set("location", loc.trim());
    router.push(`/jobs${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <section className="relative isolate overflow-hidden bg-[linear-gradient(135deg,#7c3aed,#4f46e5)] text-white">
      {/* Faint aperture motif — focus/clarity, never a watching eye. */}
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full border border-white/10" />
      <div className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28">
        <span className="text-sm font-medium uppercase tracking-wide text-white/80">{HERO.eyebrow}</span>
        <h1 className="mt-4 font-display text-4xl font-bold tracking-tight sm:text-5xl">{HERO.h1}</h1>
        <p className="mx-auto mt-4 max-w-xl text-balance text-base text-white/90 sm:text-lg">{HERO.subhead}</p>

        <div className="mt-8 flex justify-center"><RoleFork value={role} onChange={setRole} /></div>

        {role === "seeker" ? (
          <form onSubmit={onSearch} className="mx-auto mt-6 flex max-w-2xl flex-col gap-2 sm:flex-row">
            <Input aria-label="Job title or skill" placeholder="Title or skill" value={q}
              onChange={(e) => setQ(e.target.value)} className="bg-white text-foreground" />
            <Input aria-label="Location" placeholder="Location" value={loc}
              onChange={(e) => setLoc(e.target.value)} className="bg-white text-foreground sm:max-w-[40%]" />
            <Button type="submit" size="lg" leadingIcon={Search} className="bg-white text-brand-700 hover:bg-white/90">Search</Button>
          </form>
        ) : (
          <a href={COMPANY_HIRE_HREF}
            className="mx-auto mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-medium text-brand-700 hover:bg-white/90">
            Post a job <ArrowRight className="size-4" aria-hidden />
          </a>
        )}

        <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-white/80">
          {HERO.micro.map((m) => <li key={m} className={cn("after:mx-2 after:text-white/40 after:content-['·'] last:after:content-['']")}>{m}</li>)}
        </ul>
      </div>
    </section>
  );
}
```
- [ ] **Step 3: Verify** — `--filter @ip/candidate typecheck` clean (confirm `Input`/`Button` accept `className`; both do — they spread HTML attrs / extend `ButtonProps`).
- [ ] **Step 4: Commit** — `git commit -am "feat(landing): Hero gradient band + role fork + search island"`.

### Task 4: The mid-page bands (`StatStrip`, `DiffStrip`, `HowItWorks`, `MeritFlow`)

- [ ] **Step 1:** `components/marketing/stat-strip.tsx` — a 4-up grid of `STATS`; the **number** in Sora (`font-display`), violet (`text-brand-600`), the label muted. (Server component.)
```tsx
import { STATS } from "../../app/(marketing)/content";

export function StatStrip() {
  return (
    <section className="border-y border-border bg-surface">
      <dl className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-6 py-12 sm:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="text-center">
            <dt className="font-display text-3xl font-bold text-brand-600">{s.value}</dt>
            <dd className="mt-1 text-sm text-muted-foreground">{s.label}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
```
- [ ] **Step 2:** `components/marketing/diff-strip.tsx` — the wedge: a heading ("The hiring platform that doesn't ghost you — and gives a result you can trust.") + 3 `Card`s from `DIFFERENTIATORS` (icon in a `bg-brand-100` circle, title, body). This is the differentiator section — pillars 1–3.
- [ ] **Step 3:** `components/marketing/how-it-works.tsx` — `id="how-it-works"`; 4 `STEPS` as numbered rows/cards with gradient icon circles (the **one** other place gradient-ish accents are okay — keep it the brand violet circle, not a full band). Candidate journey = the tagline.
- [ ] **Step 4:** `components/marketing/merit-flow.tsx` — "A fair shot you can actually see." + a horizontal `MERIT_FLOW` (Evidence captured → AI structures it → A human decides → You're notified) with arrows between nodes; stacks vertically on mobile. This is explainability-as-a-diagram (human-in-the-loop).
- [ ] **Step 5: Verify** — `--filter @ip/candidate typecheck` clean.
- [ ] **Step 6: Commit** — `git commit -am "feat(landing): StatStrip + DiffStrip + HowItWorks + MeritFlow"`.

### Task 5: Two-sided bands (`FeatureColumns`, `ValuePills`, `Testimonial`) + final CTA

- [ ] **Step 1:** `components/marketing/feature-columns.tsx` — twin `Card`s from `FEATURES` (Wellfound-style two columns): For candidates / For companies, each a checklist (`CheckCircle2` rows) + its CTA (`buttonVariants`); the company CTA is an `<a href={COMPANY_HIRE_HREF}>`.
- [ ] **Step 2:** `components/marketing/value-pills.tsx` — "Built to be trusted." + `VALUE_PILLS` as `Badge variant="outline"` pills (compliance reframed as values; **Proctored integrity** is one pill).
- [ ] **Step 3:** `components/marketing/testimonial.tsx` — the two `TESTIMONIALS` quotes; **amber** (`text-amber-500`) is allowed **only** here for a star rating row. Mark them representative/demo.
- [ ] **Step 4:** Add the **Final CTA** band inline in `marketing-landing.tsx` (a second `--gradient-brand` band): "Ready when you are." + dual buttons **Find your next job** (`/jobs`) + **Start hiring on merit** (`COMPANY_HIRE_HREF`).
- [ ] **Step 5: Verify** — `--filter @ip/candidate typecheck` clean.
- [ ] **Step 6: Commit** — `git commit -am "feat(landing): FeatureColumns + ValuePills + Testimonial + final CTA"`.

### Task 6: Compose `MarketingLanding` + wire into the public `/` decision

- [ ] **Step 1:** Create `app/(marketing)/marketing-landing.tsx` (server component — the section spine in [landing-page-design](../../v2/2026-06-20-landing-page-design.md) order):
```tsx
import { MarketingNav } from "../../components/marketing/marketing-nav";
import { Hero } from "../../components/marketing/hero";
import { StatStrip } from "../../components/marketing/stat-strip";
import { DiffStrip } from "../../components/marketing/diff-strip";
import { HowItWorks } from "../../components/marketing/how-it-works";
import { MeritFlow } from "../../components/marketing/merit-flow";
import { FeatureColumns } from "../../components/marketing/feature-columns";
import { ValuePills } from "../../components/marketing/value-pills";
import { Testimonial } from "../../components/marketing/testimonial";
import { FinalCta } from "../../components/marketing/final-cta";       // or inline
import { MarketingFooter } from "../../components/marketing/marketing-footer";

export function MarketingLanding() {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <main>
        <Hero />
        <StatStrip />
        <DiffStrip />
        <HowItWorks />
        <MeritFlow />
        <FeatureColumns />
        <ValuePills />
        <Testimonial />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
```
- [ ] **Step 2:** Modify `app/page.tsx` to render `MarketingLanding` for signed-out visitors **in place of** the current inline hero (keep the existing `useRequireRole(token ? identity?.role : "candidate", ["candidate"], ready)` + `mounted` hydration guard + `if (token) return <Dashboard/>`). Replace only the signed-out JSX return with `return <MarketingLanding />;`. Add `export const metadata = { title: "Aptura — Get seen. Get interviewed. Get hired." };` (page is a `"use client"` component today; if metadata can't sit on a client page, lift the marketing tree into a server `(marketing)/page.tsx` and have the client `/` redirect-or-render — but the **simplest** path that keeps one `/` is: `app/page.tsx` stays the auth decision, `MarketingLanding` is the signed-out body, and SSR crawlability comes from the sections being server components rendered inside it). **Do not** create a second `page.tsx` mapping to `/`.
- [ ] **Step 3: Verify build + preview** — `npx pnpm@9.15.0 --filter @ip/candidate build` clean (stop `pnpm dev` first — never `next build` while dev is live). Then via the preview loop: load `/` signed out → the full marketing page renders; the hero search routes to `/jobs?q=…`; the role fork swaps to the "Post a job" CTA; `For companies` / company CTAs deep-link the company origin; dark mode flips the mid bands but keeps the two violet bands; mobile stacks the hero + columns. Screenshot. Confirm a signed-in candidate still lands on `<Dashboard/>` (the marketing tree is not shown).
- [ ] **Step 4: Commit** — `git commit -am "feat(landing): compose MarketingLanding + wire signed-out / route"`.

---

## C. States & acceptance
- **States:** this is a static marketing surface — **no loading/empty/error data states** (nothing fetched). The only interactive states: the hero `RoleFork` (seeker/hirer toggle) and the `HeroSearch` form (which navigates). Static stats render immediately (SSR).
- **Responsive:** hero stacks (search inputs → column on mobile); the 4-up stat grid → 2-up; feature twin columns → single column; the merit flow → vertical with down-arrows; nav collapses the secondary links on mobile.
- **Dark mode:** tokens only between bands → automatic. The two brand bands (hero, final CTA) stay violet in both themes (white text), per [landing-page-design §3](../../v2/2026-06-20-landing-page-design.md).
- **A11y:** the role fork is a `role="tablist"` with `aria-selected`; the hero search is a `<form>` with labelled `Input`s; decorative aperture/icon motifs are `aria-hidden`; one `<h1>` (the tagline); section landmarks; outline icons only.
- **Acceptance:** matches `aptura_landing_page_proctored` (11 sections, role-forked search hero, differentiator-led); **proctored/fair framing throughout — zero "no surveillance" copy** (locked by the Task 1 test); SSR/crawlable (titles + copy in the server-rendered HTML, token-free); `--gradient-brand` only on hero + final CTA, product-flat elsewhere; `--filter @ip/candidate build` + `typecheck` green; the hero search integrates with the existing `/jobs` marketplace with no new backend.
