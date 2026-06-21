# Sample Report — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

A **public, interactive viewer** of the same sample evidence report that the landing demo
foreshadows. The hero CTA "See a sample report" lands here. Goal: let a curious recruiter or
candidate explore — without authentication — exactly what an Aptura report looks like, what
evidence is attached, and how integrity events are surfaced. Every visible field is labelled
*"Sample"*; no real candidate data, no real customer logos.

## Route + role

`/sample-report` (new file: `apps/candidate/app/(marketing)/sample-report/page.tsx`) ·
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
- **In-demo regions this page renders at full scale:**
  - `#evidence` (the sample evidence report card) — the `.evidence-card + .competency + .why`
    primitive renders at full size here, one card per competency. The landing showed a single
    sample card; this page shows the whole report.
  - `#integrity` (the integrity timeline) — the `.itl + .itl-track + .itl-pip + .itl-scrubber +
    .itl-events > .event` primitive is interactive on this page (severity pip filters; clicking
    a pip expands the matching event card).
  - `#advisory` shape recurs in a smaller "What happens next" footer panel.

There is no per-screen mockup file yet. Match the design language exactly; iterate via side-by-side
screenshot proof committed under `docs/brand/redesign-v3/verify/sample-report-{light,dark}.jpeg`.

## Existing code being REPLACED (not modified)

**This is a NEW screen — no existing code to replace.** Gap #38 in the Tier-1 missing-pages audit
([`../_missing-pages-audit.md`](../_missing-pages-audit.md)). The **authenticated** applicant
report lives under `/applications/[id]/report` (see the existing `applicant-report` plan) — the
sample-report page intentionally renders the SAME primitives, but on static sample data, with no
auth, no Firestore read, no PII. Reuse the shared marketing chrome from the landing plan's Task 1
+ Task 2:

- `<UtilityRule />` (shared)
- `<MegaNav />` (shared)
- `<MegaFooter />` (shared)

Page-specific section components live under `apps/candidate/components/marketing/sample-report/`.

> **Component reuse:** the underlying `EvidenceReport`, `IntegrityTimeline`, and `ScoreRing`
> components from `@ip/ui` are imported and rendered against the static `SAMPLE_REPORT` payload.
> This is the **same component code path** the authenticated screen uses — proving by
> construction that the public sample and the real report cannot diverge.

## Layout & components

Single-page report viewer with three primary regions (overview · competencies · integrity), plus
a public framing band on top and a "What happens next" panel below. Section spine, in order:

| # | Section | Component (new) | Primitives / tokens |
|---|---|---|---|
| 0 | Top utility rule | `<UtilityRule />` *(shared)* | `.toprule` |
| 1 | Mega-nav | `<MegaNav />` *(shared)* | `.nav` |
| 2 | Public framing | `<SampleHero />` | `.wrap` + display headline + lead + `.status` chip ("Sample · no real candidate") + dual button row ("Download a sample PDF" coral · "See trust architecture" ghost) |
| 3 | Report header | `<ReportHeader />` | Wide `.cell.anchor` (teal-soft) carrying: sample candidate name (`Sample candidate · Candidate A`), role title, completion timestamp (mono), `.ring` score ring (0–100), and a `pill-good / pill-warn / pill-danger` recommendation pill |
| 4 | Competency strip | `<CompetencyStrip />` | A `.bars` container with one `.bar` per competency (5–7), each labelled by name, mono value, and `.t > i` fill in `--teal`; this is the "at-a-glance" view |
| 5 | Evidence cards | `<EvidenceCards />` | A vertical stack of `.evidence-card + .competency + .why` cards, one per competency, with: rubric anchor, score, quoted transcript evidence (left-border quote token from the demo), short rationale; each card has an "Inspect transcript" expander |
| 6 | Integrity timeline | `<IntegrityTimelineFull />` | Full `.itl + .itl-track + .itl-pip + .itl-scrubber + .itl-events > .event`; clicking a severity pip expands the matching event card and shows the clip + auto-action reason; severity-filter chip group above |
| 7 | Advisory footer | `<AdvisoryFooter />` | A compact `.advisory > .adv.ai / .adv.human` panel reading "AI recommended. A human signed at HH:MM" with a small "Reviewer's note" sample box |
| 8 | Public framing footer | `<SampleFooter />` | A small `.cell` row labelled "About this sample" — explains that all fields are fabricated for demonstration; cross-links to `/trust`, `/ai-explainability`, `/what-we-dont-do` |
| 9 | Final CTA | `<FinalCta variant="sample-report" />` | Dual card: "Request a pilot →" (teal) / "Join the waitlist →" (coral) |
| 10 | Mega-footer | `<MegaFooter />` *(shared)* | `.bigfoot` |

