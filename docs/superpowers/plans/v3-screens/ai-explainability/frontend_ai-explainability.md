# AI Explainability — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

The Aptura **AI Explainability Statement** as a long-form public page. Covers, in plain language and
in this exact order: (1) what an AI recommendation is and isn't on this platform, (2) every input
the model sees and never sees, (3) the rubric / scoring procedure, (4) how the model's
recommendation maps to a `recommend | borderline | not_recommend` outcome, (5) the advisory gate
(a human signs every outcome), (6) bias-audit posture (named methodology, audit cadence, what we
publish), (7) data subject rights (access, correction, appeal, delete), (8) escalation paths.
Counts as our compliance-readable surface for **NYC Local Law 144** and **EU AI Act Annex III**
artefacts pre-launch; live audit reports will be linked when they exist.

## Route + role

`/ai-explainability` (new file: `apps/candidate/app/(marketing)/ai-explainability/page.tsx`) ·
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
- **In-demo regions to reuse the language of:**
  - `#advisory` (AI recommends · Human decides) — the same `.advisory > .adv.ai/.adv.human` shape
    reappears below as the "advisory gate" interactive worked example.
  - `#evidence` (the sample evidence report card) — a smaller schematic of `.evidence-card +
    .competency + .why` is the worked example for "how a competency score is shown to the human reviewer".
  - `#faq` (audience-pill `<details>`) — the closing FAQ block uses the same primitive.

There is no per-screen mockup file yet. Match the design language exactly; iterate via side-by-side
screenshot proof committed under `docs/brand/redesign-v3/verify/ai-explainability-{light,dark}.jpeg`.

## Existing code being REPLACED (not modified)

**This is a NEW screen — no existing code to replace.** Gap #36 in the Tier-1 missing-pages audit
([`../_missing-pages-audit.md`](../_missing-pages-audit.md)). Reuse the shared marketing chrome
from the landing plan's Task 1 + Task 2:

- `<UtilityRule />` (shared)
- `<MegaNav />` (shared)
- `<MegaFooter />` (shared)

Page-specific section components live under `apps/candidate/components/marketing/explainability/`.

## Layout & components

Long-form policy + interactive examples. Section spine, in order:

| # | Section | Component (new) | Primitives / tokens |
|---|---|---|---|
| 0 | Top utility rule | `<UtilityRule />` *(shared)* | `.toprule` |
| 1 | Mega-nav | `<MegaNav />` *(shared)* | `.nav` |
| 2 | Hero | `<ExplainabilityHero />` | Display headline + lead + `.status` chip ("Pre-launch · statement of design"); meta row showing `Last updated · Version` (mono micro labels) |
| 3 | Plain-language summary | `<TldrPanel />` | Single wide `.cell.anchor` (teal-soft gradient) with 5 one-line bullets — the explainability TL;DR for skim-readers |
| 4 | Section 1 · What the AI is | `<ExplainSection id="what-it-is" />` | 2-col `.section-head.two-col` + prose; uses `<em>` for semantic emphasis |
| 5 | Section 2 · Inputs (and non-inputs) | `<InputsPanel />` | `<DefenseSplit>` shape: "What the model sees" (gold-soft) / "What it never sees" (teal-soft); each is a bulleted, mono-keyed list |
| 6 | Section 3 · Rubric & scoring | `<RubricPanel />` | Reuses `.evidence-card + .competency + .why` schematic at half-scale; one labelled "Example competency" with the worked example: utterance → rubric anchor → score |
| 7 | Section 4 · Recommendation logic | `<RecommendLogic />` | A small decision-tree visual built from sprite arrows + 3 outcome chips (`pill-good` recommend / `pill-warn` borderline / `pill-danger` not-recommend); explanatory copy beside |
| 8 | Section 5 · Advisory gate | `<AdvisoryGate variant="explainability" />` | Same primitive as the landing — `.advisory > .adv.ai / .adv.human`; copy adapted to "what the reviewer sees and can override" |
| 9 | Section 6 · Bias audit | `<BiasAuditPanel />` | 3-col grid of `.cell`s: *Methodology · Cadence · What we publish*; truthful "scheduled pre-launch" badge — no audited claims unless they exist |
| 10 | Section 7 · Data subject rights | `<DsRights />` | 4-col `.cell` grid: Access · Correction · Appeal · Delete; each links to the relevant settings or contact path |
| 11 | Section 8 · Escalation paths | `<EscalationPanel />` | 2-col: in-product (link to `/applications/[id]/outcome` re-score CTA explanation) / out-of-product (DPO email + DPA reference) |
| 12 | Compliance posture | `<CompliancePosture />` | Truthful `.trust-band > .badges` row: "NYC Local Law 144 — bias audit scheduled pre-launch" · "EU AI Act Annex III — design-aligned" · "GDPR Art. 22 — human-in-the-loop enforced" |
| 13 | FAQ | `<ExplainabilityFaq />` | Native `<details>/<summary>` with audience pill; 8–10 items covering common explainability questions (override / reasons / model-version / data-retention / opt-out / etc.) |
| 14 | Final CTA | `<FinalCta variant="explainability" />` | Dual card: "Read trust architecture →" (teal) / "Contact our DPO →" (coral) |
| 15 | Mega-footer | `<MegaFooter />` *(shared)* | `.bigfoot` |

