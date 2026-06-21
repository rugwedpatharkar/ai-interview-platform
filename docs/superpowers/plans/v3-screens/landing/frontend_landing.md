# Landing — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Public, crawlable, SSR marketing front door for Aptura. Replace the existing v2/Midnight landing tree
with a feature-rich, information-dense single-page surface that mirrors the approved
**D-aperture-pro.html** demo 1:1 in layout, typography, motion, and copy. Pre-launch posture
throughout — no fake customers, no fake outcomes, no unearned certifications.

## Route + role

`/` (signed-out branch of `apps/candidate/app/page.tsx`) · **public** (token-free, crawlable, SSR).

## Approved mockup (build to this exactly)

- **Interactive demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
- **Light-theme full page:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-light-full.jpeg`
- **Light-theme hero:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-light-hero.jpeg`
- **Dark-theme full page:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-dark-full.jpeg`
- **Dark-theme hero:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-dark-hero.jpeg`

The implemented page MUST look like the demo. Side-by-side screenshot proof is part of the
acceptance criteria — see "Acceptance" below.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope (assume these files will be re-written from scratch by the new plan):

- `frontend/apps/candidate/app/page.tsx` — signed-out branch
- `frontend/apps/candidate/app/(marketing)/marketing-landing.tsx` — section spine
- `frontend/apps/candidate/app/(marketing)/content.ts` — static copy (rewritten to the new pre-launch
  voice; the existing copy-guard test must be re-baselined to match)
- `frontend/apps/candidate/components/marketing/*.tsx` — every section component (replaced; do not
  port markup)

The signed-in branch routing (candidate dashboard / `useRequireAuth()` redirect logic) is **untouched**.

## Section spine — 16 sections, in order

Build each as its own component. Section names mirror the demo's anchors.

| # | Section | Component | Notes |
|---|---|---|---|
| 0 | Top utility rule | `<UtilityRule />` | Pre-launch announcement band; coral pill + meta + right-aligned `Request a pilot →` link. |
| 1 | Mega-nav | `<MegaNav />` | Sticky blurred bar. Brand + 6 nav links (one mega-menu trigger = `Platform`), audience switch (`For Companies` / `For Candidates`), `Sign in`, primary CTA `Book a demo`. |
| 2 | Hero | `<Hero />` | Split: confident display headline + dual CTA + truthful trust strip · live `<InterviewHud />` on the right. |
| 3 | Stats band | `<StatsBand />` | 4 truthful product-architecture stats (`1 interview · 40+ signals · 0 raw frames · 100% answered`). Section-head label: *"By design"*. **NO fake company logos.** |
| 4 | Resume → Report flip | `<EvidenceFlip />` | Two-column "What you see vs. What matters": sample unverifiable résumé → sample Aptura report card with score ring + competency bars + integrity row. |
| 5 | 5-act walkthrough | `<HowItHappens />` | Linear-style 1.0–5.0 acts with mini-visuals per act (identity, room, timeline, rubric, decision). Numbered scaffold is justified — it IS a sequence. |
| 6 | Platform bento | `<PlatformBento />` | Anchor cell with platform diagram + 6 supporting cells (Marketplace, Recommendations, Workflow, Practice, No-ghosting, Global a11y). |
| 7 | Integrity timeline | `<IntegrityTimeline />` | Sample interactive scrubber with severity pips + 3 event cards (one expanded with clip + reason). |
| 8 | Anti-cheat + privacy | `<DefenseSplit />` | Two panels: "What Aptura blocks" (gold-tinted) vs "What Aptura does NOT do" (teal-tinted). |
| 9 | Sample evidence report | `<EvidenceReport />` | Left: competency cards with quoted transcript evidence; right: narrative + "Download a sample report (PDF)". |
| 10 | Advisory gate | `<AdvisoryGate />` | "AI recommends. Humans decide." dual panel. |
| 11 | vs. the old way | `<CompareTable />` | 4-column comparison: capability · résumé · take-home · **Aptura** (tinted). |
| 12 | What you get | `<WhatYouGet />` | 4 cards for the 4 artifacts the product produces (Identity / Timeline / Report / Decision audit). **NO fake customer logos or outcomes.** |
| 13 | Trust & compliance | `<TrustBand />` | 4-col narrative (Data minimization / Server-authoritative / Advisory by design) + truthful "design-aligned / on the roadmap" badge row. |
| 14 | Designed for | `<DesignedFor />` | Verticals icon grid (Tech / Financial / Healthcare / Retail / Education / Public / BPO / Consulting). ATS integrations called out as **roadmap**. |
| 15 | Early access | `<EarlyAccess />` | Two-column "Pilot a verified interview" / "Join the waitlist". **No prices.** |
| 16 | FAQ | `<Faq />` | 16 alternating candidate/company `<details>` items. Audience pill in each summary. |
| 17 | Final dual CTA | `<FinalCta />` | Two-column gradient card: companies (teal primary) / candidates (coral primary). |
| 18 | Mega-footer | `<MegaFooter />` | 6-column sitemap; brand col carries the truthful badges; legal row + direction marker. |