### Component-to-primitive map

| Region | Primitive | Notes |
|---|---|---|
| Public framing | display headline + `.status` chip + dual buttons | `.status` always reads "Sample · no real candidate" |
| Report header | `.cell.anchor` + `.ring` + recommendation pill | Same ring CSS as the authenticated `applicant-report` |
| Competency strip | `.bars > .bar` | Mono value to the right of the fill |
| Evidence cards | `.evidence-card + .competency + .why` | Left-border quote token (semantic emphasis only — not anti-slop side-stripe; this is the demo's standard for quotes) |
| Inspect expander | native `<details>/<summary>` | Animates only via `--ease-out` |
| Integrity timeline | `.itl + .itl-track + .itl-pip.l/.m/.h + .itl-scrubber + .itl-events > .event` | Severity-filter chips above use `.pill-good / .pill-warn / .pill-danger` |
| Advisory footer | `.advisory > .adv.ai / .adv.human` | Half-scale compared to landing |
| Sample framing footer | `.cell` row | Cross-links to the 3 sibling marketing pages |
| Final CTA | `.finalcta` | Standard |

## Data wiring / seam

- **No fetch on this page.** A single static `SAMPLE_REPORT` constant is imported from
  `apps/candidate/app/(marketing)/sample-report/sample.ts` and rendered through the same
  `EvidenceReport` / `IntegrityTimeline` components used by the authenticated report.
- **Why this matters.** The sample on this page MUST stay in lockstep with the authenticated
  applicant-report DTO. The constant uses the **same TypeScript type** as the live consumer (see
  `packages/api-client/src/applications/report.ts` — name TBD if not yet present). When the DTO
  evolves, this constant fails the build until it's updated.
- **Static shape:**
  ```ts
  // sample.ts (FE static models — pre-launch voice)
  SAMPLE_REPORT: ApplicantReportDTO & {
    sample: true                       // brand marker enforced via type
  }
  // Where ApplicantReportDTO is the same type the authenticated screen consumes:
  //   candidateName: "Sample candidate" | "Candidate A"
  //   role: string
  //   completedAtIso: string
  //   overallScore: number               // 0–100
  //   recommendation: "recommend" | "borderline" | "not_recommend"
  //   competencies: { name; score; rubricAnchor; quote; rationale; transcriptSnippet }[]
  //   integrity: { events: { sev: "low"|"med"|"high"; at: string; title; body; clipText: string;
  //                          autoAction?: "warn"|"end" }[];
  //                summary: { score: number; counts: { low; med; high } } }
  //   advisory: { aiRecommendation: ...; humanSignedAtIso: string; reviewerNote: string }
  ```
- **Outbound links:** `/trust`, `/ai-explainability`, `/what-we-dont-do`, `/pilot`, `/waitlist`.
- **Download a sample PDF** button — links to a static `public/sample-report.pdf` asset (the FE
  team generates this from the same `SAMPLE_REPORT` constant; out-of-scope to generate on this
  plan, in scope to wire the link).
- **Backend:** none. See [`./backend_sample-report.md`](./backend_sample-report.md).

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Reference design is the design language.** The `.evidence-card`, `.bars`, `.itl`,
> `.ring`, and `.advisory` primitives in [`_design-language.md`](../_design-language.md) ARE the
> visual contract. The landing demo's `#evidence` and `#integrity` regions are the worked example.

- **Task 1 — Route scaffold + shared chrome + sample seed.** Add
  `apps/candidate/app/(marketing)/sample-report/page.tsx`, render
  `<UtilityRule /> + <MegaNav /> + <main> … </main> + <MegaFooter />`. Create
  `sample.ts` with the typed `SAMPLE_REPORT` constant. Wire metadata (title, OG, canonical,
  JSON-LD `Article` describing the sample). Verify the page is reachable + SSR'd. Commit.
- **Task 2 — Public framing hero + report header.** Build `<SampleHero />` (display headline,
  status chip "Sample · no real candidate", dual button row) and `<ReportHeader />` (the
  `.cell.anchor` carrying name / role / timestamp / `.ring` / recommendation pill). Verify both
  themes; verify headline does not overflow at 360px. Commit.
- **Task 3 — Competency strip + evidence cards.** Build `<CompetencyStrip />` (the `.bars`
  container) and `<EvidenceCards />` (vertical stack of `.evidence-card` instances with the
  left-border quote token + `<details>` "Inspect transcript" expander). Reuse the shared
  `EvidenceReport` primitive from `@ip/ui`. Verify the quote token + curly-quote marker render
  cleanly in both themes. Commit.
- **Task 4 — Full integrity timeline (interactive).** Build `<IntegrityTimelineFull />` with the
  severity-filter chip group + interactive `.itl-scrubber` (clicking a pip expands the matching
  event card). Reuse the shared `IntegrityTimeline` primitive from `@ip/ui`. Verify keyboard
  controls (arrow keys move the scrubber; Enter expands the event); verify reduced-motion no-ops
  the scrubber animation. Commit.
- **Task 5 — Advisory footer + sample framing footer + final CTA + assembly.** Build
  `<AdvisoryFooter />`, `<SampleFooter />`, and `<FinalCta variant="sample-report" />`.
  Assemble the page. Verify cross-links resolve. Run `--filter @ip/candidate build` and
  `tsc --noEmit` clean. Commit.
- **Task 6 — Sample PDF wiring + JSON-LD + canonical + sitemap.** Add the static
  `public/sample-report.pdf` placeholder and wire the "Download a sample PDF" button to it. Add
  JSON-LD `CreativeWork` describing the sample report. Add the route to the sitemap. Commit.
- **Task 7 — Final assembly + Responsive verification + side-by-side fidelity.**
  1. Side-by-side screenshot vs. the design language reference at 1440×900 in both themes;
     iterate any divergence until 1:1. Compare specifically against the landing demo's
     `#evidence` and `#integrity` regions — visual continuity is the whole point.
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
  3. Confirm "Sample" labelling appears on every field that could otherwise be mistaken for real
     candidate data.
  4. Confirm the authenticated `applicant-report` and this sample render the same primitives —
     diff the rendered DOM if needed.

## States & a11y

- **States.** Static surface — no loading / empty / error data states (the data is the constant).
  Interactive: `<details>` evidence-card expanders, severity-filter chips, integrity-timeline
  scrubber + pip-click expand.
- **Responsive.** Inherits the design-language matrix. Report header stacks under 900px
  (ring above text); evidence cards remain a single vertical column at all widths; integrity
  timeline event row goes 3-col → card-stack under 760px; the `.itl-track` SVG glow is hidden via
  CSS `display:none` under 540px (per the design language's performance section).
- **Dark + light.** All colors via tokens; ring fill uses `--teal`; severity pips use `--good /
  --warn / --danger`; no hard-coded hex.
- **A11y.** One `<h1>` (the public framing hero). Section heads `<h2>`. Each evidence card uses
  `<article>` with an `<h3>` competency title. The integrity timeline is a `region` with
  `aria-label="Sample integrity timeline"`; severity pips are `<button>`s with
  `aria-label="Low severity event at HH:MM"` etc. The `.ring` score is `role="img"` with an
  `aria-label="Overall score: NN out of 100"`. Touch targets ≥44×44. Contrast ≥4.5:1. Focus
  rings use `--teal` 2px / 4px halo. Honors `prefers-reduced-motion` (scrubber slide no-op).

## Acceptance

- Matches [`_design-language.md`](../_design-language.md) 1:1 in tokens, type, spacing, motion,
  rhythm; side-by-side proof committed under
  `docs/brand/redesign-v3/verify/sample-report-{light,dark}.jpeg`.
- `--filter @ip/candidate build` green; `tsc --noEmit` green; no console warnings.
- **Anti-fiction enforced:** all candidate-facing fields say *"Sample"* / *"Candidate A"*; no
  real customer names; no fabricated company logos; the recommendation pill and reviewer note
  are labelled `(sample)` in the underlying text.
- The same `EvidenceReport` / `IntegrityTimeline` / `ScoreRing` primitives used by the
  authenticated `applicant-report` are used here — if the DTO evolves, both screens fail the
  build at once.
- Cross-links (`/trust`, `/ai-explainability`, `/what-we-dont-do`, `/pilot`, `/waitlist`)
  resolve; the static PDF link returns 200 (placeholder is acceptable for the first commit).
- Responsive verification (8-step list above) is complete — proofs committed.
- JSON-LD `CreativeWork` and canonical URL set; the page is crawlable and not flagged as
  duplicate of the authenticated route.
