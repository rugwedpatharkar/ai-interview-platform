# Data Processing Agreement — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Public, crawlable, SSR long-form legal document — the **Aptura Data Processing Agreement (DPA)**.
B2B legal surface required for any company pilot. Identical layout grammar to
[`privacy-policy`](../privacy-policy/frontend_privacy-policy.md) and
[`terms-of-service`](../terms-of-service/frontend_terms-of-service.md) (sticky ToC sidebar at
`lg+` + prose column on the right, single-column with a `<details>` ToC accordion at
`≤ 1024 px`). Marketing chrome (top utility rule + sticky `MegaNav` + `MegaFooter`). Content is
rendered from a markdown source ratified by legal counsel — engineering ships placeholders.

> **Anti-fiction note (read before writing copy):** Placeholder copy throughout this plan and the
> seed markdown source is the literal string `[LEGAL: insert ratified text here]`. **Do NOT
> write actual legal text in the plan, in the markdown source, or in the implementation.** Legal
> owns the words; engineering owns the structure, the typography, the ToC behavior, and the
> markdown→HTML render path. No fabricated controller / processor / transfer-mechanism claims
> anywhere.

## Route + role

`/dpa` — new top-level route in `frontend/apps/candidate/app/(marketing)/dpa/page.tsx` ·
**public** (token-free, crawlable, SSR). No `.app` shell; uses the marketing chrome. Linked from
the `MegaFooter` legal row and from the `request-pilot` screen ("Review our DPA").

## Approved mockup (build to this exactly)

- **No per-screen mockup exists yet.** The layout is the **same shape as `/privacy` and `/terms`**
  and inherits from [`_design-language.md`](../_design-language.md). The marketing chrome (top
  rule + nav + footer) comes from
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
- Reuse the `<LegalHeader />`, `<LegalLayout />`, `<LegalProse />`, `<LegalToC />`,
  `<LegalToCMobile />`, `<LegalUpdatedCell />` primitives extracted into `@ip/ui/legal/*` by the
  [`privacy-policy`](../privacy-policy/frontend_privacy-policy.md) plan.
- Side-by-side screenshot proof against the design-language reference (light + dark) is part of
  acceptance — see "Acceptance" below.

## Existing code being REPLACED (NEW; no existing code)

There is **no existing `/dpa` route** in `frontend/apps/candidate/app/`. This is a net-new public
surface. No port, no migration — pure greenfield. Once shipped, the `DPA` link in `MegaFooter`
(currently `href="#"` per the demo line 1556) points at `/dpa`, and the
[`request-pilot`](../request-pilot/) screen links to `/dpa` from its "Legal" sub-section.

## Layout & components

The composition mirrors [`privacy-policy`](../privacy-policy/frontend_privacy-policy.md) and
[`terms-of-service`](../terms-of-service/frontend_terms-of-service.md) verbatim. Only the
**section spine** and the **markdown source path** differ.

| Region | Component | Notes |
|---|---|---|
| 0 — Top utility rule | `<UtilityRule />` | Marketing chrome. |
| 1 — Sticky mega-nav | `<MegaNav />` | Marketing chrome. |
| 2 — Document header | `<LegalHeader />` | Shared. Title = "Data Processing Agreement" at `--step-4`. Meta row: Last updated · Effective · Version pill. **B2B audience pill** ("For company customers") rendered to the right of the meta row at `lg+`. |
| 3 — Body (2-col at `lg+`) | `<LegalLayout />` | Shared. ToC sidebar + prose column. |
| 3a — ToC sidebar (lg+) | `<LegalToC />` | Shared. Scroll-spy via `IntersectionObserver`. |
| 3b — Mobile ToC | `<LegalToCMobile />` | Shared. `<details>` accordion at `≤ 1024 px`. |
| 3c — Prose column | `<LegalProse />` | Shared. Renders the markdown source. |
| 4 — Subprocessors link cell | `<LegalSubprocessorsCell />` | NEW (DPA-specific). A `.cell` near the `subprocessors` section linking to the live subprocessors list. Pre-launch behavior: if the `/subprocessors` route is not yet shipped, render the inline list from the markdown source (legal-owned) and disable the link. |
| 5 — Last updated callout | `<LegalUpdatedCell />` | Shared. Teal-soft `.cell`. |
| 6 — Mega-footer | `<MegaFooter />` | Reused. The legal-links row marks `DPA` as current with `aria-current="page"`. |

