# Accessibility Statement — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Aptura's **public accessibility statement.** Covers, in plain language: (1) our commitment, (2)
the target standard (**WCAG 2.2 AA** — explicit, not "AA-ish"), (3) where the product is
compliant today, (4) the **known gaps** we have not yet fixed, (5) the accommodations available
on the proctored interview specifically (captions, screen-reader path, extended time, alternate
input devices), (6) how to request additional accommodations or report an a11y issue, (7) our
review cadence + version. This is also the page a candidate or recruiter sends our way during
procurement — needs to look like a real policy, not marketing.

## Route + role

`/accessibility` (new file: `apps/candidate/app/(marketing)/accessibility/page.tsx`) ·
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
- **In-demo regions this page reuses:**
  - `#trust` (the truthful badge row) for the compliance / target-standards strip.
  - The `<DefensePanel>` shape for "what works today" / "known gaps".
  - `<details>` accordions for the per-WCAG-criterion checklist.

There is no per-screen mockup file yet. Match the design language exactly; iterate via side-by-side
screenshot proof committed under `docs/brand/redesign-v3/verify/accessibility-statement-{light,dark}.jpeg`.

## Existing code being REPLACED (not modified)

**This is a NEW screen — no existing code to replace.** Gap #42 in the Tier-1 missing-pages audit
([`../_missing-pages-audit.md`](../_missing-pages-audit.md)). Reuse the shared marketing chrome
from the landing plan's Task 1 + Task 2:

- `<UtilityRule />` (shared)
- `<MegaNav />` (shared)
- `<MegaFooter />` (shared)

Page-specific section components live under `apps/candidate/components/marketing/accessibility/`.

## Layout & components

Long-form policy page. Section spine, in order:

| # | Section | Component (new) | Primitives / tokens |
|---|---|---|---|
| 0 | Top utility rule | `<UtilityRule />` *(shared)* | `.toprule` |
| 1 | Mega-nav | `<MegaNav />` *(shared)* | `.nav` |
| 2 | Hero | `<A11yHero />` | Display headline + lead + `.status` chip "Statement of accessibility · pre-launch"; meta row showing `Last reviewed · Version · Target standard` (mono) |
| 3 | Commitment statement | `<CommitmentPanel />` | Single `.cell.anchor` teal-soft; one paragraph: "Aptura is committed to meeting **WCAG 2.2 AA** across every public, candidate, and recruiter surface. We treat accessibility failures as bugs, not feature requests." |
| 4 | Target standard | `<TargetStandard />` | Truthful `.trust-band > .badges` row: *WCAG 2.2 AA — target* · *Section 508 — design-aligned* · *EN 301 549 — design-aligned* · *ARIA 1.2 — implemented*. No claimed audits we haven't done. |
| 5 | What works today | `<WhatWorks />` | `<DefenseSplit>` shape: left teal-soft "What we've implemented" / right teal-soft "Tooling we run" (axe-core in CI, lighthouse in CI, real-keyboard / screen-reader spot-checks). |
| 6 | Known gaps | `<KnownGaps />` | Coral-soft `.def-panel` listing the gaps we have NOT yet fixed (explicit, dated). Each item: WCAG criterion id, plain-language summary, target fix date, workaround. |
| 7 | Interview accommodations | `<InterviewA11y />` | 4-card grid for the proctored-interview-specific accommodations: captions · screen-reader path · extended time · alternate input devices. Each card explains: what's available · how to enable · what the integrity model is during accommodation. Cross-links to the proctored-interview plan. |
| 8 | Per-WCAG checklist | `<WcagChecklist />` | Native `<details>/<summary>` accordion grouped by WCAG principle (Perceivable · Operable · Understandable · Robust); each `<summary>` carries the criterion id + pass/partial/fail pill; body explains current status + fix plan. |
| 9 | How to request accommodations | `<HowToRequest />` | 2-col: in-product (link to `/settings/accessibility` — Tier 2 / placeholder route OK) / out-of-product (a11y@aptura.ai mailto + DPO escalation reference). |
| 10 | Review cadence | `<ReviewCadence />` | Small mono panel: "Reviewed quarterly · Next review YYYY-QQ · Last reviewed: YYYY-MM-DD" — truthful. |
| 11 | Final CTA | `<FinalCta variant="a11y" />` | Dual card: "Request an accommodation →" (teal · mailto) / "Read the AI explainability statement →" (coral · `/ai-explainability`) |
| 12 | Mega-footer | `<MegaFooter />` *(shared)* | `.bigfoot` |

