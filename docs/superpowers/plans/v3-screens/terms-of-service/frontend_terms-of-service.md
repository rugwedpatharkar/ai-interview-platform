# Terms of Service — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Public, crawlable, SSR long-form legal document — the **Aptura Terms of Service**. Identical
layout grammar to [`privacy-policy`](../privacy-policy/frontend_privacy-policy.md) (sticky ToC
sidebar at `lg+` + prose column on the right, single-column with a `<details>` ToC accordion at
`≤ 1024 px`). Marketing chrome (top utility rule + sticky `MegaNav` + `MegaFooter`). Content is
rendered from a markdown source ratified by legal counsel — engineering ships placeholders.

> **Anti-fiction note (read before writing copy):** Placeholder copy throughout this plan and the
> seed markdown source is the literal string `[LEGAL: insert ratified text here]`. **Do NOT
> write actual legal text in the plan, in the markdown source, or in the implementation.** Legal
> owns the words; engineering owns the structure, the typography, the ToC behavior, and the
> markdown→HTML render path. No fabricated SLA / warranty / liability claims anywhere.

## Route + role

`/terms` — new top-level route in `frontend/apps/candidate/app/(marketing)/terms/page.tsx` ·
**public** (token-free, crawlable, SSR). No `.app` shell; uses the marketing chrome.

## Approved mockup (build to this exactly)

