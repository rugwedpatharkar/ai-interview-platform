# Privacy Policy — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Public, crawlable, SSR long-form legal document — the **Aptura Privacy Policy**. Wrapped in the
marketing chrome (top utility rule + sticky `MegaNav` + `MegaFooter`) and presented in a
typography-anchored two-column layout: sticky in-page Table of Contents on the left at `lg+`,
prose column on the right. The page is **content-driven** — the structure is fixed, the legal
copy is rendered from a markdown source file ratified by legal counsel.

> **Anti-fiction note (read before writing copy):** Placeholder copy throughout this plan and the
> seed markdown source is the literal string `[LEGAL: insert ratified text here]`. **Do NOT write
> actual legal text in the plan, in the markdown source, or in the implementation.** The legal
> team owns the words; engineering owns the structure, the typography, the ToC behavior, and the
> markdown→HTML render path. No fabricated GDPR/CCPA/SOC-2 claims anywhere.

## Route + role

`/privacy` — new top-level route in `frontend/apps/candidate/app/(marketing)/privacy/page.tsx` ·
**public** (token-free, crawlable, SSR). No `.app` shell; uses the marketing chrome.

## Approved mockup (build to this exactly)

- **No per-screen mockup exists yet.** The layout is derived from the design language and
  references the **footer + nav chrome** from
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
- The page applies the **same tokens, type scale, components, motion, and rhythm** as the landing
  demo — see [`_design-language.md`](../_design-language.md) for the canonical reference.
- Side-by-side screenshot proof against the design-language reference (light + dark) is part of
  acceptance — see "Acceptance" below.

## Existing code being REPLACED (NEW; no existing code)

There is **no existing `/privacy` route** in `frontend/apps/candidate/app/`. This is a net-new
public surface. No port, no migration — pure greenfield. Once shipped, the legal links in
`MegaFooter` (currently `href="#"`) and in the `foot-bottom` legal row point at `/privacy`.

## Layout & components

Top-to-bottom composition (all primitives from `@ip/ui` per the design language):

| Region | Component | Notes |
|---|---|---|
| 0 — Top utility rule | `<UtilityRule />` | Marketing chrome — same as landing. |
| 1 — Sticky mega-nav | `<MegaNav />` | Reused marketing chrome; full nav + audience switch + Sign in + Book a demo. |
| 2 — Document header | `<LegalHeader />` | NEW. Title (`Privacy Policy` · `class="display"` h1 at `--step-4`), short lead (`--step-1` body), meta row: `Last updated: <date>` (Geist Mono, `--ink-3`) · `Effective: <date>` (mono) · Version pill (`.pill`). Single-column, max width `65ch` so the header sits visually balanced above the wider 2-col body. |
| 3 — Body (2-col at `lg+`) | `<LegalLayout />` | NEW. CSS Grid `grid-template-columns: 240px 1fr; gap: clamp(2rem, 4vw, 4rem)` at `lg+`. Left = sticky ToC (`<LegalToC />`). Right = prose (`<LegalProse />`). Collapses to single column at `≤ 1024 px`. |
| 3a — ToC sidebar (lg+) | `<LegalToC />` | NEW. `position: sticky; top: calc(var(--nav-h) + 1.5rem)`. List of section headings (`Who we are` → `Contact`) rendered as anchor links. Active section is highlighted (teal left-marker dot + `--ink-deep` text) using `IntersectionObserver`. Mono `--step--1` for the link labels. |
| 3b — Mobile ToC | `<LegalToCMobile />` | NEW. Native `<details>` accordion ("Jump to section…") that ships under the document header at `≤ 1024 px`. Content is the same anchor list. Closes on `click` of any link. |
| 3c — Prose column | `<LegalProse />` | NEW. Renders sanitized HTML from the markdown source (see "Data wiring"). Sections are `<section id="…">` with `<h2 class="display">` (`--step-3`). Body uses `Hanken Grotesk`, `--ink-2`, line-length capped at `65ch`. `<em>` token = teal medium-weight. `<code>` uses Geist Mono. Blockquotes use a tinted `--surface-2` background with full border (NOT a side-stripe — anti-slop ban). |
| 4 — Last updated callout | `<LegalUpdatedCell />` | NEW. A single `.cell` near the bottom with a teal-soft tint. Restates last-updated date + "Subscribe to changes (mailto:)". |
| 5 — Mega-footer | `<MegaFooter />` | Reused. The legal-links row at the bottom marks `Privacy` as current with `aria-current="page"`. |

