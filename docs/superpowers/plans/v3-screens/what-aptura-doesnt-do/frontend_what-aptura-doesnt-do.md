# What Aptura Doesn't Do — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Aptura's **constraints-as-features** page — the privacy-inversion thesis at full length. This
inverts the proctoring-vendor norm (Proctorio / Honorlock / Talview): instead of an opaque
"trust us, here's a feature list", it leads with the explicit non-features — every category of
surveillance, screening, or judgement Aptura **refuses** to do. Closes by mapping each refusal to
the architectural mechanism that makes it physically impossible (or contractually prohibited)
inside the product, with a cross-link to the trust-architecture page for the deep dive.

## Route + role

`/what-we-dont-do` (new file: `apps/candidate/app/(marketing)/what-we-dont-do/page.tsx`) ·
**public** (token-free, crawlable, SSR-rendered, indexable). No `.app` shell — uses the marketing
chrome.

## Approved mockup (build to this exactly)

- **Design language source of truth:** [`_design-language.md`](../_design-language.md).
- **Demo reference:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
- **Screenshots to mirror style/density:**
  - Light full: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-light-full.jpeg`
  - Light hero: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-light-hero.jpeg`
  - Dark full: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-dark-full.jpeg`
  - Dark hero: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-dark-hero.jpeg`
- **In-demo region this page scales up:**
  - `#defense` (the **privacy** panel, teal-tinted) — this whole page is that pattern at scale.
    The same `.def-panel.privacy` shape repeats per refusal category. The detect-side gold panel
    is intentionally NOT used here — this page is explicitly about non-features.

There is no per-screen mockup file yet. Match the design language exactly; iterate via side-by-side
screenshot proof committed under `docs/brand/redesign-v3/verify/what-aptura-doesnt-do-{light,dark}.jpeg`.

## Existing code being REPLACED (not modified)

**This is a NEW screen — no existing code to replace.** Gap #37 in the Tier-1 missing-pages audit
([`../_missing-pages-audit.md`](../_missing-pages-audit.md)). Reuse the shared marketing chrome
from the landing plan's Task 1 + Task 2:

- `<UtilityRule />` (shared)
- `<MegaNav />` (shared)
- `<MegaFooter />` (shared)

Page-specific section components live under `apps/candidate/components/marketing/refusals/`.

## Layout & components

The page is **structurally inverted**: instead of feature cards, every section is a refusal panel
with a paired "instead, we…" explanation and a link to the architectural mechanism. Section spine,
in order:

| # | Section | Component (new) | Primitives / tokens |
|---|---|---|---|
| 0 | Top utility rule | `<UtilityRule />` *(shared)* | `.toprule` |
| 1 | Mega-nav | `<MegaNav />` *(shared)* | `.nav` |
| 2 | Hero | `<RefusalsHero />` | Display headline + lead; teal-soft eyebrow word; meta row "A list of things Aptura will never do — and the architecture that makes them impossible." |
| 3 | Why this page exists | `<WhyThisPanel />` | Single wide `.cell.anchor` (teal-soft); explains the privacy-inversion thesis and why the constraint list is a feature, not a disclaimer |
| 4 | Refusal categories overview | `<RefusalsOverview />` | 3-col `.cell` grid of category cards: *Surveillance · Screening · Judgement*; clicking scrolls to that block |
| 5 | A · Surveillance refusals | `<RefusalBlock category="surveillance" />` | A vertical stack of `.def-panel.privacy` items, each with: refusal title (with sprite `x` icon), explanation, and "Instead, Aptura…" footer line linking to the architectural mechanism |
| 6 | B · Screening refusals | `<RefusalBlock category="screening" />` | Same shape; covers ID-verification-as-product, background checks, credit checks, social-graph scraping, "match score against past hires" |
| 7 | C · Judgement refusals | `<RefusalBlock category="judgement" />` | Same shape; covers automated-decision-only, demographic-inference, personality scoring, "AI hires", forced-rank against a quota |
| 8 | Architectural reasons | `<MechanismMatrix />` | A 2-col compact `.compare-table`: *Refusal → Mechanism that enforces it*; rows reference layer numbers in `/trust` |
| 9 | What we DO do | `<DoDoPanel />` | A counterweight panel: 1 line per "thing we actually do" — keeps the page from feeling purely negative; tone shift to teal |
| 10 | Compare to other proctoring | `<RefusalsCompare />` | 4-col `.compare-table`: capability · typical proctoring vendor · Aptura; each row is a refusal category and shows the contrast |
| 11 | FAQ | `<RefusalsFaq />` | Native `<details>/<summary>` with audience pill; 6–8 items ("Why don't you do X?" / "Doesn't that make you worse at detecting Y?") |
| 12 | Final CTA | `<FinalCta variant="refusals" />` | Dual card: "Read the trust architecture →" (teal) / "See a sample report →" (coral) |
| 13 | Mega-footer | `<MegaFooter />` *(shared)* | `.bigfoot` |