- **No per-screen mockup exists yet.** The layout is the **same shape as `/privacy`** and inherits
  from [`_design-language.md`](../_design-language.md). The marketing chrome (top rule + nav +
  footer) comes from [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
- Reuse the `<LegalHeader />`, `<LegalLayout />`, `<LegalProse />`, `<LegalToC />`,
  `<LegalToCMobile />`, `<LegalUpdatedCell />` primitives that the
  [`privacy-policy`](../privacy-policy/frontend_privacy-policy.md) screen extracts into
  `@ip/ui/legal/*` — they are shared across all three long-form legal pages.
- Side-by-side screenshot proof against the design-language reference (light + dark) is part of
  acceptance — see "Acceptance" below.

## Existing code being REPLACED (NEW; no existing code)

There is **no existing `/terms` route** in `frontend/apps/candidate/app/`. This is a net-new
public surface. No port, no migration — pure greenfield. Once shipped, the legal links in
`MegaFooter` and the `foot-bottom` legal row point at `/terms`.

## Layout & components

The composition mirrors [`privacy-policy`](../privacy-policy/frontend_privacy-policy.md) verbatim.
Only the **section spine** and the **markdown source path** differ.

| Region | Component | Notes |
|---|---|---|
| 0 — Top utility rule | `<UtilityRule />` | Marketing chrome. |
| 1 — Sticky mega-nav | `<MegaNav />` | Marketing chrome. |
| 2 — Document header | `<LegalHeader />` | Shared. Title = "Terms of Service" at `--step-4`. Meta row: Last updated · Effective · Version pill. |
| 3 — Body (2-col at `lg+`) | `<LegalLayout />` | Shared. ToC sidebar + prose column. |
| 3a — ToC sidebar (lg+) | `<LegalToC />` | Shared. Scroll-spy via `IntersectionObserver`. |
| 3b — Mobile ToC | `<LegalToCMobile />` | Shared. `<details>` accordion at `≤ 1024 px`. |
| 3c — Prose column | `<LegalProse />` | Shared. Renders the markdown source. |
| 4 — Last updated callout | `<LegalUpdatedCell />` | Shared. Teal-soft `.cell`. |
| 5 — Mega-footer | `<MegaFooter />` | Reused. The legal-links row marks `Terms` as current with `aria-current="page"`. |

### Sections (fixed structure — copy is owned by legal)

The body is rendered from `frontend/apps/candidate/content/legal/terms-of-service.md`. The plan
freezes the section spine (anchor IDs and headings); the words inside each section are
`[LEGAL: insert ratified text here]` until legal supplies them.

1. `acceptance` — Acceptance of these terms
2. `service-description` — Service description
3. `account` — Your account
4. `acceptable-use` — Acceptable use
5. `intellectual-property` — Intellectual property
6. `disclaimers` — Disclaimers
7. `limitation-of-liability` — Limitation of liability
8. `indemnification` — Indemnification
9. `termination` — Termination
10. `governing-law` — Governing law

A trailing `changelog` section is rendered if the markdown frontmatter includes a `changelog`
array — empty by default.

### Markdown render path

Same as [`privacy-policy`](../privacy-policy/frontend_privacy-policy.md): existing project
markdown pipeline (`react-markdown` if already in deps; otherwise the same one used elsewhere —
do NOT introduce a new lib). Safe-tag allowlist. Anchor IDs from frontmatter `sections[]`, not
heading text. External links open in a new tab with `rel="noopener noreferrer"`.

### Tokens / primitives used

Identical to [`privacy-policy`](../privacy-policy/frontend_privacy-policy.md). All shared
primitives live in `@ip/ui/legal/*` (extracted in Task 4 of the privacy-policy plan).

## Data wiring / seam

- **No fetch.** Pure static + one client-side `IntersectionObserver` for ToC scroll-spy.
- **Markdown source.** `frontend/apps/candidate/content/legal/terms-of-service.md` is read at
  build time via Next.js (server component reads from `fs`; no runtime fetch).
- **Frontmatter shape** (reuses the `LegalDoc` type from
  `content/legal/types.ts` — defined in the
  [`privacy-policy`](../privacy-policy/frontend_privacy-policy.md) plan):
  ```ts
  type LegalDoc = {
    title: string;                                  // "Terms of Service"
    slug: "terms-of-service";
    version: string;
    lastUpdated: string;
    effective: string;
    sections: { id: string; label: string }[];     // 10 fixed sections — see above
    changelog?: { date: string; note: string }[];
  };
  ```
- **Seed markdown** ships with `[LEGAL: insert ratified text here]` placeholders in every section
  body. The page renders cleanly with placeholders — that is the pre-launch state.
- Backend: **none.** See [`backend_terms-of-service.md`](./backend_terms-of-service.md).

## Tasks (TDD-style; build → screenshot-verify → commit per task)

> **Task 0 — No bespoke mockup.** The page inherits its mockup from
> [`_design-language.md`](../_design-language.md) and the marketing chrome of
> [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
> Do NOT modify the demo file.

> **Prereq.** The shared `@ip/ui/legal/*` primitives (`<LegalHeader />`, `<LegalLayout />`,
> `<LegalProse />`, `<LegalToC />`, `<LegalToCMobile />`, `<LegalUpdatedCell />`) are
> extracted by the [`privacy-policy`](../privacy-policy/frontend_privacy-policy.md) plan. This
> screen depends on those primitives being in `@ip/ui` — coordinate ordering with that plan.

- **Task 1 — Route + marketing chrome.** Create `app/(marketing)/terms/page.tsx`. Mount
  `<UtilityRule />`, `<MegaNav />`, `<MegaFooter />` from `@ip/ui`. Confirm `/terms` is reachable
  signed-out, SSR-renders, and crawls (200). Mark `Terms` in the footer legal row as
  `aria-current="page"`. Commit.
- **Task 2 — Markdown source + types.** Add `content/legal/terms-of-service.md` with the 10
  sections wired in frontmatter and `[LEGAL: insert ratified text here]` placeholders in each
  section body. Reuse the `LegalDoc` type from `content/legal/types.ts`. Commit.
- **Task 3 — Mount the shared primitives.** Render `<LegalHeader />` + `<LegalLayout />` (with
  `<LegalToC />`, `<LegalToCMobile />`, `<LegalProse />`, `<LegalUpdatedCell />`) wired to the
  `terms-of-service.md` frontmatter. Verify all 10 sections render with placeholders, ToC links
  resolve, scroll-spy highlights the active section at `lg+`. Commit.
- **Task 4 — Polish, a11y, and Responsive verification.**
  1. `--filter @ip/candidate build` is green; `--filter @ip/candidate exec tsc --noEmit` is green.
  2. Run the dev server, navigate to `/terms` signed-out, screenshot in both themes at 1440×900
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
        `docs/brand/redesign-v3/verify/terms-of-service-{mobile,tablet,desktop}.jpeg`.

## States & a11y

- **States.** Static surface. The only dynamic state is the ToC scroll-spy `active` highlight and
  the mobile `<details>` open/closed state. No loading / empty / error states.
- **Responsive.** ToC sidebar collapses at `≤ 1024 px` to a `<details>` accordion. Header meta row
  wraps. Prose column always single-column (line-length cap unchanged).
- **Dark + light.** All colors via tokens.
- **A11y.** One `<h1>` (the document title). `<header><nav><main><section><footer>` landmarks.
  ToC sidebar uses `<nav aria-label="Sections of this document">`. Active ToC link sets
  `aria-current="true"`. Footer legal link for `Terms` sets `aria-current="page"`. Mobile ToC
  uses native `<details>`. Touch targets ≥ 44 × 44 px. Contrast ≥ 4.5 : 1 everywhere. Focus
  rings use `--teal` 2 px / 4 px halo. Honors `prefers-reduced-motion`.

## Acceptance

- Looks 1:1 like the design language applied to a long-form legal document — same shape as
  `/privacy`. Side-by-side proof committed under
  `docs/brand/redesign-v3/verify/terms-of-service-{mobile,tablet,desktop}.jpeg` (per Task 4.4.8).
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors / warnings;
  reduced-motion is honored.
- Page renders cleanly with `[LEGAL: insert ratified text here]` placeholders in every section
  body — that IS the pre-launch state until legal supplies copy.
- Anti-fiction posture: no fabricated SLA / warranty / liability claims; the only verbatim claims
  on the page come from the legal-owned markdown source. Engineering does not write legal text.
- ToC scroll-spy works at `lg+`. Mobile accordion ToC works at `≤ 1024 px`.
- Footer `Terms` link is `aria-current="page"`.
- Public, token-free, crawlable; SSR-rendered.