### Component-to-primitive map

| Region | Primitive | Notes |
|---|---|---|
| Hero | display headline + `.status` chip + `.mono` meta row | Standard |
| Commitment | `.cell.anchor` teal-soft | One paragraph, capped 62ch |
| Target standard | `.trust-band > .badges` | Truthful labels only |
| What works | `.def-panel.privacy` (both panels teal-soft) | Implementation + tooling pair |
| Known gaps | `.def-panel` coral-soft | Explicit, dated, with workarounds |
| Interview accommodations | `.cell` 4-up grid | Cross-links to proctored-interview |
| WCAG checklist | `<details>` accordion | Grouped by 4 WCAG principles |
| Request | 2-col `.cell` | in-product / out-of-product |
| Review cadence | small `.cell.mono` | Mono content |
| Final CTA | `.finalcta` | Standard |

## Data wiring / seam

- **No fetch on this page.** Pure static content rendered SSR.
- **Static content lives in `content.ts`** (new:
  `apps/candidate/app/(marketing)/accessibility/content.ts`):
  ```ts
  HERO:               { eyebrow; h1; lead; status: string;
                        lastReviewedIso: string; version: string; target: "WCAG 2.2 AA" }
  COMMITMENT:         { html: string }
  TARGET_BADGES:      { label: string; sub: string;
                        status: "target"|"design-aligned"|"implemented" }[]
  WORKS:              { implemented: string[]; tooling: string[] }
  GAPS:               { wcagId: string; plain: string; targetFixDateIso: string;
                        workaround: string }[]
  INTERVIEW_A11Y:     { kind: "captions"|"screen_reader"|"extended_time"|"alt_input";
                        title: string; available: string; enable: string;
                        integrityNote: string; href: string }[]                            // 4 cards
  WCAG_CHECKLIST:     { principle: "perceivable"|"operable"|"understandable"|"robust";
                        items: { id: string; title: string;
                                 status: "pass"|"partial"|"fail";
                                 note: string }[] }[]                                       // 4 groups
  REQUEST:            { inProduct: { title; body; href };
                        outOfProduct: { title; body; email: string; dpoEmail: string } }
  REVIEW_CADENCE:     { cadence: string; nextReview: string; lastReviewedIso: string }
  FINAL_CTA:          { left:  { title; body; href; label };
                        right: { title; body; href; label } }
  ```
- **Outbound links:** `/proctored-interview` (or its constituent screens),
  `/ai-explainability`, `/trust`, `mailto:a11y@aptura.ai`, DPO mailto, and the in-product
  `/settings/accessibility` (Tier 2 / placeholder OK).
- **Backend:** none. See [`./backend_accessibility-statement.md`](./backend_accessibility-statement.md).

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Reference design is the design language.** This page uses no new primitives —
> only the `.cell`, `.def-panel`, `.trust-band`, and `<details>` patterns. Composition only.

- **Task 1 — Route scaffold + shared chrome + content seed.** Add
  `apps/candidate/app/(marketing)/accessibility/page.tsx`, render
  `<UtilityRule /> + <MegaNav /> + <main> … </main> + <MegaFooter />`. Wire metadata (title, OG,
  canonical, JSON-LD `Article`). Create `content.ts` skeleton. Verify reachable + SSR'd. Commit.
- **Task 2 — Hero + commitment + target standard.** Build `<A11yHero />`, `<CommitmentPanel />`,
  and `<TargetStandard />`. The hero meta row uses `.mono` for `Last reviewed · Version · Target
  standard`. Verify both themes; verify headline does not overflow at 360px. Commit.
