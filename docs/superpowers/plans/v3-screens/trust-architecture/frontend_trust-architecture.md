# Trust Architecture — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Long-form public surface that explains, end-to-end, **how Aptura's proctoring architecture is built
and what each layer does (and refuses to do)**. The marketing site's anti-fiction posture lives or
dies on this page — a curious recruiter or skeptical candidate must be able to read it cover to
cover and come away convinced that the architectural claims on the landing are real, enforceable,
and reviewable. Mirrors the landing's `#integrity` and `#defense` sections but expanded into a
5-layer architecture narrative with per-layer detail panels.

## Route + role

`/trust` (new file: `apps/candidate/app/(marketing)/trust/page.tsx`) · **public** (token-free,
crawlable, SSR-rendered, indexable). No `.app` shell — uses the marketing chrome.

## Approved mockup (build to this exactly)

- **Design language source of truth:** [`_design-language.md`](../_design-language.md) — tokens,
  type scale, primitives, motion vocabulary, anti-slop bans, responsive matrix.
- **Demo reference (overall style):** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
- **Screenshots to mirror style/density:**
  - Light full: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-light-full.jpeg`
  - Light hero: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-light-hero.jpeg`
  - Dark full: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-dark-full.jpeg`
  - Dark hero: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-dark-hero.jpeg`
- **In-demo regions to reuse the language of:**
  - `#integrity` (the integrity timeline) — the same `.itl` + `.itl-track` primitives appear here
    in a smaller, schematic role inside Layer 4.
  - `#defense` (the privacy/detect split panels) — the `.def-panel` primitive recurs per-layer.

There is no per-screen mockup file yet. Match the design language exactly; iterate via side-by-side
screenshot proof committed under `docs/brand/redesign-v3/verify/trust-architecture-{light,dark}.jpeg`.

## Existing code being REPLACED (not modified)

**This is a NEW screen — no existing code to replace.** The Tier-1 missing-pages audit
([`../_missing-pages-audit.md`](../_missing-pages-audit.md)) identified this as gap #35; no v2 or
v3 implementation exists. Reuse the **shared marketing chrome** introduced in the landing plan's
Task 1 + Task 2:

- `<UtilityRule />` — top announcement band (from `apps/candidate/components/marketing/`)
- `<MegaNav />` — sticky blurred bar with audience switch + mega-menu
- `<MegaFooter />` — 6-column sitemap

These three are imported, not re-implemented. Page-specific section components live under
`apps/candidate/components/marketing/trust/`.

## Layout & components

Marketing-style page (no `.app` sidebar shell). Section spine, in order:

| # | Section | Component (new) | Primitives / tokens |
|---|---|---|---|
| 0 | Top utility rule | `<UtilityRule />` *(shared)* | `.toprule` from landing Task 1 |
| 1 | Mega-nav | `<MegaNav />` *(shared)* | `.nav` + `.audience-switch` + mega-panel |
| 2 | Hero | `<TrustHero />` | `.wrap` + display headline + lead + `.status` chip ("Pre-launch · architecture today"); no HUD — this is a thesis page |
| 3 | Promise band | `<PromiseBand />` | 4-up `.stats-grid` variant: *"1 source of truth · 0 raw frames stored · 100% server-authoritative auto-end · every action audited"* — architectural truths, not customer outcomes |
| 4 | Layer overview | `<ArchitectureOverview />` | Anchor-cell bento (`.cell.anchor`) with a vertical 5-layer diagram (SVG, lucide-style strokes) + 5 supporting `.cell` summaries — clicking a layer scrolls to its detail section |
| 5 | Layer 1 · Identity | `<LayerSection layer="identity" />` | 3-col `.acts > .act` row: `act-num` ("Layer 1"), copy column, `.mini-identity` visual; followed by a `<DefenseSplit>` ("What we verify" gold-tinted / "What we never see" teal-tinted) |
| 6 | Layer 2 · Environment | `<LayerSection layer="environment" />` | Same shape; visual is `.mini-room`; `def-panel` pair covers room-scan + secondary-device + lockdown |
| 7 | Layer 3 · Behaviour | `<LayerSection layer="behaviour" />` | Same; visual is a compact integrity-strip mock (`.hud-strip` excerpt); `def-panel` pair covers on-device-only detectors vs no-keystroke/no-screen-capture |
| 8 | Layer 4 · Integrity timeline | `<LayerSection layer="timeline" />` | Same; visual is a small, non-interactive `.itl` + `.itl-track` schematic (re-used CSS); `def-panel` pair covers typed-events-only + immutable-audit |
| 9 | Layer 5 · Advisory gate | `<LayerSection layer="advisory" />` | Same; visual is `.mini-decision`; `def-panel` pair covers AI-recommends / human-signs and reviewer roles |
| 10 | Cross-cutting controls | `<ControlsMatrix />` | A 2-column compact comparison reusing `.compare-table` styling: *Threat → Layer that catches it*; rows: impersonation, room-aid, screen-share, second-device, mute/cam-off, browser-tab-out, voice-of-others, model-coaching, post-hoc-edit |
| 11 | Reviewability & audit | `<AuditPanel />` | Two `.def-panel`s side by side: "What is logged" (gold-soft) / "Who can review" (teal-soft); ends with a link to `/company/audit` (gated; mention but don't expose) |
| 12 | What this is NOT | `<NotThisPanel />` | Coral-soft `.def-panel` listing the explicit "Aptura is not a background check / not an ID-verification service / not a credit decision / not a biometric ID database" — cross-links to `/what-we-dont-do` |
| 13 | Roadmap honesty | `<RoadmapBand />` | A truthful sub-band reusing `TrustBand` shape: "Designed-aligned" / "Scheduled pre-launch" / "On the roadmap" — no claimed certifications |
| 14 | Final CTA | `<FinalCta variant="trust" />` | Dual card (`.finalcta`): "Read AI Explainability →" (teal) / "See a sample report →" (coral) |
| 15 | Mega-footer | `<MegaFooter />` *(shared)* | `.bigfoot` + 6-column sitemap |

### Component-to-primitive map

All primitives below come from `@ip/ui` (added in the landing plan's Task 1). This page adds **no
new primitives** — only new compositions:

| Region | Primitive used | Notes |
|---|---|---|
| Section heads | `.section-head` (single column) | Single short eyebrow word per section; never all-caps tracked |
| Layer overview anchor | `.cell.anchor` + custom SVG diagram | Diagram uses sprite symbols (`mark`, `eye`, `shield`, `lock`) at 1.5–2px stroke |
| Per-layer rows | `.acts > .act` + `.mini-*` visuals | Numbered scaffold justified — layers ARE a sequence |
| Per-layer defense | `.def-panel.detect` + `.def-panel.privacy` | Gold + teal tinted |
| Controls matrix | `.compare-table` with `.us-col` removed | Two-column threat→layer mapping |
| Roadmap badges | `.trust-band > .badges` | Truthful "design-aligned / on the roadmap / scheduled pre-launch" |

## Data wiring / seam

- **No fetch on this page.** Pure static content rendered SSR.
- **Static content lives in `content.ts`** (new: `apps/candidate/app/(marketing)/trust/content.ts`):
  ```ts
  HERO:              { eyebrow; h1; lead; status: "Pre-launch · architecture today" }
  PROMISE:           { value: string; label: string }[]   // 4 entries
  OVERVIEW:          { anchor: { title; body; diagram: "5-layer" }; cells: { n: 1|2|3|4|5; title; body }[] }
  LAYERS:            { id: "identity"|"environment"|"behaviour"|"timeline"|"advisory"; n: 1|2|3|4|5;
                       title; copy; bullets: string[]; visual; detect: string[]; privacy: string[] }[]
  CONTROLS:          { threat: string; layer: 1|2|3|4|5; how: string }[]
  AUDIT:             { logged: { title; body; bullets[] }; reviewers: { title; body; bullets[] } }
  NOT_THIS:          { html: string }[]
  ROADMAP_BADGES:    { label; sub; status: "design-aligned"|"scheduled"|"roadmap" }[]
  FINAL_CTA:         { left: { title; body; href; label }; right: { title; body; href; label } }
  ```
- **CTA links** are static `next/link` href constants — no router pushes, no auth gates.
- **Backend:** none. See [`./backend_trust-architecture.md`](./backend_trust-architecture.md).

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Reference design is the design language.** No per-screen mockup file exists. Match
> [`_design-language.md`](../_design-language.md) exactly; the demo at
> [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html) is the worked
> example for tone, density, motion.

- **Task 1 — Route scaffold + shared chrome.** Add `apps/candidate/app/(marketing)/trust/page.tsx`
  rendering `<UtilityRule /> + <MegaNav /> + <main id="trust"> … </main> + <MegaFooter />`. Wire
  page metadata (title, OG, canonical, `noindex=false`). Verify the page is reachable, that the
  mega-nav highlights the `Trust` link in the Platform mega-panel, and that mobile chrome
  collapses to the hamburger sheet per the responsive matrix. Commit `page.tsx`, `layout.tsx`
  (if a section-local layout is needed for SEO), `content.ts` skeleton.
- **Task 2 — Hero + promise band.** Build `<TrustHero />` and `<PromiseBand />`. Hero uses the
  display headline at the same scale as the landing hero, status chip pre-launch, and one
  paragraph lead capped 62ch. Promise band is the 4-up architectural-truth grid. Verify both
  themes; verify headline doesn't overflow at 360px. Commit.
- **Task 3 — Architecture overview anchor.** Build `<ArchitectureOverview />` with the anchor
  cell + 5 summary cells. Diagram SVG uses sprite symbols only — no per-page icon imports.
  Clicking a summary scrolls to the matching layer section (anchor links + `scroll-margin-top` to
  account for the sticky nav). Verify keyboard focus order. Commit.
- **Task 4 — Layer sections 1–5.** Build a single `<LayerSection />` component parameterised by
  layer id, rendering the 3-col `.acts > .act` row + the `<DefenseSplit>` pair. Render the 5
  layer sections from `LAYERS[]`. Each section gets a stable `id` (e.g. `#layer-identity`) for
  in-page anchor scrolls and shareable URLs. Verify the row stacks under 900px (2-col: num+copy /
  visual) and to 1-col under 760px. Commit.
- **Task 5 — Controls matrix + audit panel + not-this panel.** Build `<ControlsMatrix />` (the
  2-col threat→layer table; horizontal-scroll under 900px, card-stack under 760px per the
  responsive matrix), `<AuditPanel />` (two `.def-panel`s), and `<NotThisPanel />` (coral-soft
  panel that explicitly cross-links to `/what-we-dont-do`). Verify cross-link works. Commit.
- **Task 6 — Roadmap band + final CTA + assembly.** Build `<RoadmapBand />` (truthful badge row)
  and `<FinalCta variant="trust" />`. Assemble the section spine in
  `apps/candidate/app/(marketing)/trust/page.tsx`. Run `--filter @ip/candidate build` and
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
  3. Confirm the page is crawlable (no `noindex`, valid OG/JSON-LD if added, sitemap-ready).
  4. Confirm cross-links to `/what-we-dont-do`, `/ai-explainability`, `/sample-report` resolve.

## States & a11y

- **States.** Static surface — no loading / empty / error. Interactive: in-page anchor scrolls,
  audience switch, mega-menu, `<details>`-style accordions inside the controls matrix (if any
  threat row needs an "explain how" expansion).
- **Responsive.** Inherits the design-language matrix. Layer rows go 3-col → 2-col → 1-col;
  controls matrix becomes card-stack; defense splits stack; footer 6 → 3 → 2 → 1 col.
- **Dark + light.** All colors via tokens. Layer-overview SVG uses `currentColor` so it inherits
  the section's text token. No hard-coded hex.
- **A11y.** One `<h1>` (the hero). Section heads use `<h2>`, layer titles `<h3>`. Layer-overview
  cells are `<a href="#layer-…">` so keyboard users can jump. The architecture diagram is
  `role="img"` with an `aria-label` describing the 5-layer narrative (e.g. *"Five-layer
  proctoring architecture: identity, environment, behaviour, integrity timeline, advisory
  gate"*); inner SVG geometry is `aria-hidden`. `.compare-table` rows use a real `<table>` with
  `<th scope="row">`. Touch targets ≥44×44. Contrast ≥4.5:1 (body uses `--ink-2` on `--bg`).
  Focus rings use `--teal` 2px / 4px halo. Honors `prefers-reduced-motion`.

## Acceptance

- Matches [`_design-language.md`](../_design-language.md) 1:1 in tokens, type, spacing, motion,
  rhythm; side-by-side proof committed under
  `docs/brand/redesign-v3/verify/trust-architecture-{light,dark}.jpeg`.
- `--filter @ip/candidate build` green; `tsc --noEmit` green; no console warnings.
- **Anti-fiction enforced:** no fake certifications (only design-aligned / scheduled / roadmap),
  no claimed integrations, no fabricated customer outcomes, no synthetic testimonials. Every
  numeric claim is an architectural truth (e.g. "0 raw frames stored"), not a customer metric.
- Cross-links to `/what-we-dont-do`, `/ai-explainability`, `/sample-report` resolve.
- Responsive verification (8-step list above) is complete — proofs committed.
- The architecture diagram and per-layer text agree with what the proctored-interview / integrity-timeline
  / advisory-gate screens actually do. (Spec-drift check — if those screens diverge from this
  doc, update both.)