### Component-to-primitive map

| Region | Primitive | Notes |
|---|---|---|
| Hero | display headline + `.status` chip | `.status` reads "Refusal posture · pre-launch" |
| Why this | `.cell.anchor` teal-soft | Single anchor cell, body capped 62ch |
| Overview | `.cell` 3-col grid | Each cell carries a `.tag` micro-label top-right |
| Refusal item | `.def-panel.privacy` | The teal-tinted privacy panel from the demo |
| Refusal-item icon | sprite `x` symbol | 1.5–2px stroke, themed via `currentColor` |
| Mechanism matrix | `.compare-table` (2-col variant) | Card-stack under 760px |
| What we DO do | `.cell.anchor` teal-soft | Tone shift; balances the page |
| Vendor compare | `.compare-table` with `.us-col` | "Aptura" column tinted teal |
| FAQ | `<details>` accordion | Audience pill in `<summary>` |
| Final CTA | `.finalcta` dual card | Standard |

## Data wiring / seam

- **No fetch on this page.** Pure static content rendered SSR.
- **Static content lives in `content.ts`** (new:
  `apps/candidate/app/(marketing)/what-we-dont-do/content.ts`):
  ```ts
  HERO:              { eyebrow; h1; lead; status: "Refusal posture · pre-launch" }
  WHY:               { title; html: string }
  CATEGORIES:        { id: "surveillance"|"screening"|"judgement"; title; lede: string }[]   // 3
  REFUSALS:          { category: "surveillance"|"screening"|"judgement";
                       title: string;
                       explanation: string;
                       instead: { html: string; href?: string; layer?: 1|2|3|4|5 } }[]
  MECHANISMS:        { refusal: string; mechanism: string; layerHref: string }[]
  DO_DO:             { html: string }[]                                                       // counterweight bullets
  COMPARE:           { capability: string; vendor: string; aptura: string }[]                 // 6–8 rows
  FAQ_ITEMS:         { aud: "cand"|"comp"; q: string; a: string }[]                           // 6–8 items
  FINAL_CTA:         { left: { title; body; href; label }; right: { title; body; href; label } }
  ```
- **Outbound links:** `/trust` (with layer anchors `#layer-identity` etc.),
  `/ai-explainability`, `/sample-report`.
- **Backend:** none. See [`./backend_what-aptura-doesnt-do.md`](./backend_what-aptura-doesnt-do.md).

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Reference design is the design language.** Match
> [`_design-language.md`](../_design-language.md); the demo's `#defense` privacy panel is the
> single visual primitive this page scales up.

- **Task 1 — Route scaffold + shared chrome + content seed.** Add
  `apps/candidate/app/(marketing)/what-we-dont-do/page.tsx`, render
  `<UtilityRule /> + <MegaNav /> + <main> … </main> + <MegaFooter />`. Wire metadata
  (title, OG, canonical). Create `content.ts` skeleton. Verify reachable + SSR'd. Commit.
- **Task 2 — Hero + Why-this panel.** Build `<RefusalsHero />` and `<WhyThisPanel />`. Both
  themes; headline does not overflow at 360px. Commit.
- **Task 3 — Category overview.** Build `<RefusalsOverview />` (3-col cell grid linking to the
  three category blocks via in-page anchors with `scroll-margin-top`). Commit.
- **Task 4 — Refusal blocks (Surveillance · Screening · Judgement).** Build a single
  `<RefusalBlock />` parameterised by category, rendering the vertical stack of
  `.def-panel.privacy` items. The "Instead, Aptura…" footer line links to the trust-architecture
  layer that enforces the refusal. Verify the panel paddings/radii match the demo's `.def-panel`
  exactly. Commit.