- **Task 3 — What works + known gaps.** Build `<WhatWorks />` (two teal-soft `.def-panel`s) and
  `<KnownGaps />` (coral-soft `.def-panel`). The gaps panel is deliberately public — that's what
  makes the page credible. Verify both panels stack on <900px. Commit.
- **Task 4 — Interview accommodations.** Build `<InterviewA11y />` — a 4-card grid for the
  proctored-interview-specific accommodations. Each card cross-links to the relevant
  proctored-interview screen. Verify the grid goes 4-col → 2-col → 1-col per the responsive
  matrix. Commit.
- **Task 5 — Per-WCAG checklist.** Build `<WcagChecklist />` — native `<details>` accordion
  grouped by the 4 WCAG principles, each criterion carrying a `pass/partial/fail` pill
  (`.pill-good/.pill-warn/.pill-danger`). Verify keyboard navigation: arrow-key between
  accordion summaries (standard `<details>` behaviour); Enter expands. Commit.
- **Task 6 — How to request + review cadence + final CTA + assembly.** Build `<HowToRequest />`
  (2-col in-product / out-of-product), `<ReviewCadence />` (compact mono panel), and
  `<FinalCta variant="a11y" />`. Assemble. Run `--filter @ip/candidate build` and
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
  3. Confirm the page itself passes an axe-core scan with 0 critical / serious violations
     (this page is the public face of our a11y posture — it must lead by example).
  4. Confirm cross-links resolve and the `mailto:a11y@aptura.ai` works.

## States & a11y

- **States.** Static surface — no loading / empty / error. Interactive: in-page TOC scroll (if
  added), `<details>` accordions in the WCAG checklist.
- **Responsive.** Inherits the design-language matrix. Two-panel sections stack on <900px;
  4-card interview accommodations grid goes 4 → 2 → 1; checklist accordion stays single-column.
- **Dark + light.** All colors via tokens. Pass/partial/fail pills use `--good / --warn /
  --danger`. No hard-coded hex.
- **A11y.** This page is **the a11y reference for the rest of the product** — it must be the
  most accessible page in the tree. Hard requirements:
  - One `<h1>`. Section heads `<h2>`. WCAG checklist principle groups `<h3>`.
  - Pass/partial/fail pills carry `aria-label="Status: pass"` etc. (the visual pill text is
    short; the aria label is explicit).
  - The WCAG checklist accordion uses semantic `<details>/<summary>`.
  - All mailto buttons use real `<a href="mailto:…">`.
  - Every interactive element has a visible `:focus-visible` ring (`--teal` 2px / 4px halo).
  - Skip-link to `<main>` at top of page (the standard a11y-statement requirement).
  - Touch targets ≥44×44.
  - Contrast: body ≥4.5:1; pills, mono labels, and meta rows all individually pass; placeholder
    text ≥4.5:1.
  - Honors `prefers-reduced-motion`.
  - **The page itself passes axe-core with 0 critical / serious violations.**

## Acceptance

- Matches [`_design-language.md`](../_design-language.md) 1:1 in tokens, type, spacing, motion,
  rhythm; side-by-side proof committed under
  `docs/brand/redesign-v3/verify/accessibility-statement-{light,dark}.jpeg`.
- `--filter @ip/candidate build` green; `tsc --noEmit` green; no console warnings.
- **Anti-fiction enforced:** no fake "audited by N" line; no claimed WCAG conformance certificate
  we don't have; the `WCAG_CHECKLIST` honestly reports `pass/partial/fail` per criterion (no
  greenwashing). The `KNOWN_GAPS` section is non-empty pre-launch — declaring zero gaps would
  itself be a falsity.
- The page passes axe-core with 0 critical / serious violations.
- The `Last reviewed` date is real (today's date at first commit).
- Cross-links resolve: `/ai-explainability`, `/trust`, `mailto:a11y@aptura.ai`, DPO mailto.
- Responsive verification (8-step list above) is complete — proofs committed.
- Spec-drift check: the interview-accommodations section agrees with the proctored-interview
  plan's accommodation features. If those features change, update both.