### Sections (fixed structure — copy is owned by legal)

The body is rendered from a markdown file at
`frontend/apps/candidate/content/legal/privacy-policy.md`. The plan freezes the **section
spine** (anchor IDs and headings); the words inside each section are
`[LEGAL: insert ratified text here]` until legal supplies them.

1. `who-we-are` — Who we are
2. `data-we-collect` — Data we collect
3. `how-we-use-it` — How we use it
4. `legal-basis` — Legal basis (GDPR Art. 6 — section heading only; substantive text by legal)
5. `retention` — Retention
6. `your-rights` — Your rights
7. `subprocessors` — Subprocessors (links to `/subprocessors` if/when published; otherwise inline list — text by legal)
8. `contact` — Contact

A trailing `changelog` section is rendered if the markdown frontmatter includes a `changelog`
array — empty by default.

### Markdown render path

- Parser: existing project markdown pipeline (`react-markdown` if already in deps; otherwise the
  same one used elsewhere — do NOT introduce a new lib). Allow only safe tags
  (`h2 h3 p ul ol li em strong code pre blockquote a hr`).
- Anchor IDs are generated from the section slug in the markdown frontmatter (`sections: [{id, label}]`),
  not from heading text. This keeps anchors stable when legal rewords a heading.
- `<a>` opens external links in a new tab with `rel="noopener noreferrer"`.

### Tokens / primitives used

- Section rhythm: `padding: clamp(4rem, 7vh, 6rem) 0` for `<LegalHeader />` and the body wrapper.
- Container: `.wrap` (`width: min(100% - 2.5rem, 1240px)`).
- Surfaces: `--bg` (page), `--surface` for the optional callout cell, `--line` for hairlines.
- Type: `class="display"` headings; body via `Hanken Grotesk` at `--step-0`; mono for meta.
- Motion: none beyond the default `.rise` reveal on the header; respect `prefers-reduced-motion`.

## Data wiring / seam

- **No fetch.** Pure static + one client-side `IntersectionObserver` for ToC scroll-spy.
- **Markdown source.** `frontend/apps/candidate/content/legal/privacy-policy.md` is read at build
  time via Next.js (server component reads from `fs` in `generateStaticParams`-friendly fashion;
  no runtime fetch).
- **Frontmatter shape** (typed in `content/legal/types.ts`):
  ```ts
  type LegalDoc = {
    title: string;
    slug: "privacy-policy";
    version: string;          // e.g. "v1.0"
    lastUpdated: string;      // ISO date
    effective: string;        // ISO date
    sections: { id: string; label: string }[];
    changelog?: { date: string; note: string }[];
  };
  ```
- **Seed markdown** ships with `[LEGAL: insert ratified text here]` placeholders inside each
  section body. The page must render cleanly with placeholders — that is the pre-launch state.
- Backend: **none.** See [`backend_privacy-policy.md`](./backend_privacy-policy.md).

## Tasks (TDD-style; build → screenshot-verify → commit per task)