## Layout & components — map to `@ip/ui` and tokens

Pull all primitives from `@ip/ui` per [`_design-language.md`](../_design-language.md). New components
that only the landing uses live under `apps/candidate/components/marketing/`:

| Region | Component (new) | Tokens / primitives |
|---|---|---|
| Sticky nav blur | `MegaNav` | `backdrop-filter: blur(14px)`, `bg: color-mix(in oklch, var(--bg) 82%, transparent)`, `border-b: var(--line)` |
| Mega-panel | `MegaPanel` | absolute panel; 3-col grid; icon chip uses `--teal-soft` + `--teal` |
| Hero HUD | `InterviewHud` | `.hud + .hud-stage + .hud-strip + .hud-toast` from the design language |
| Stats | `StatsBand` | `.stats-grid + .stat`; mono unit suffix; `--teal` accent |
| Flip cards | `EvidenceFlip` | `.flip + .panel.before/.panel.after + .arrow`; sample résumé uses the `.resume` mono block |
| Acts | `HowItHappens` | `.acts > .act > .act-num/.act-visual`; `.mini-*` visuals per act |
| Bento | `PlatformBento` | `.bento > .cell` (anchor + c1..c6); platform diagram in anchor |
| Timeline | `IntegrityTimeline` | `.itl + .itl-track + .itl-pip.l/.m/.h + .itl-scrubber + .itl-events > .event` |
| Defense | `DefenseSplit` | `.defense + .def-panel.detect / .def-panel.privacy`; lucide-style x/check icons |
| Report | `EvidenceReport` | `.evidence-card + .competency + .why` (left-border quote token) |
| Advisory | `AdvisoryGate` | `.advisory + .adv.ai / .adv.human` |
| Compare | `CompareTable` | `.compare-table` with `.us-col` tinted Aptura column |
| Get | `WhatYouGet` | `.wins > .win`; large icons instead of fake metrics |
| Trust | `TrustBand` | `.trust-band + .trust-grid + .badges` |
| Verticals | `DesignedFor` | `.verticals > .vert` |
| Access | `EarlyAccess` | `.wins` 2-column variant |
| FAQ | `Faq` | native `<details>/<summary>` with audience pill |
| Final | `FinalCta` | `.finalcta + .cta-side.companies / .cta-side.candidates` |
| Footer | `MegaFooter` | `.bigfoot + .foot-cols (1.4fr repeat(5,1fr)) + .foot-bottom` |

All component classes are added to `@ip/ui/src/app.css` (one file, shared across screens) and consume
the tokens in `@ip/ui/src/tokens.css`. The sprite — aperture mark + lucide-style icons — lives at
`@ip/ui/src/sprite.tsx` and is mounted once in the root layout.

## Data wiring / seam

- **No fetch on this page.** Pure static + one navigation handler.
- **Hero CTAs** (`Book a demo` / `Request a pilot`) → mailto / external link constants. Final-CTA
  candidate button (`Find roles`) → `router.push("/jobs")`.
- **Static content lives in `content.ts`** (rewritten to the truthful voice):
  - `HERO`, `STATS`, `FLIP_RESUME`, `FLIP_REPORT_SAMPLE`, `ACTS[5]`, `BENTO_CELLS[]`,
    `TIMELINE_EVENTS[]`, `DEFENSE_BLOCKS`, `DEFENSE_PRIVACY`, `EVIDENCE_SAMPLE`,
    `ADVISORY`, `COMPARE_ROWS[]`, `WHAT_YOU_GET[]`, `TRUST`, `VERTICALS[]`,
    `EARLY_ACCESS`, `FAQ_ITEMS[]`, `FOOTER_COLS`.
- Backend: none — see `backend_landing.md`.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Mockup is approved already.** The demo at
> [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html) IS the mockup.
> Do NOT modify the demo file — it's the reference.

- **Task 1 — Design system primitives into `@ip/ui`.** Move tokens (`tokens.css`), component classes
  (`app.css`), the SVG sprite, and the Schibsted Grotesk + Hanken Grotesk + Geist Mono `next/font`
  wiring into `@ip/ui`. The root layout imports them. Verify the unified app boots; no visual
  regression on screens that still consume the OLD design (they get re-built in their own plans).
  Commit `frontend/packages/ui/src/{tokens.css,app.css,sprite.tsx,fonts.ts}`,
  `frontend/apps/candidate/app/layout.tsx`.
