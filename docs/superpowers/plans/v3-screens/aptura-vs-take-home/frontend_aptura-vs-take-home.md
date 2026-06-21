# Aptura vs. Take-Home — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

A long-form **comparison page** expanded from the landing's `#compare` row. The landing's
`<CompareTable />` is a glanceable 4-column table; this page is a thesis. It takes the
same comparison axes and walks through them in narrative form, showing per-row evidence and a
worked example of when a take-home is the right answer (e.g. for very small teams or async
roles) and when it is not. Lives at the footer-linked URL `/compare/take-home` because that's the
honest version of "vs. the old way" — Aptura is specifically arguing **against the take-home as
the default**, not against assessment of any kind.

## Route + role

`/compare/take-home` (new file:
`apps/candidate/app/(marketing)/compare/take-home/page.tsx`) · **public** (token-free, crawlable,
SSR-rendered, indexable). No `.app` shell — uses the marketing chrome.

## Approved mockup (build to this exactly)

- **Design language source of truth:** [`_design-language.md`](../_design-language.md).
- **Demo reference:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
- **Screenshots to mirror style/density:**
  - Light full: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-light-full.jpeg`
  - Light hero: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-light-hero.jpeg`
  - Dark full: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-dark-full.jpeg`
  - Dark hero: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-dark-hero.jpeg`
- **In-demo region this page expands:**
  - `#compare` (the 4-column `.compare-table`) — the same primitive is rendered here at the top
    of the page as the "at-a-glance" view, then expanded into a row-by-row narrative below.

There is no per-screen mockup file yet. Match the design language exactly; iterate via side-by-side
screenshot proof committed under `docs/brand/redesign-v3/verify/aptura-vs-take-home-{light,dark}.jpeg`.

## Existing code being REPLACED (not modified)

**This is a NEW screen — no existing code to replace.** Gap #41 in the Tier-1 missing-pages audit
([`../_missing-pages-audit.md`](../_missing-pages-audit.md)). The footer's "vs. the old way" link
currently points at the landing's `#compare` anchor; once this page exists, the footer link moves
here. Reuse the shared marketing chrome from the landing plan's Task 1 + Task 2:

- `<UtilityRule />` (shared)
- `<MegaNav />` (shared)
- `<MegaFooter />` (shared)

Page-specific section components live under `apps/candidate/components/marketing/compare/`. The
`<CompareTable />` primitive itself is imported from the landing's component library — this page
adds compositions, not new primitives.

## Layout & components

Single long-form page with: hero · at-a-glance table · row-by-row narrative · when take-home is
right · when take-home is wrong · FAQ · final CTA. Section spine, in order:

| # | Section | Component (new) | Primitives / tokens |
|---|---|---|---|
| 0 | Top utility rule | `<UtilityRule />` *(shared)* | `.toprule` |
| 1 | Mega-nav | `<MegaNav />` *(shared)* | `.nav` |
| 2 | Hero | `<CompareHero />` | Display headline + lead; eyebrow word "Comparison"; `.status` chip "Take-home assessments · why they break — and what to do instead." |
| 3 | At-a-glance table | `<CompareAtAGlance />` | `<CompareTable />` (imported from landing) showing 4 columns: *capability · résumé · take-home · Aptura*; the same rows as the landing, slightly expanded |
| 4 | Row-by-row narrative | `<CompareNarrative />` | A vertical stack of per-row blocks; each block: row name → 2-column body (take-home reality / Aptura reality) using the `.def-panel` shape (left teal-soft, right gold-soft); per-row evidence link (where applicable) |
| 5 | When take-home is right | `<TakeHomeRight />` | `.cell.anchor` teal-soft: a truthful list of when a take-home IS the right choice (small teams, async roles, very short specs, hobby projects) — establishes credibility |
| 6 | When take-home is wrong | `<TakeHomeWrong />` | `.cell.anchor` coral-soft: when it breaks (LLM-coached completion, multi-day timeboxing, drop-off, scoring inconsistency, no integrity signal) |
| 7 | Worked example | `<WorkedExample />` | A 3-act mini walkthrough: "Same candidate, two formats" — show the same role evaluated as a take-home vs. as an Aptura proctored interview, side-by-side; uses `.acts > .act` shape at compact scale |
| 8 | Compare FAQ | `<CompareFaq />` | Native `<details>/<summary>` with audience pill; 6–8 items ("What about pair programming?" / "What about screening before interview?" / "Are take-homes always bad?" / "Why not just record take-homes?") |
| 9 | Final CTA | `<FinalCta variant="compare" />` | Dual card: "Request a pilot →" (teal) / "See a sample report →" (coral) |
| 10 | Mega-footer | `<MegaFooter />` *(shared)* | `.bigfoot` |

