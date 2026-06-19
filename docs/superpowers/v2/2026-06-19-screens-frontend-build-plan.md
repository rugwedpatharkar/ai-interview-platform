# Aptura — Screens Frontend Build Plan

> A **screen-by-screen guide a fresh session can follow** to build Aptura's demo-grade UI.
> **Visual contract:** the rendered mockups + `docs/brand/aptura-ui-ux.md` (standard),
> `aptura-design-system.md` (color/tokens), `aptura-visual-identity.md` (logo/type).
> **Most screens already have backend + component detail** in the v2 pillar FE tiers
> (`docs/superpowers/v2/*`); **this doc is the screen layer** that maps each screen → route →
> components → source plan → states, and adds the few screens not owned by a pillar (landing, the
> sign-in restyle, the profile enhance). **Reuse `@ip/ui`. No new design decisions — implement to the
> mockups.** Local-only; no git/gh. Designs/plans phase — this plan is executed when the build is green-lit.

## How to use this plan
1. Build in the **v2 increment order** (`Inc 0 → 1 → …`, see the v2 overview §8). Each pillar plan
   carries the backend + a **Frontend tier**; this doc is the visual/screen layer over them.
2. For each screen, deliver: the **route**, **components** (new + `@ip/ui` reused), **data/client +
   TanStack Query keys**, the **source pillar plan**, the **required states** (loading/empty/error/
   success), **responsive + dark**, and **acceptance** (pixel-matches the mockup + a11y + gate green).
3. **Verify:** `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/company build` +
   `--filter @ip/{ui,shared,api-client} typecheck`. Never `next build` while `pnpm dev` is live.

## Global setup (do once, before screens)
- [ ] **Tokens** — `@ip/ui` `globals.css` already has violet/zinc + status tokens. ADD: the **amber
  brand accent** usage guidance + a **`--gradient-brand`** utility (`linear-gradient(135deg,#7c3aed,#4f46e5)`)
  used **only** in hero/marketing surfaces (landing, sign-in panel, AI-recommendation strip). Document
  "**no gradient in product UI**" — product surfaces stay flat.
- [ ] **Logo** — `@ip/ui` `Logo`/`LogoMark` = the **aperture SVG** (from `aptura-visual-identity.md`)
  + the Sora wordmark. Use the mark-only as favicon/avatar.
- [ ] **Shells** — `CandidateShell` + `CompanyShell` exist; align nav to the mockups (candidate:
  Jobs · Saved · Applications · avatar; company: Jobs · Talent · Analytics · avatar) and **mount the
  `NotificationBell`** (notifications plan) in both headers.