### Component-to-primitive map

| Region | Primitive | Notes |
|---|---|---|
| Hero | display headline + `.status` chip + `.mono` meta row | Headline uses `--display` clamp |
| TL;DR | `.cell.anchor` (teal-soft gradient) | Bullets, no `border-left` accents (anti-slop ban) |
| Section heads | `.section-head` single-column or `.section-head.two-col` | Single short eyebrow per section |
| Inputs / non-inputs | `.def-panel.detect` / `.def-panel.privacy` | Mono keys + body copy |
| Rubric worked example | `.evidence-card + .competency + .why` | Schematic, labelled "Example" |
| Recommendation logic | sprite arrows + `.pill-good / .pill-warn / .pill-danger` | Decision-tree, no glassmorphism |
| Advisory gate | `.advisory > .adv.ai / .adv.human` | Same as landing |
| Bias audit | `.cell` 3-col | No fake percentages |
| Compliance badges | `.trust-band > .badges` | Truthful labels only |
| FAQ | `<details>` accordion | Audience pill in `<summary>` |
| Final CTA | `.finalcta` dual card | Standard primitive |

## Data wiring / seam

- **No fetch on this page.** Pure static content rendered SSR.
- **Content source.** A single source-of-truth markdown that the FE imports and serialises into the
  typed shapes below. New file:
  `apps/candidate/app/(marketing)/ai-explainability/content.ts` exports the typed objects; the
  longer prose lives in adjacent `.mdx` files under
  `apps/candidate/app/(marketing)/ai-explainability/sections/` and is mounted into the relevant
  components via MDX. This keeps copy reviewable by non-FE collaborators without forking the page.
- **Typed shapes:**
  ```ts
  HERO:              { eyebrow; h1; lead; status; lastUpdatedIso: string; version: string }
  TLDR:              { bullets: string[] }                                                // 5 items
  SECTIONS:          { id: "what-it-is"|"rubric"|"recommend"|"advisory"|"bias"|"rights"|"escalation";
                       title: string; body: MDXContent }[]
  INPUTS:            { sees: string[]; neverSees: string[] }
  RUBRIC_EXAMPLE:    { competency: string; score: number; utterance: string; anchor: string; rationale: string }
  RECOMMEND_LOGIC:   { rules: { if: string; then: "recommend"|"borderline"|"not_recommend" }[] }
  BIAS:              { methodology; cadence; publishes: string[]; status: "scheduled"|"design-aligned" }
  RIGHTS:            { kind: "access"|"correction"|"appeal"|"delete"; title; body; href }[]
  ESCALATION:        { inProduct: { title; body; href }; outOfProduct: { title; body; email; dpaHref } }
  COMPLIANCE:        { label; sub; status: "scheduled"|"design-aligned"|"target" }[]
  FAQ_ITEMS:         { aud: "cand"|"comp"; q: string; a: string }[]                         // 8–10 items
  FINAL_CTA:         { left: { title; body; href; label }; right: { title; body; href; label } }
  ```
- **Outbound links:** `/trust`, `/what-we-dont-do`, `/sample-report`, `/dpa` (Tier 2), DPO mailto.
- **Backend:** none. See [`./backend_ai-explainability.md`](./backend_ai-explainability.md).

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Reference design is the design language.** Match
> [`_design-language.md`](../_design-language.md); the demo is the worked example for tone, density, motion.