### Component-to-primitive map

| Region | Primitive | Notes |
|---|---|---|
| Hero | display headline + `.status` chip | Single short eyebrow word |
| At-a-glance | `.compare-table` (imported) | Aptura column tinted `.us-col` |
| Row narrative | `.def-panel.privacy` (left) + `.def-panel.detect` (right) | Per-row paired panels |
| Right / wrong | `.cell.anchor` teal-soft / coral-soft | Two truthful anchor cells |
| Worked example | `.acts > .act` at compact scale | 3 acts: prompt → execution → evidence |
| FAQ | `<details>` accordion | Audience pill in `<summary>` |
| Final CTA | `.finalcta` dual card | Standard |

## Data wiring / seam

- **No fetch on this page.** Pure static content rendered SSR.
- **Static content lives in `content.ts`** (new:
  `apps/candidate/app/(marketing)/compare/take-home/content.ts`):
  ```ts
  HERO:        { eyebrow; h1; lead; status: string }
  GLANCE_ROWS: { capability: string; resume: string; takeHome: string; aptura: string }[]   // ≥8 rows
  NARRATIVE:   { capability: string;
                 takeHome: { title; body: string; bullets: string[]; cite?: string };
                 aptura:   { title; body: string; bullets: string[]; cite?: string };
                 evidenceHref?: string }[]                                                 // mirrors GLANCE_ROWS
  RIGHT:       { title; html: string }
  WRONG:       { title; html: string }
  EXAMPLE:     { lead; acts: { n: 1|2|3; title; takeHome: string; aptura: string }[] }     // 3 acts
  FAQ:         { aud: "cand"|"comp"; q; a }[]                                              // 6–8
  FINAL_CTA:   { left: { title; body; href; label }; right: { title; body; href; label } }
  ```
- **Outbound links:** `/trust`, `/ai-explainability`, `/sample-report`, `/pilot`, `/waitlist`.
  Plus the landing's `#compare` anchor for users arriving from the landing footer.
- **Backend:** none. See [`./backend_aptura-vs-take-home.md`](./backend_aptura-vs-take-home.md).

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Reference design is the design language.** The `.compare-table` primitive and
> `.def-panel` primitive are the entire visual language of this page. No new primitives.

- **Task 1 — Route scaffold + shared chrome + content seed.** Add
  `apps/candidate/app/(marketing)/compare/take-home/page.tsx`, render
  `<UtilityRule /> + <MegaNav /> + <main> … </main> + <MegaFooter />`. Wire metadata (title, OG,
  canonical, JSON-LD `Article`). Create `content.ts` skeleton. Verify reachable + SSR'd. Commit.
- **Task 2 — Hero + at-a-glance table.** Build `<CompareHero />` and `<CompareAtAGlance />`
  (imports the landing's `<CompareTable />` component and supplies the page's `GLANCE_ROWS`).
  Verify both themes; verify the table converts to a card-stack under 760px (per the responsive
  matrix). Commit.