### Sections (fixed structure — copy is owned by legal)

The body is rendered from `frontend/apps/candidate/content/legal/dpa.md`. The plan freezes the
section spine (anchor IDs and headings); the words inside each section are
`[LEGAL: insert ratified text here]` until legal supplies them.

1. `parties` — Parties (controller / processor identification — text by legal)
2. `subject-matter` — Subject matter of the processing
3. `nature-purpose` — Nature and purpose of the processing
4. `categories-of-data` — Categories of personal data and categories of data subjects
5. `subprocessors` — Subprocessors (links to the live list at `/subprocessors` when published — see "Layout & components" above)
6. `security` — Security measures
7. `data-subject-rights` — Assistance with data-subject rights
8. `transfer-mechanisms` — International transfer mechanisms (heading only — substantive text by legal; do NOT assert SCC / IDTA / specific mechanisms here)
9. `term` — Term and termination
10. `liability` — Liability

A trailing `changelog` section is rendered if the markdown frontmatter includes a `changelog`
array — empty by default.

### Markdown render path

Same as [`privacy-policy`](../privacy-policy/frontend_privacy-policy.md): existing project
markdown pipeline (`react-markdown` if already in deps; otherwise the same one used elsewhere —
do NOT introduce a new lib). Safe-tag allowlist. Anchor IDs from frontmatter `sections[]`, not
heading text. External links open in a new tab with `rel="noopener noreferrer"`.

### Tokens / primitives used

Identical to [`privacy-policy`](../privacy-policy/frontend_privacy-policy.md). The B2B audience
pill in the header uses the coral-soft tint (`.pill-coral`) to visually mark this as the
B2B-only legal doc among the three.

## Data wiring / seam

- **No fetch.** Pure static + one client-side `IntersectionObserver` for ToC scroll-spy.
- **Markdown source.** `frontend/apps/candidate/content/legal/dpa.md` is read at build time via
  Next.js (server component reads from `fs`; no runtime fetch).
- **Frontmatter shape** (reuses the `LegalDoc` type from `content/legal/types.ts`):
  ```ts
  type LegalDoc = {
    title: string;                                  // "Data Processing Agreement"
    slug: "dpa";
    version: string;
    lastUpdated: string;
    effective: string;
    sections: { id: string; label: string }[];     // 10 fixed sections — see above
    changelog?: { date: string; note: string }[];
    audience?: "b2b";                              // DPA-specific — drives the header pill
  };
  ```
- **Seed markdown** ships with `[LEGAL: insert ratified text here]` placeholders in every section
  body. The page renders cleanly with placeholders — that is the pre-launch state.
- Backend: **none.** See [`backend_dpa.md`](./backend_dpa.md).

## Tasks (TDD-style; build → screenshot-verify → commit per task)