- **Task 5 — Mechanism matrix + What-we-do-do + Vendor compare.** Build `<MechanismMatrix />`
  (2-col compare-table variant), `<DoDoPanel />` (tone-shift counterweight), and
  `<RefusalsCompare />` (4-col `.compare-table` with the tinted Aptura column). Verify the compare
  table converts to card-stack under 760px. Commit.
- **Task 6 — FAQ + final CTA + assembly.** Build `<RefusalsFaq />` and
  `<FinalCta variant="refusals" />`. Assemble. Run `--filter @ip/candidate build` and
  `tsc --noEmit` clean. Commit.
- **Task 7 — Final assembly + Responsive verification + side-by-side fidelity.**
  1. Side-by-side screenshot vs. the design language reference at 1440×900 in both themes;
     iterate any divergence until 1:1.
  2. **Responsive verification (verbatim from [`_design-language.md`](../_design-language.md)):**
     1. **Screenshot at all 7 reference sizes:** 375 × 667 · 430 × 932 · 768 × 1024 portrait ·
        820 × 1180 portrait · 1024 × 1366 portrait · 1366 × 1024 landscape · 1440 × 900 ·
        1920 × 1080.
     2. **No horizontal scroll** at any width ≥ 320 px (test with `document.documentElement.scrollWidth`).
     3. **Every interactive element ≥ 44 × 44 px** when measured at the smallest breakpoint.
     4. **Keyboard does not cover form inputs** on iOS Safari (manual test or
        `visualViewport.height` check).
     5. **Orientation change** (portrait ↔ landscape) on iPad sizes — layout adapts gracefully,
        no clipped content.
     6. **`prefers-reduced-motion`** — every animation no-ops (test by enabling reduce-motion
        in DevTools).
     7. **Cross-browser:** iOS Safari, Chrome Android, Samsung Internet, desktop Safari /
        Chrome / Firefox / Edge — at minimum Safari + Chrome on every OS.
     8. **Save side-by-side proof** to
        `docs/brand/redesign-v3/verify/<slug>-{mobile,tablet,desktop}.jpeg`.
  3. Confirm cross-links (`/trust#layer-*`, `/ai-explainability`, `/sample-report`) resolve.
  4. Confirm the comparison rows do NOT name competitors by brand — use generic "typical
     proctoring vendor" framing.

## States & a11y

- **States.** Static surface — no loading / empty / error. Interactive: in-page anchor scrolls,
  audience switch, mega-menu, `<details>` accordions in FAQ.
- **Responsive.** Inherits the design-language matrix. Refusal stacks remain a single column
  (vertical list throughout). Category overview 3-col → 1-col under 760px. Compare table
  card-stacks under 760px.
- **Dark + light.** All colors via tokens. The teal-soft `.def-panel.privacy` resolves cleanly
  in both themes; no hard-coded hex.
- **A11y.** One `<h1>`. Section heads `<h2>`. Refusal-item titles `<h3>`. Refusal-item sprite `x`
  icons are `aria-hidden`; the title text carries the meaning. `.compare-table` uses real
  `<table>` with `<th scope="row">`. Touch targets ≥44×44 (refusal blocks are large; the
  embedded `Instead, …` link still gets its own ≥44×44 hit area). Contrast ≥4.5:1. Focus rings
  use `--teal` 2px / 4px halo. Honors `prefers-reduced-motion`.

## Acceptance

- Matches [`_design-language.md`](../_design-language.md) 1:1 in tokens, type, spacing, motion,
  rhythm; side-by-side proof committed under
  `docs/brand/redesign-v3/verify/what-aptura-doesnt-do-{light,dark}.jpeg`.
- `--filter @ip/candidate build` green; `tsc --noEmit` green; no console warnings.
- **Anti-fiction enforced:** no named competitor brands in the comparison (only "typical
  proctoring vendor"); no fabricated screenshots; no claimed vendor behaviours not in their public
  docs. Every refusal pairs with a real architectural mechanism in `/trust`.
- Cross-links resolve: `/trust#layer-*`, `/ai-explainability`, `/sample-report`.
- Responsive verification (8-step list above) is complete — proofs committed.
- The "Instead, Aptura…" footer line on every refusal cross-links to the trust-architecture layer
  that enforces it. If the trust-architecture layers shift, this page's links update with them.