- **Task 3 — Row-by-row narrative.** Build `<CompareNarrative />` — a vertical stack where each
  row is a paired `.def-panel.privacy` (take-home reality) + `.def-panel.detect` (Aptura
  reality). The per-row `evidenceHref` links to the trust-architecture layer or the sample
  report. Verify the paired panels stack on <900px (take-home above Aptura). Commit.
- **Task 4 — When take-home is right + when it is wrong.** Build `<TakeHomeRight />` (teal-soft
  anchor cell with the truthful "when it works" list) and `<TakeHomeWrong />` (coral-soft anchor
  cell with the "when it breaks" list). The "right" block intentionally precedes the "wrong"
  block to establish credibility. Commit.
- **Task 5 — Worked example.** Build `<WorkedExample />` — a 3-act mini walkthrough using
  `.acts > .act` at compact scale; each act shows the take-home outcome and the Aptura outcome
  side-by-side. Use generic "Sample candidate" labels per anti-fiction. Verify the act rows
  stack on <900px. Commit.
- **Task 6 — FAQ + final CTA + assembly.** Build `<CompareFaq />` and
  `<FinalCta variant="compare" />`. Assemble. Run `--filter @ip/candidate build` and
  `tsc --noEmit` clean. Commit.
- **Task 7 — Update landing footer link.** Once this page exists, update the landing's footer
  "vs. the old way" link from `#compare` to `/compare/take-home`. Confirm the landing's
  in-page `#compare` anchor still works for users who arrive from elsewhere. Commit.
- **Task 8 — Final assembly + Responsive verification + side-by-side fidelity.**
  1. Side-by-side screenshot vs. the design language reference at 1440×900 in both themes;
     iterate any divergence until 1:1. Compare specifically against the landing demo's
     `#compare` row — the at-a-glance table here should be visually consistent with that.
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
  3. Confirm cross-links resolve.
  4. Confirm the page argues against the default of take-homes without strawmanning — the
     "when take-home is right" block is genuinely useful, not a setup.

## States & a11y

- **States.** Static surface — no loading / empty / error. Interactive: in-page anchor scrolls,
  audience switch, mega-menu, `<details>` accordions in FAQ.
- **Responsive.** Inherits the design-language matrix. The compare-table at-a-glance converts to
  card-stack under 760px (per the matrix). The row narrative paired panels stack under 900px.
  The worked example acts go 3-col → 2-col → 1-col.
- **Dark + light.** All colors via tokens. The teal-soft / coral-soft anchor cells resolve cleanly
  in both themes. No hard-coded hex.
- **A11y.** One `<h1>`. Section heads `<h2>`. Row narrative blocks use `<article>` with `<h3>`
  capability titles. The compare table uses a real `<table>` with `<th scope="col">` and
  `<th scope="row">`. Worked-example acts use `<ol>` so the sequence is semantic. Touch targets
  ≥44×44. Contrast ≥4.5:1. Focus rings use `--teal` 2px / 4px halo. Honors
  `prefers-reduced-motion`.

## Acceptance

- Matches [`_design-language.md`](../_design-language.md) 1:1 in tokens, type, spacing, motion,
  rhythm; side-by-side proof committed under
  `docs/brand/redesign-v3/verify/aptura-vs-take-home-{light,dark}.jpeg`.
- `--filter @ip/candidate build` green; `tsc --noEmit` green; no console warnings.
- **Anti-fiction enforced:** the worked example uses "Sample candidate" / generic role; no fake
  benchmarks ("Take-homes have a 40% drop-off rate" — only included if we cite an external
  source, otherwise removed); no named vendor brands in the narrative.
- The "when take-home is right" block is genuinely useful, not a strawman.
- The landing footer link is updated to point at `/compare/take-home`; the landing's `#compare`
  anchor still works for direct deep-links.
- Cross-links (`/trust`, `/ai-explainability`, `/sample-report`, `/pilot`, `/waitlist`) resolve.
- Responsive verification (8-step list above) is complete — proofs committed.