- **Task 1 — Route scaffold + content seed.** Add
  `apps/candidate/app/(marketing)/ai-explainability/page.tsx`, the `content.ts` skeleton, and the
  `sections/*.mdx` files (empty stubs). Wire metadata (title, OG, canonical, JSON-LD `Article`),
  `next-mdx-remote` or `@next/mdx` if not yet enabled (use the project's existing MDX setup if
  any; otherwise raw TSX with the prose inline). Verify route is reachable and rendered SSR.
- **Task 2 — Hero + TL;DR panel.** Build `<ExplainabilityHero />` and `<TldrPanel />`. Hero meta
  row uses `.mono` for `Last updated · Version`. Verify both themes; verify headline does not
  overflow at 360px. Commit.
- **Task 3 — Sections 1–3 (what-it-is · inputs · rubric).** Build `<ExplainSection id="what-it-is" />`,
  `<InputsPanel />` (the detect/privacy split), and `<RubricPanel />` (the worked example using the
  evidence-card primitive at half-scale, labelled "Example"). Verify the worked example uses
  generic names per anti-fiction. Commit.
- **Task 4 — Sections 4–5 (recommend-logic · advisory-gate).** Build `<RecommendLogic />`
  (sprite-arrow decision tree + outcome pills) and `<AdvisoryGate variant="explainability" />`
  (reused primitive). Verify keyboard focus + reduced-motion. Commit.
- **Task 5 — Sections 6–8 (bias · rights · escalation) + compliance posture.** Build
  `<BiasAuditPanel />`, `<DsRights />`, `<EscalationPanel />`, and `<CompliancePosture />` (the
  truthful badge row). Verify all status labels are truthful ("scheduled pre-launch" /
  "design-aligned" / "target"). Commit.
- **Task 6 — FAQ + final CTA + assembly.** Build `<ExplainabilityFaq />` and
  `<FinalCta variant="explainability" />`. Assemble the full page. Run `--filter @ip/candidate
  build` and `tsc --noEmit` clean. Commit.
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
  3. Confirm the page is crawlable (canonical, JSON-LD `Article`, sitemap-ready).
  4. Confirm cross-links (`/trust`, `/what-we-dont-do`, `/sample-report`, DPO mailto) resolve.

## States & a11y

- **States.** Static surface — no loading / empty / error. Interactive: in-page TOC scroll (if
  added), audience switch, `<details>` FAQ accordions, cross-link `next/link` navigations.
- **Responsive.** Inherits the design-language matrix. Decision-tree visual collapses to vertical
  on `<= 760px`; rights 4-col → 2-col → 1-col; bias 3-col → 1-col; FAQ 2-col → 1-col.
- **Dark + light.** All colors via tokens. Outcome pills resolve cleanly in both themes; no
  hard-coded hex.
- **A11y.** One `<h1>`. Section heads `<h2>`, sub-sections `<h3>`. Outcome pills include
  `aria-label` (e.g. `aria-label="Outcome: recommend"`). The decision-tree SVG is `role="img"`
  with a full `aria-label` describing the branching narrative. DSR action links use real
  `<a href>` with `next/link`; mailto buttons use `<a href="mailto:">`. Touch targets ≥44×44.
  Contrast ≥4.5:1 (body uses `--ink-2` on `--bg`). Focus rings use `--teal` 2px / 4px halo.
  Honors `prefers-reduced-motion`.

## Acceptance

- Matches [`_design-language.md`](../_design-language.md) 1:1 in tokens, type, spacing, motion,
  rhythm; side-by-side proof committed under
  `docs/brand/redesign-v3/verify/ai-explainability-{light,dark}.jpeg`.
- `--filter @ip/candidate build` green; `tsc --noEmit` green; no console warnings.
- **Anti-fiction enforced:** no fake bias-audit results, no claimed audits we haven't done, no
  fabricated DSR-handling SLAs, no synthetic customer names. Worked rubric example uses a
  generic "Sample candidate / Sample utterance".
- All compliance labels are truthful: NYC Local Law 144 → "bias audit scheduled pre-launch";
  EU AI Act Annex III → "design-aligned"; GDPR Art. 22 → "human-in-the-loop enforced today".
- Cross-links (`/trust`, `/what-we-dont-do`, `/sample-report`, `/dpa`, DPO mailto) resolve.
- Responsive verification (8-step list above) is complete — proofs committed.
- Spec-drift check: rubric / recommendation logic / advisory gate descriptions agree with the
  applicant-report and proctored-interview screens. If those screens diverge from this doc,
  update both.