- [ ] **Fonts** — Sora (display/wordmark/headings/**numerals**) + Inter (body), via `next/font` (wired).
- [ ] **State kit** — every screen ships `Skeleton` (loading), `EmptyState`, `ErrorState`+retry,
  `toast` (success); a11y labels + `aria-live` on async. (All in `@ip/ui`.)
- [ ] **Icon hygiene** — Tabler/lucide **outline only** (no `-filled`); fix any leftover filled icons.

## The screen index (build map)
| # | Screen | App · route | Source v2 plan (FE) | New components | Reuses (`@ip/ui`) |
|---|--------|-------------|---------------------|----------------|-------------------|
| 1 | **Landing / marketing** | candidate · `/` (public) | **NEW — §A here** | `HeroSection`, `HowItWorks`, `StatBand`, `DiffStrip`, `MarketingNav` | Button, Logo, Icon |
| 2 | **Sign in / auth** | both · `/login` (exists) | **restyle — §B** | `AuthSplitPanel` | Field, Input, Button, `SsoButtons`, Logo |
| 3 | Job marketplace | candidate · `/jobs` | `job-marketplace.md` (TIER 3) | `JobSearchBar`, `FilterSidebar`, `JobCard`, `Pagination` | Card, Badge, Select, Input |
| 4 | Job detail + apply | candidate · `/jobs/[id]` | `job-marketplace.md` | SSR detail, `ApplyIsland`, `JobHeader` | Card, Button, Badge |
| 5 | Candidate profile | candidate · `/profile` (exists) | **enhance — §C** | `ParsedBanner`, `ExperienceRow`, `SkillChips`, completeness | Field, Card, Avatar |
| 6 | **Proctored video + voice interview room** | candidate · `/interview/[id]` (exists) | `2026-06-20-proctored-integrity.md` (voice pipeline + proctoring) | `InterviewRoom` (camera self-view + AI aperture presence), `LiveCaptions` (real-time STT), `ProctorStatusStrip` (one face · eyes on screen · fullscreen + flag banner), `InterviewControls` (captions · end — **no mute / no camera-off**), `ProctorNotice` (proctored & recorded; auto-terminate on serious cheating) | chat patterns |
| 7 | Dashboard / tracker | candidate · `/` (authed) | candidate app (exists) + `recommend` | `ApplicationCard` (funnel progress), `RecommendedRoles` | Card, Badge, Progress |
| 8 | Skill-gap feedback | candidate · `/feedback/[id]` | `candidate-growth.md` (TIER F) | `GrowthFeedbackPanel` | Card, Badge, Progress |
| 9 | Messaging | both · `/messages` + applicant tab | `messaging.md` (TIER D) | `MessageThreadView`, `Composer`, context chip | chat-window pattern |
| 10 | Notifications | both · bell + `/notifications` | `notifications-center.md` (TIER F) | `NotificationBell`, `NotificationItem` | DropdownMenu, Badge |
| 11 | Recruiter dashboard | company · `/` → `/jobs` | company app (exists) + analytics | `KpiCard`, `JobRow` | Card |
| 12 | Post a job | company · `/jobs/new` (exists) | `job-marketplace.md` (extended form) + `compliance-advisory-gate.md` | `JobForm` (new fields), `AiSuggestPanel`, `GateModeToggle` | Field, Select, Button |
| 13 | Ranked applicants | company · `/jobs/[id]` (Ranked tab) | `job-marketplace.md` (RecommendedFeed) / recommendation | `RankedCandidateCard`, `MatchScore` | Tabs, Table, Badge |
| 14 | AI candidate report | company · `/jobs/[id]/applicants/[appId]` (exists) | report + `2026-06-20-proctored-integrity.md` (Tier C/D) | `ScoreRing`, `CompetencyCard` (evidence quote), `IntegrityBand` (proctoring timeline + integrity score + recording playback + auto-terminated state), `DecisionControl` | Card, Button |
| 15 | Analytics & fairness | company · `/analytics` (exists) | analytics + score-distribution | `FunnelChart`, `ScoreDistribution`, `KpiCard` | Card |
| 16 | Talent pool | company · `/talent` (exists) | `job-marketplace.md` (`SearchCandidates`) / talent | `CandidateSearchRow`, `FitBadge` | Card, Badge |

> Reusable cross-screen components to build first (in `@ip/ui`): **`ScoreRing`** (circular donut for
> the headline match score), **`MatchScore`** (violet Sora number), **`StatusPill`** (the canonical
> status→tone map), **`KpiCard`** (metric card), **`Avatar`** (initials), **`AppNav`** (top bar with
> Logo + nav + bell + avatar). Every screen composes from these.

> **Interview modality (decided 2026-06-20):** Aptura has **exactly one** interview — a **single live, real-time, strictly-proctored video + voice session** (screen 6 above). Camera + mic **required**, **no mute / no camera-off**, fullscreen-locked; real-time STT feeds the transcript into the existing evaluator/brain (funnel/scoring unchanged). The legacy **typed text interview**, the **async recorded-video** interview, and a standalone **voice-only room** are all **removed in v2**. Integrity = **strict proctoring**: all 40 signals live (face/gaze/movement/second-face/phone/second-voice/device); HIGH-severity cheating **auto-terminates**; the full integrity timeline + score is **surfaced to recruiters**. See [proctored-integrity](2026-06-20-proctored-integrity.md).

## §A — Landing / marketing (NEW)
> **Full spec + competitor analysis + section-by-section breakdown: [landing-page-design.md](2026-06-20-landing-page-design.md)** (pairs with the `aptura_landing_page` mockup — 11 sections, role-forked search hero, differentiator-led). The tasks below are the build summary.
- [ ] `apps/candidate/app/(marketing)/page.tsx` (public, SSR). Sections: `MarketingNav` → `HeroSection`
  (the `--gradient-brand` band, headline "Get seen. Get interviewed. Get hired.", a `JobSearchBar`
  that routes to `/jobs`, stat line) → `StatBand` (100% answered · ~2-day response · cheat-proof) →
  `HowItWorks` (3 steps, gradient icon circles) → `DiffStrip` (No ghosting · Cheat-proof · Judged
  on merit) → footer. Anonymous; the search submits to the marketplace.
- [ ] Acceptance: matches the enhanced landing mockup; crawlable (SSR); responsive (hero stacks on mobile).

## §B — Sign in / auth (restyle existing)
- [ ] Restyle `apps/{candidate,company}/app/login/page.tsx` to the **split layout**: left = form
  (Logo, Email/Password `Field`s, "Forgot?", `Button` Sign in, `SsoButtons` Google) ; right =
  `AuthSplitPanel` (the `--gradient-brand` panel with white aperture + tagline + "No ghosting.
  Proctored & fair. Judged on merit."). Reuse the existing auth logic; this is presentational. On mobile the
  right panel collapses above the form. Apply the same to register/verify/forgot/reset.

## §C — Candidate profile (enhance existing)
- [ ] Enhance `apps/candidate/app/profile/page.tsx`: add the `ParsedBanner` ("we parsed your résumé"
  + filename + re-upload), a completeness pill, `ExperienceRow`s with edit affordances, `SkillChips`,
  education. Keep the existing résumé-upload + parse + edit logic; this restyles to the mockup.

## Build order (follows the v2 increments)
1. **Global setup** (tokens, Logo, shells, state kit, the cross-screen components).
2. **Inc 1 — Marketplace block:** landing (§A) · marketplace · job detail · talent pool. *(Most visible; no AI risk.)*
3. **Auth restyle (§B) + profile enhance (§C)** — quick presentational wins.
4. **Inc 0 surface:** post-a-job `GateModeToggle` + the `assessment_review` queue cells.
5. **Inc 2:** the candidate coding-test UI (rich-assessments TIER F).
6. **AI report (Inc-integrity):** `ScoreRing` + evidence `CompetencyCard`s + `IntegrityBand`.
7. **Inc 4:** messaging thread + notifications bell/feed.
8. **Inc 5:** skill-gap feedback + practice.
9. **Inc 3:** the live video + voice interview room (camera + mic + real-time captions).
10. **Analytics & dashboards** polish (KPIs incl. response-time, funnel, score-distribution).

## "Perfect all screens" — finalization checklist (apply to every screen)
- [ ] Real content, no lorem; one focal point; brand applied (Logo, violet, amber once, Sora numerals).
- [ ] `ScoreRing` for headline scores; thin violet bars for secondary.
- [ ] All four states designed; toasts on success; `aria-live` on async.
- [ ] Light + **dark** both correct (test with `prefers-color-scheme`); **responsive** (mobile reflow + bottom tab bar on candidate app).
- [ ] Outline icons only; consistent spacing scale (12 / 16 / 18px); 0.5px borders; `radius-lg` cards.
- [ ] Gradient only on hero/marketing; product UI flat.

## Acceptance (per screen, before "done")
Pixel-matches the mockup at the demo-grade bar · all states present · light+dark+mobile · a11y
(labels, contrast, keyboard) · `pnpm build` + `typecheck` green · reuses `@ip/ui` (no one-off styles
that bypass tokens).