> **Task 0 — No bespoke mockup.** The page inherits its mockup from
> [`_design-language.md`](../_design-language.md) and the marketing chrome of
> [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
> Do NOT modify the demo file.

- **Task 1 — Route + marketing chrome.** Create `app/(marketing)/privacy/page.tsx`. Mount
  `<UtilityRule />`, `<MegaNav />`, `<MegaFooter />` from `@ip/ui`. Confirm the page is reachable
  signed-out at `/privacy`, SSR-renders, and crawls (200, no client-only gating). Mark
  `Privacy` in the footer legal row as `aria-current="page"`. Commit.
- **Task 2 — `<LegalHeader />`.** Title (h1 `class="display"` at `--step-4`), lead, meta row
  (Last updated · Effective · Version pill). Verify header sits above the body grid and respects
  reduced-motion. Commit.
- **Task 3 — Markdown source + types.** Add `content/legal/types.ts` with `LegalDoc` and
  `content/legal/privacy-policy.md` with the 8 sections wired in frontmatter and
  `[LEGAL: insert ratified text here]` placeholders in each section body. Render via the
  existing markdown pipeline. Verify the page renders the placeholders with correct heading
  hierarchy (one `<h1>` from `<LegalHeader />`, one `<h2>` per section). Commit.
- **Task 4 — `<LegalLayout />` + `<LegalProse />`.** Two-column grid at `lg+`. Prose column
  uses `--ink-2` body, `65ch` line-length cap, `Hanken Grotesk`, `<em>` token in teal,
  blockquote uses tinted `--surface-2` with **full** border (no side-stripe). Verify in light +
  dark. Commit.
- **Task 5 — `<LegalToC />` sticky scroll-spy (`lg+`).** Sticky positioning under the nav,
  `IntersectionObserver` highlights the active section, mono `--step--1` link labels, teal
  leading-dot on the active link. Clicking a link smooth-scrolls (respects
  `prefers-reduced-motion` → `behavior: "auto"`). Visible focus ring on every link. Commit.
- **Task 6 — `<LegalToCMobile />` accordion.** Native `<details>/<summary>` "Jump to
  section…" under the header at `≤ 1024 px`. Closes on link click. Same anchor list, same focus
  rings. Touch targets ≥ 44 × 44 px. Commit.
- **Task 7 — `<LegalUpdatedCell />` callout + footer current state.** Bottom teal-soft `.cell`
  restating the last-updated date with a `mailto:` "Subscribe to changes" link. Footer
  `Privacy` link gets `aria-current="page"`. Commit.
- **Task 8 — Polish, a11y, and Responsive verification.**
  1. `--filter @ip/candidate build` is green; `--filter @ip/candidate exec tsc --noEmit` is green.
  2. Run the dev server, navigate to `/privacy` signed-out, screenshot in both themes at 1440×900
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
        `docs/brand/redesign-v3/verify/privacy-policy-{mobile,tablet,desktop}.jpeg`.

## States & a11y

- **States.** Static surface. The only dynamic state is the ToC scroll-spy `active` highlight and
  the mobile `<details>` open/closed state. No loading / empty / error states.
- **Responsive.** ToC sidebar collapses at `≤ 1024 px` to a `<details>` accordion. Header meta row
  wraps. Prose column always single-column (line-length cap unchanged).
- **Dark + light.** All colors via tokens. The optional bottom callout uses `--teal-soft`.
- **A11y.** One `<h1>` (the document title). `<header><nav><main><section><footer>` landmarks.
  ToC sidebar uses `<nav aria-label="Sections of this document">`. Active ToC link sets
  `aria-current="true"`. Footer legal link for `Privacy` sets `aria-current="page"`. Mobile ToC
  uses native `<details>`. Touch targets ≥ 44 × 44 px. Contrast ≥ 4.5 : 1 everywhere. Focus
  rings use `--teal` 2 px / 4 px halo. Honors `prefers-reduced-motion`.

## Acceptance

- Looks 1:1 like the design language applied to a long-form legal document — section spine,
  spacing, type, motion all match. Side-by-side proof committed under
  `docs/brand/redesign-v3/verify/privacy-policy-{mobile,tablet,desktop}.jpeg` (per Task 8.4.8).
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors / warnings;
  reduced-motion is honored.
- Page renders cleanly with `[LEGAL: insert ratified text here]` placeholders in every section
  body — that IS the pre-launch state until legal supplies copy.
- Anti-fiction posture: no fabricated GDPR / CCPA / SOC 2 / ISO claims; the only verbatim claims
  on the page come from the legal-owned markdown source. Engineering does not write legal text.
- ToC scroll-spy highlights the active section at `lg+`. Mobile accordion ToC works without JS
  beyond the existing markdown pipeline.
- Footer `Privacy` link is `aria-current="page"`.
- Public, token-free, crawlable; SSR-rendered.
