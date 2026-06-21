# Aptura — Two-Sided Landing Redesign

**Date:** 2026-06-21
**Author:** FE design session
**Status:** Spec — pending implementation plan
**Replaces:** the unified Aperture Pro landing (`apps/candidate/app/(marketing)/marketing-landing.tsx`)
**Touches only:** the public marketing surface (`/`, `/hiring-teams`, top-nav + footer chrome). Backend frozen.

---

## 1 · Context — why this exists

The current Aperture Pro landing at `/` is dual-audience: one page tries to sell to both applicants and hiring teams at once. Three real problems with that:

1. **Both audiences are second-class.** When one page serves two audiences, neither story can go deep. Applicants don't see "your journey"; hiring teams don't see "your funnel." Both get a compromise pitch.
2. **The terminology is industry-default-bad.** "Candidates" and "Companies" are transactional ATS-coded words. Market research across 25+ platforms (Mercor, Wellfound, Welcome to the Jungle, LinkedIn, Toptal, Andela, Braintrust, HireVue, HackerRank, CodeSignal, Sapia, metaview, Ribbon, etc.) shows best-in-class brands use **asymmetric pairs** that flatter the supply side (Mercor's "Experts", HackerRank's "Developers"). Aptura's current "candidates/companies" leans inventory.
3. **The sign-in is buried.** The current top-nav has Sign in + Book a pilot + audience switch — that's three buyer-facing controls competing in the header. Returning users don't have a clear surface; first-time visitors get cognitive load.

And two mechanical cleanups roll into the same refactor:

- The persistent **pre-launch utility rule** ("*Aptura is opening pilots with a small set of teams hiring on proven merit — Request a pilot →*") sits above every nav on every public page. It's noise. The pre-launch posture is communicated everywhere else (footer badges, hero copy, FAQ); this strip is duplication.
- The phrase **"Book a demo"** should never appear in Aptura copy (the pre-launch posture says "pilot," not "demo"). Confirmed zero instances in active code at time of writing; this spec captures the rule so it stays gone.

## 2 · The four locked decisions (with rationale)