> **Task 0 — No bespoke mockup.** The page inherits its mockup from
> [`_design-language.md`](../_design-language.md) and the marketing chrome of
> [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
> Do NOT modify the demo file.

> **Prereq.** The shared `@ip/ui/legal/*` primitives are extracted by the
> [`privacy-policy`](../privacy-policy/frontend_privacy-policy.md) plan. This screen depends on
> those primitives being in `@ip/ui` — coordinate ordering with that plan.

- **Task 1 — Route + marketing chrome.** Create `app/(marketing)/dpa/page.tsx`. Mount
  `<UtilityRule />`, `<MegaNav />`, `<MegaFooter />` from `@ip/ui`. Confirm `/dpa` is reachable
  signed-out, SSR-renders, and crawls (200). Mark `DPA` in the footer legal row as
  `aria-current="page"`. Commit.
- **Task 2 — Markdown source + B2B-audience extension.** Add `content/legal/dpa.md` with the 10
  sections wired in frontmatter and `[LEGAL: insert ratified text here]` placeholders in each
  section body. Extend the `LegalDoc` type with the optional `audience: "b2b"` field. Commit.
- **Task 3 — Mount the shared primitives + B2B audience pill.** Render `<LegalHeader />` (with
  the coral-soft `.pill-coral` "For company customers" pill in the meta row when
  `audience === "b2b"`) + `<LegalLayout />` (with `<LegalToC />`, `<LegalToCMobile />`,
  `<LegalProse />`, `<LegalUpdatedCell />`) wired to the `dpa.md` frontmatter. Verify all 10
  sections render with placeholders. Commit.
- **Task 4 — `<LegalSubprocessorsCell />`.** Render a `.cell` near the `subprocessors` section.
  If `/subprocessors` is not yet shipped, the cell shows the inline list from the markdown
  source and the "View live list" link is disabled (`aria-disabled="true"` + `tabindex="-1"`).
  Once `/subprocessors` ships, the link is enabled. Commit.
- **Task 5 — Polish, a11y, and Responsive verification.**
  1. `--filter @ip/candidate build` is green; `--filter @ip/candidate exec tsc --noEmit` is green.
  2. Run the dev server, navigate to `/dpa` signed-out, screenshot in both themes at 1440×900
     and 390×844.
  3. Side-by-side fidelity check against the design-language reference and the marketing-chrome
     screenshots from
     `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-full.jpeg`.
  4. **Responsive verification** (from `_design-language.md` — verbatim 8 steps):
     1. **Screenshot at all 7 reference sizes:** 375 × 667 · 430 × 932 · 768 × 1024 portrait ·
        820 × 1180 portrait · 1024 × 1366 portrait · 1366 × 1024 landscape · 1440 × 900 ·
        1920 × 1080.
     2. **No horizontal scroll** at any width ≥ 320 px (test with
        `document.documentElement.scrollWidth`).
     3. **Every interactive element ≥ 44 × 44 px** when measured at the smallest breakpoint.
     4. **Keyboard does not cover form inputs** on iOS Safari (manual test or
        `visualViewport.height` check). (N/A for this screen — no inputs — note as N/A in proof.)
     5. **Orientation change** (portrait ↔ landscape) on iPad sizes — layout adapts gracefully,
        no clipped content.
     6. **`prefers-reduced-motion`** — every animation no-ops (test by enabling reduce-motion in
        DevTools).
     7. **Cross-browser:** iOS Safari, Chrome Android, Samsung Internet, desktop Safari / Chrome
        / Firefox / Edge — at minimum Safari + Chrome on every OS.
     8. **Save side-by-side proof** to
        `docs/brand/redesign-v3/verify/dpa-{mobile,tablet,desktop}.jpeg`.

## States & a11y

- **States.** Static surface. The only dynamic state is the ToC scroll-spy `active` highlight and
  the mobile `<details>` open/closed state. No loading / empty / error states.
- **Responsive.** ToC sidebar collapses at `≤ 1024 px` to a `<details>` accordion. Header meta row
  wraps; B2B pill moves under the meta row at `sm`. Prose column always single-column.
- **Dark + light.** All colors via tokens. The B2B audience pill uses `--coral-soft` and
  `--coral`; the subprocessors cell uses `--teal-soft`.
- **A11y.** One `<h1>` (the document title). `<header><nav><main><section><footer>` landmarks.
  ToC sidebar uses `<nav aria-label="Sections of this document">`. Active ToC link sets
  `aria-current="true"`. Footer legal link for `DPA` sets `aria-current="page"`. The disabled
  "View live list" link sets `aria-disabled="true"`. Mobile ToC uses native `<details>`. Touch
  targets ≥ 44 × 44 px. Contrast ≥ 4.5 : 1 everywhere. Focus rings use `--teal` 2 px / 4 px
  halo. Honors `prefers-reduced-motion`.

## Acceptance

- Looks 1:1 like the design language applied to a long-form legal document — same shape as
  `/privacy` and `/terms`, with the B2B audience pill marking the audience. Side-by-side proof
  committed under `docs/brand/redesign-v3/verify/dpa-{mobile,tablet,desktop}.jpeg` (per
  Task 5.4.8).
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors / warnings;
  reduced-motion is honored.
- Page renders cleanly with `[LEGAL: insert ratified text here]` placeholders in every section
  body — that IS the pre-launch state until legal supplies copy.
- Anti-fiction posture: no fabricated transfer-mechanism (SCC / IDTA) assertions, no claimed
  controller/processor relationships, no invented subprocessor list. The only verbatim claims on
  the page come from the legal-owned markdown source. Engineering does not write legal text.
- The `subprocessors` section's inline list / "View live list" link behaves correctly whether or
  not `/subprocessors` is shipped.
- Footer `DPA` link is `aria-current="page"`.
- Public, token-free, crawlable; SSR-rendered.