- **Task 2 — Top utility rule + `MegaNav`.** Build with the audience switch + mega-menu trigger.
  Verify mega-panel opens/closes, audience switch toggles `aria-pressed`, sticky behavior on scroll,
  keyboard tab order. Commit the two components.
- **Task 3 — Hero + `InterviewHud`.** Display headline (Schibsted 800, `--display`), trust strip,
  dual CTAs. Build the live HUD: topbar + 16:9 stage + integrity strip + floating "Evidence
  captured" toast. Verify HUD renders identically in dark + light, the pulsing status dot respects
  `prefers-reduced-motion`, the headline does not overflow at 360px width. Commit.
- **Task 4 — Stats band + Flip + Acts (3 sections).** Build `StatsBand` (4 truthful stats),
  `EvidenceFlip` (résumé → report sample), `HowItHappens` (5-act walkthrough with mini-visuals).
  Verify each on mobile (stacks correctly). Commit.
- **Task 5 — Platform bento + Integrity timeline (2 sections).** Build `PlatformBento` (anchor + 6
  cells; the platform diagram inside the anchor) and `IntegrityTimeline` (track + pips + scrubber +
  3 event cards). Verify the bento collapses to 4-column then 2-column at the breakpoints; verify
  the timeline event-card row stacks on mobile. Commit.
- **Task 6 — Defense + Evidence report + Advisory (3 sections).** Build `DefenseSplit` (blocked /
  not-done columns), `EvidenceReport` (competency cards with quoted transcript), `AdvisoryGate`
  (AI recommends / Human decides). Verify quoted-evidence left-border + curly-quote markers render
  cleanly in both themes. Commit.
- **Task 7 — Compare + What-you-get + Trust + Designed-for (4 sections).** Build `CompareTable`
  (4-col with tinted Aptura column), `WhatYouGet` (4 artifact cards — NOT fake metrics),
  `TrustBand` (4-col narrative + truthful badge row), `DesignedFor` (verticals icon grid).
  Commit.
- **Task 8 — Early access + FAQ + Final CTA + Mega-footer (4 sections).** Build `EarlyAccess`
  (pilot / waitlist — NO prices), `Faq` (16 items, audience pill), `FinalCta` (dual-audience), and
  `MegaFooter` (6-col sitemap). Commit.
- **Task 9 — Full page assembly + verify.**
  1. `apps/candidate/app/page.tsx` → renders `<Landing />` for the signed-out branch.
  2. `--filter @ip/candidate build` is green; `--filter @ip/candidate exec tsc --noEmit` is green.
  3. Run the dev server, navigate to `/` signed-out, screenshot in both themes at 1440×900 and 390×844.
  4. **Side-by-side fidelity check** against
     `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-full.jpeg` — iterate
     any divergence until 1:1.
  5. Confirm `/jobs` route still receives an empty-query push from the candidate final-CTA.
  6. Confirm a signed-in candidate still bypasses the landing and lands on the dashboard.

## States & a11y

- **States.** Static surface — no loading / empty / error data states. Interactive:
  audience switch, mega-menu hover/focus, `<details>` FAQ accordions, CTA navigations.
- **Responsive.** Hero stacks under 760px (HUD goes on top); 4-column stats → 2-column → 1-column;
  bento 6 → 4 → 2 columns; verticals 8 → 4 → 3; FAQ 2-col → 1-col; mega-footer 6 → 3 → 2 cols.
- **Dark + light.** All colors via tokens. The hero gradient backdrop is built from `--teal-glow`
  and resolves cleanly in both themes. No hard-coded hex except the dark stage gradient that frames
  the HUD video.
- **A11y.** One `<h1>`. `<header><nav><main><section><article><footer>` landmarks. Aperture mark in
  the brand is `aria-hidden`; brand text is the readable label. Audience switch is `role="group"`
  with `aria-label="Audience"` and `aria-pressed` per button. Mega-panel is `role="menu"` with
  visible focus ring. `<details>` semantics for FAQ. Touch targets ≥44×44. Contrast ≥4.5:1
  everywhere — body uses `--ink-2` on `--bg`. `:focus-visible` rings use `--teal` 2px / 4px halo.
  Honors `prefers-reduced-motion`.

## Acceptance

- Looks 1:1 like
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html) — section order,
  spacing, type, motion, content blocks all match. Side-by-side screenshot proof committed under
  `docs/brand/redesign-v3/verify/landing-{light,dark}.jpeg`.
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors / warnings on
  the rendered page; reduced-motion is honored.
- Pre-launch posture is enforced: no fake company names, no unearned certifications, no
  fabricated stats, no claimed integrations. All sample data is labelled "Sample" / "Example".
- Signed-in candidates still route to the dashboard; the existing role-routing logic is untouched.
- The hero search wiring still navigates to `/jobs` (if retained as a CTA) — the marketplace screen
  owns the live fetch.