These were made via brainstorm in the design session. The market research that informed them lives in the agent report referenced under [Sources](#13--sources).

### 2.1 · Terminology: **Applicants / Hiring teams**

- **Applicants** owns the brand's central promise (*every applicant gets a real answer*). Reclaims a low-status industry word the way Mercor reclaimed "Experts." Survives every UI surface: nav label, route (`/applicants` would have been the route — see 2.2), product copy ("4,217 applicants this week"), email subject.
- **Hiring teams** (not "Employers", not "Companies") signals Aptura is built for the humans who run interview loops, not procurement. Matches the proctored-interview operational reality.
- Voice test: *"Built for applicants. Made for hiring teams."* Both halves carry equal weight.
- **Alternates considered and rejected:** "Talent / Teams" (implies pre-curated supply — contradicts merit thesis); "Performers / Hiring teams" (most distinctive but gig-economy connotation); "Candidates / Companies" (industry default but transactional).

### 2.2 · Default route: `/` IS the **Applicants landing**

- Convention (Wellfound, Indeed, Welcome to the Jungle Solutions, Toptal) defaults `/` to the buyer side because the buyer pays. We invert.
- **Why we invert:** Aptura's thesis is that *applicants are the protagonist* (no-ghosting, merit-not-pedigree, evidence-based). Defaulting `/` to applicants commits to the thesis at the URL level — same move Mercor makes with their dual-CTA hero leading with "Experts."
- Trade-off: a hiring-team visitor lands on the applicant page first. Mitigated by a visible "**For hiring teams →**" side-switcher in the top-right of the nav (see §3.3) and a final-CTA cross-link.
- `/hiring-teams` is the buyer landing. NOT `/applicants` for both — `/` is the applicant page so we don't double-link.

### 2.3 · Structure: **Audience-narrative spines** (different shapes per side)

- Both landings DON'T share a mirror spine. Each audience has a distinct story to tell:
  - **Applicants** want the journey (apply → practice → sit interview → get answered → hired) and trust ("what Aptura does NOT do," accommodations, no ghosting).
  - **Hiring teams** want the funnel (résumé → evidence → integrity timeline → advisory → decision audit) and proof (vs take-home, sample report, bias-aware-by-design).
- Symmetric spine would feel artificial; shared spine + modules would feel templated. Tell two stories well.
- Some sections appear on both (the hero structure, the sign-in band, the FAQ shell) but the **content + framing is audience-specific** in every section.

### 2.4 · Sign-in placement: **dual-CTA hero + dedicated mid-page sign-in band**

- Hero stays pitch-focused (primary CTA + small "Sign in" link). No sign-in form inline in the hero — that would compete with the headline for visual weight.
- A dedicated **"Returning?"** band sits one screen down, before the FAQ, with the inline email + password form. Returning users get a clear scroll target without the marketing pitch yelling at them.
- Pattern used by Linear, Vercel, Ramp. Cleanest hero, sign-in still on the page (per the user's "in landing pages rather than top nav bar" requirement).
- **The top nav has NO Sign-in button.** That's the single biggest IA change.

## 3 · Architecture

### 3.1 · Routes

| Route | Page | Status |
|---|---|---|
| `/` | **Applicants landing** | NEW page (replaces current dual-audience landing) |
| `/hiring-teams` | **Hiring teams landing** | NEW route, inherits current Aperture Pro 16-section landing (buyer-framed) |
| `/login` | Existing auth-card login page | Unchanged (sign-in band on landings POSTs here / submits same form) |
| `/register`, `/company/register`, `/forgot`, `/reset`, `/verify`, `/auth/callback` | Existing auth screens | Unchanged |
| All other public routes (`/jobs`, `/jobs/[id]`, `/companies/[id]`, `/trust`, `/sample-report`, `/pilot`, `/waitlist`, `/privacy`, `/terms`, `/dpa`, `/status`, `/accessibility`, `/compare/take-home`, `/ai-explainability`, `/what-we-dont-do`) | Unchanged | Their utility-rule band is removed (see §6) but content + chrome stay |

**Post-login routing** (unchanged from current): applicant token → `/` (which then renders the candidate dashboard via the existing role-routed `app/page.tsx`); recruiter / `company_admin` token → `/company`.

### 3.2 · Top nav per landing (sign-in NOT here)

Each landing renders a slightly different nav. Same `MegaNav` component, configured per side.

**Applicants landing (`/`) nav:**
- Brand (`Aptura` + aperture mark) — links to `/`
- `How it works` — anchor `#journey`
- `Sample report` — links to `/sample-report`
- `Privacy` — links to `/what-we-dont-do`
- `Accessibility` — links to `/accessibility`
- **Right-edge:** `For hiring teams →` (small coral-tinted button) — links to `/hiring-teams`
- **NO "Sign in" button. NO "Book a pilot" button.** (Hero owns the CTAs.)

**Hiring teams landing (`/hiring-teams`) nav:**
- Brand — links to `/hiring-teams`
- `How it works` — anchor `#how`
- `Sample report` — links to `/sample-report`
- `Compare` — links to `/compare/take-home`
- `Trust` — links to `/trust`
- **Right-edge:** `For applicants →` (small teal-tinted button) — links to `/`
- **NO "Sign in" button. NO "Book a pilot" button.** (Hero owns the CTAs.)

**Mobile** (≤ 760px): nav collapses to hamburger → full-height sheet listing the same items + the side-switcher pinned at the bottom of the sheet.

### 3.3 · Sign-in band (shared component, mid-page)

**Component:** `<SignInBand audience="applicants" | "hiring-teams" />` in `@ip/ui` (or co-located if app-only).

**Placement:** before the FAQ on each landing. The wrapping `<section>` carries `id="sign-in"` so hero "Sign in" links can anchor to it via `href="#sign-in"`.

**Layout (lg+):** two-column.

- **Left column:** *"Returning?"* eyebrow → headline "Pick up where you left off." → 3 bullets describing what returning users get (applicants: your applications · your saved jobs · your interview score; hiring teams: your funnel · your pipeline · your audit log)
- **Right column:** inline form (vertical stack inside the form column)
  - email field (autocomplete="email", required)
  - password field (autocomplete="current-password", required)
  - **Sign in** button (themed: coral on applicants, teal on hiring teams)
  - "Forgot password?" link directly below the button → `/forgot`
  - Footer line at the bottom of the form column: *"Don't have an account?"* + **"Create one →"** link (routes to `/register` for applicants, `/company/register` for hiring teams)

**Mobile** (≤ 760px): stacks vertically (returning-pitch on top, form below).

**Submission:** uses the existing `useAuth().login(email, password)` seam — same call the dedicated `/login` page makes. After successful login, the existing role-routed `app/page.tsx` takes over (applicants → `/`, hiring teams → `/company`).

**Visual treatment:** themed band background (very faint coral wash on applicants, faint teal wash on hiring teams) so it's visually distinct from the surrounding pitch sections but not yelling.

### 3.4 · Cross-linking (top → bottom)

Three surfaces:

1. **Top nav side-switcher** (primary) — small button at the right edge of the nav. Always visible.
2. **Final-CTA band cross-link** — under the primary CTA: "Hiring instead? See Aptura for hiring teams →" (and inverse on the other side).
3. **Footer** — first column on each landing is **"For applicants"** + **"For hiring teams"** with the primary path link to each.

## 4 · Applicants landing (`/`) — section spine

Each section is one applicants actually care about; the order matches the applicant's mental model (curiosity → trust → action).

| # | Section | Component name | Content summary |
|---|---|---|---|
| 1 | **Hero** | `<ApplicantsHero/>` | Headline: *"Get seen. Get interviewed. Get hired."* · Sub: "One fair, proctored AI interview. Always hear back — with a real answer and a reason." · Dual CTA: **Find roles** (primary teal) → `/jobs` · **Sign in** (secondary link, anchor to `#sign-in`) · Live `<InterviewHud/>` reframed: tagline above the HUD reads "*The interview you'll sit*" |
| 2 | **By-design stats** | `<StatsBand/>` (reused) | 3 truthful product-architecture facts: *1 interview per role · 100% applicants answered · 0 raw video/audio leaves your browser* |
| 3 | **Your journey** | `<ApplicantJourney/>` | 5 numbered acts (mirrors current hiring-teams `<HowItHappens/>` but candidate-POV): 1.0 Browse roles you fit · 2.0 Apply (one profile, every role) · 3.0 Practice for free · 4.0 Sit one proctored interview · 5.0 Get a real answer + the report behind it. Each act has a mini-visual (browse/apply card · practice runner · interview HUD · outcome verdict). |
| 4 | **No-ghosting promise** | `<NoGhostingPromise/>` | Coral hero panel: *"Every applicant gets a real answer. With feedback."* + 3 bullets: *You'll know · With a real reason, never silence · The same way for every applicant.* Brand-defining moment. (Pre-launch posture — no SLA "within X days" claims until pilots prove a number.) |
| 5 | **Privacy — what Aptura does NOT do** | `<DefensePrivacy/>` (existing `.ap-def-panel--privacy`) | The applicant trust answer: 6 constraints. No real-time watcher · No raw media leaves browser · No emotion inference · No voiceprints · No surveillance creep · Right-to-erase honored. |
| 6 | **Accommodations are first-class** | `<Accommodations/>` | 4 commitments: extended time, captions, screen-reader paths, alt-modes. Note: "Doesn't affect your score, doesn't appear in your report." Link to `/accessibility` for the full statement. |
| 7 | **Practice mode** | `<PracticeSpotlight/>` | "Sit a full practice round, free." Same UI, same rubric, no scoring against you. CTA → `/practice` (post-sign-in). |
| 8 | **What hiring teams see about you** | `<SampleReportCard/>` (existing, reframed) | Embed the sample evidence report card (Aptura Score + competency cards + quoted transcript) under the headline *"What hiring teams see about you."* Transparency move — same data both sides see. |
| 9 | **Sign-in band** | `<SignInBand audience="applicants"/>` | See §3.3 |
| 10 | **FAQ** | `<Faq audience="applicants"/>` | 10 applicant-POV questions only (no hiring-team Qs): privacy, fairness, accommodations, practice, retakes, time, accessibility, what-they-see, re-score, contact |
| 11 | **Final CTA** | `<ApplicantFinalCta/>` | Coral gradient panel. Primary: **Find roles** → `/jobs`. Cross-link below: "Hiring instead? See Aptura for hiring teams →" → `/hiring-teams` |
| 12 | **Footer** | `<MegaFooter audience="applicants"/>` | First column = **For applicants** (current candidate-relevant links). Second column = **For hiring teams** (cross-link group). Then Trust · Company · Legal. |

## 5 · Hiring teams landing (`/hiring-teams`) — section spine

Inherits the current Aperture Pro 16-section landing's bones (which were already buyer-side) with surgical adjustments. Most sections **reuse existing components** — this is mostly a re-mount + nav config change, not a fresh design.

| # | Section | Component name | Notes |
|---|---|---|---|
| 1 | **Hero** | `<HiringTeamsHero/>` | *"Hire on proven merit. Cheat-proof by design."* Dual CTA: **Book a pilot** (primary teal) → `/pilot` · **Sign in** (secondary link, anchor to `#sign-in`) · Live `<InterviewHud/>` = the integrity monitor view (existing). Utility rule above hero **removed**. |
| 2 | **By-design stats** | `<StatsBand/>` | Existing — unchanged |
| 3 | **The shift** | `<EvidenceFlip/>` | Existing — résumé → evidence flip |
| 4 | **How an Aptura interview happens** | `<HowItHappens/>` | Existing — 5 acts (recruiter POV) |
| 5 | **Integrity timeline** | `<IntegrityTimeline/>` | Existing — the killer artifact |
| 6 | **Defense + privacy split** | `<DefenseSplit/>` | Existing |
| 7 | **Evidence-based report** | `<EvidenceReport/>` | Existing — sample |
| 8 | **Advisory gate** | `<AdvisoryGate/>` | Existing — *AI recommends. Humans decide.* |
| 9 | **vs the old way** | `<CompareTable/>` | Existing |
| 10 | **What you get** | `<WhatYouGet/>` | Existing — 4 artifacts |
| 11 | **Trust band** | `<TrustBand/>` | Existing — pre-launch posture |
| 12 | **Designed for** | `<DesignedFor/>` | Existing — verticals grid |
| 13 | **Early access** | `<EarlyAccess/>` | Existing — pilot / talk-to-us |
| 14 | **Sign-in band** | `<SignInBand audience="hiring-teams"/>` | NEW — same component, teal-themed |
| 15 | **FAQ** | `<Faq audience="hiring-teams"/>` | Existing FAQ filtered: 10 recruiter-POV Qs only (strip candidate-POV Qs out into the applicants FAQ in §4) |
| 16 | **Final CTA** | `<HiringTeamsFinalCta/>` | Existing `<FinalCta/>` reframed: single audience (hiring teams). Primary: **Book a pilot**. Cross-link below: "Looking for work? See Aptura for applicants →" → `/` |
| 17 | **Mega-footer** | `<MegaFooter audience="hiring-teams"/>` | First column = **For hiring teams**. Second column = **For applicants** (cross-link group). |

## 6 · Cleanups (folded into the same PR)

| Cleanup | Where | Action |
|---|---|---|
| ❌ Pre-launch utility rule | Top of every public page (`MarketingShell`) | **Delete** `<UtilityRule/>` from `MarketingShell`. The pre-launch posture is communicated elsewhere (footer badges, hero copy, FAQ, etc.). |
| ❌ "Book a demo" copy | (Confirmed zero instances in active code) | **Rule** (captured in this spec): the phrase "Book a demo" must not appear in Aptura copy. All buyer CTAs use **"Book a pilot"**. Add a CI grep check if useful. |

The 14 other public surfaces (`/trust`, `/sample-report`, `/privacy`, `/terms`, `/dpa`, `/status`, `/accessibility`, `/compare/take-home`, `/ai-explainability`, `/what-we-dont-do`, `/jobs`, `/jobs/[id]`, `/companies/[id]`, `/pilot`, `/waitlist`) keep their current MarketingShell + nav but with utility rule deleted. Sub-page navs unchanged. They remain dual-audience public-info pages (not audience-specific).

## 7 · Component inventory — new vs reused

**New components (this spec creates):**
- `<ApplicantsHero/>` — hero for `/`
- `<ApplicantJourney/>` — 5-act candidate journey
- `<NoGhostingPromise/>` — coral panel
- `<Accommodations/>` — 4-commitment grid
- `<PracticeSpotlight/>` — practice CTA card
- `<ApplicantFinalCta/>` — coral gradient final CTA
- `<HiringTeamsHero/>` — hero for `/hiring-teams` (renamed from current `<Hero/>`)
- `<HiringTeamsFinalCta/>` — teal gradient final CTA (renamed from current `<FinalCta/>`)
- `<SignInBand audience="…"/>` — shared mid-page sign-in
- `<Faq audience="…"/>` — FAQ filtered by audience prop
- `<MegaFooter audience="…"/>` — footer first column is audience-specific

**Reused without change:** `<StatsBand/>`, `<EvidenceFlip/>`, `<HowItHappens/>`, `<IntegrityTimeline/>`, `<DefenseSplit/>`, `<EvidenceReport/>`, `<AdvisoryGate/>`, `<CompareTable/>`, `<WhatYouGet/>`, `<TrustBand/>`, `<DesignedFor/>`, `<EarlyAccess/>`, `<SampleReportCard/>` (existing in the demo as the sample-report viewer page; lift the inner card component for re-use in §4 row 8).

**Reused with extraction:** the applicants landing §5 (Privacy — what Aptura does NOT do) renders ONLY the `.ap-def-panel--privacy` half of the existing `<DefenseSplit/>`. Implementation plan should either (a) extract the privacy half into a standalone `<PrivacyPanel/>` component reused by both `<DefenseSplit/>` and the new applicants page, or (b) pass a `mode="privacy-only"` prop to `<DefenseSplit/>`. (a) is cleaner.

**Modified:** `<MegaNav/>` accepts an `audience` prop that swaps the sub-page links + the side-switcher target + the side-switcher color. `<MarketingShell/>` drops `<UtilityRule/>` entirely.

## 8 · Migration — what files change

**Files deleted:**
- `frontend/apps/candidate/app/(marketing)/marketing-landing.tsx` (current dual-audience landing). Its sections become two new files.

**Files created:**
- `frontend/apps/candidate/app/(marketing)/applicants-landing.tsx` — `/` page composition
- `frontend/apps/candidate/app/hiring-teams/page.tsx` — `/hiring-teams` route
- `frontend/apps/candidate/components/marketing/applicants-hero.tsx`
- `frontend/apps/candidate/components/marketing/applicant-journey.tsx`
- `frontend/apps/candidate/components/marketing/no-ghosting-promise.tsx`
- `frontend/apps/candidate/components/marketing/accommodations.tsx`
- `frontend/apps/candidate/components/marketing/practice-spotlight.tsx`
- `frontend/apps/candidate/components/marketing/applicant-final-cta.tsx`
- `frontend/apps/candidate/components/marketing/hiring-teams-hero.tsx`
- `frontend/apps/candidate/components/marketing/hiring-teams-final-cta.tsx`
- `frontend/apps/candidate/components/marketing/sign-in-band.tsx`
- `frontend/apps/candidate/components/marketing/faq.tsx` (already exists — modified to accept `audience` prop)

**Files modified:**
- `frontend/apps/candidate/app/page.tsx` — signed-out branch renders `<ApplicantsLanding/>` instead of `<MarketingLanding/>`
- `frontend/packages/ui/src/aperture-chrome.tsx` — `MegaNav` accepts `audience` prop (props: `audience: 'applicants' | 'hiring-teams'`, optional `signInVisible: boolean` default false); `MarketingShell` accepts `audience` and DROPS `<UtilityRule/>` entirely (no flag — it's gone)
- `frontend/packages/ui/src/index.ts` — re-export `SignInBand`

**Files unchanged:**
- All other v3 routes (auth, applicant dashboards, recruiter dashboards, `/company/*` tree, 14 sub-page public surfaces)
- `frontend/packages/api-client/*`, `frontend/packages/shared/*`
- All backend (`src/`, `*.proto`, `gen/`)

## 9 · Verification

After implementation:

1. `npx pnpm@9.15.0 --filter @ip/api-client typecheck` → 0 errors
2. `npx pnpm@9.15.0 --filter @ip/candidate exec tsc --noEmit` → 0 errors
3. `npx pnpm@9.15.0 --filter @ip/candidate build` → green, both `/` and `/hiring-teams` build
4. `grep -rn 'UtilityRule\|Pre-launch.*Aptura is opening pilots' frontend/apps/candidate/` returns 0 hits (utility rule deleted)
5. `grep -rn 'Book a demo\|book a demo' frontend/` returns 0 hits (rule enforced)
6. Manually click each side: `/` renders `<ApplicantsHero/>` with **Find roles** + **Sign in** CTAs and coral side-switcher to `/hiring-teams`; `/hiring-teams` renders `<HiringTeamsHero/>` with **Book a pilot** + **Sign in** CTAs and teal side-switcher to `/`.
7. Sign-in band: enter test credentials on each side, confirm `useAuth().login()` fires and role-routing post-login still works (applicant → `/`, recruiter → `/company`).
8. Mobile (≤ 760px): hamburger sheet on both landings; sign-in band stacks; CTAs full-width.
9. No console errors, no server errors on either landing.
10. Lighthouse Accessibility ≥ 95 on both landings.

## 10 · Non-goals (explicitly out of scope)

- **Backend changes.** No new RPCs, no proto edits, no `pnpm gen`. The sign-in band uses the existing `Auth.login` flow.
- **Authenticated screens.** The 56-screen authenticated surface (candidate dashboard, profile, company dashboards, settings, etc.) is untouched.
- **Pricing / plans.** No pricing on either landing yet; pre-launch posture says "pilot" not "subscription."
- **A11y / responsive overhaul of other public pages.** The 14 sub-page public surfaces keep their current chrome (minus utility rule).
- **Side-switcher animation or telemetry.** The switcher is a plain link; no per-audience analytics events in this spec.
- **Subdomain split.** Aptura stays one-app at one URL. No `applicants.aptura.app` / `business.aptura.app` split.
- **Forms-API for sign-in.** Sign-in band hits the same `Auth.login` RPC as the dedicated `/login` page. Sign-up CTAs link out to `/register` and `/company/register` (existing pages) — no inline sign-up form.

## 11 · Risks + mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Hiring teams who land on `/` think Aptura is candidate-only | Med | Side-switcher button is prominent (right edge of nav, themed coral); final-CTA cross-link reinforces. SEO: `/hiring-teams` gets its own `<title>` and meta description so it ranks for "Aptura hiring," "Aptura employers." |
| Returning users miss the sign-in band on mobile | Low | Sign-in band is reachable in 3 swipes (it's section 9 of 12 on applicants, 14 of 17 on hiring teams). Final-CTA includes a "Sign in" link as well. |
| Cross-linking creates a confusing "did I land on the wrong page?" feeling | Low | Side-switcher copy is unambiguous ("For hiring teams →" / "For applicants →"). Neutral neither-page chooser was considered and rejected (forced fork hurts SEO). |
| Code duplication between `/` and `/hiring-teams` for shared sections | Low | All shared sections live as reusable components. Each landing is just a composition file. |

## 12 · Implementation phasing (high-level)

The detailed plan goes into `writing-plans` after this spec is approved. High-level phases:

1. **Foundation** — `<MegaNav audience>` + `<MarketingShell>` (drop UtilityRule) + delete `<UtilityRule/>` export
2. **Shared new components** — `<SignInBand>`, `<Faq audience>`, `<MegaFooter audience>`
3. **Applicants landing** — new compositions + 6 new applicant-specific sections
4. **Hiring teams landing** — `/hiring-teams/page.tsx` route + rename existing `<Hero/>` and `<FinalCta/>` to `<HiringTeamsHero/>` and `<HiringTeamsFinalCta/>`
5. **Wire `/` to `<ApplicantsLanding/>`** in `app/page.tsx`
6. **Verify** per §9, commit per phase with explicit paths

## 13 · Sources

- Market research agent report (this session) — surveyed 25+ international job platforms + AI hiring platforms + premium two-sided SaaS for terminology, IA, and sign-in patterns
- `docs/superpowers/plans/v3-screens/_design-language.md` — Aperture Pro tokens, components, motion vocabulary, anti-fiction rule
- Current `apps/candidate/app/(marketing)/marketing-landing.tsx` — existing dual-audience landing being replaced
- `docs/brand/redesign-v3/directions/D-aperture-pro.html` — design language reference
