# Trust Architecture — Backend contract (v3 · frozen)

> **Screen.** Public trust / privacy-architecture page. **FE consumer:** [`frontend_trust-architecture.md`](./frontend_trust-architecture.md).
> **Status:** `NEW — static page · no backend, no collections, no events.`
> **Truthfulness note:** Aptura is pre-launch. This contract documents only what the UI consumes today;
> claims of integrations, customer outcomes, or unearned certifications belong nowhere — see the
> anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities

- **None server-side for this page.** The trust-architecture page renders entirely from static
  content (`content.ts`) and the shared SVG sprite. There is no fetch and no query key.
- **In-page anchor scrolls** (`#layer-identity`, `#layer-environment`, `#layer-behaviour`,
  `#layer-timeline`, `#layer-advisory`) — pure client-side; no router.push.
- **Outbound cross-links** to `/what-we-dont-do`, `/ai-explainability`, `/sample-report` —
  static `next/link` href constants.
- **Final-CTA buttons** — `next/link` to the cross-link routes above; no fetch.
- **Deferred / out of scope.** Optionally surface a "last reviewed" timestamp once we have a
  governance review cadence. Optionally hydrate per-layer signal counts from product telemetry
  once collected. Until then, the page is architectural truth, not customer outcomes.

## Service & RPCs

- **No gRPC, no new REST, no proto delta.** This screen does not introduce any contract.
- The only adjacent contracts referenced from this page are:
  - The advisory / audit log (described on `/company/audit` plan) — cross-linked but not consumed here.
  - The sample-report viewer ([`../sample-report/backend_sample-report.md`](../sample-report/backend_sample-report.md))
    — cross-linked but its data also stays client-side static.

## Request / Response structures

There is no data contract for this screen. The only typed shapes are the static FE content models
the sections render off — these are FE constants, not a proto mirror.

```ts
// content.ts (FE static models — pre-launch voice)
HERO:              { eyebrow: string; h1: string; lead: string; status: "Pre-launch · architecture today" }
PROMISE:           { value: string; label: string }[]                                  // 4 entries
OVERVIEW:          { anchor: { title: string; body: string; diagram: "5-layer" };
                     cells: { n: 1|2|3|4|5; title: string; body: string }[] }
LAYERS:            { id: "identity"|"environment"|"behaviour"|"timeline"|"advisory";
                     n: 1|2|3|4|5;
                     title: string; copy: string; bullets: string[];
                     visual: "identity"|"room"|"strip"|"timeline"|"decision";
                     detect: string[];                                                  // "What we verify / block"
                     privacy: string[];                                                 // "What we never see"
                   }[]                                                                  // length 5
CONTROLS:          { threat: string; layer: 1|2|3|4|5; how: string }[]
AUDIT:             { logged: { title: string; body: string; bullets: string[] };
                     reviewers: { title: string; body: string; bullets: string[] } }
NOT_THIS:          { html: string }[]                                                   // explicit "Aptura is NOT…"
ROADMAP_BADGES:    { label: string; sub: string;
                     status: "design-aligned" | "scheduled" | "roadmap" }[]
FINAL_CTA:         { left:  { title: string; body: string; href: string; label: string };
                     right: { title: string; body: string; href: string; label: string } }
```

All copy in this file MUST follow the **anti-fiction rule** in [`_design-language.md`](../_design-language.md):

- No fabricated customer names, logos, testimonials, outcomes, percentages, or ratings.
- No claimed certifications we haven't earned (use "design-aligned", "on the roadmap", "scheduled
  pre-launch", "target").
- No integrations we haven't built.
- Sample data uses generic names if used ("Sample candidate", "Candidate A").

## Data required

- **None.** No collection read or written by this page. No derived/aggregated values, no indexes,
  no caches, no event topics.

## Errors & edge cases

- No fetch → no `NOT_FOUND` / `UNAUTHENTICATED` / `UNAVAILABLE` paths.
- Fully public, token-free, crawlable; SSR-renders immediately.
- Broken anchor (e.g. `#layer-unknown`) — silently no-ops; the browser scrolls to top.
- Cross-link 404 — covered by the global `/_not-found` page; not this contract's concern.

## Cross-references

- Sibling public pages: [`../what-aptura-doesnt-do/backend_what-aptura-doesnt-do.md`](../what-aptura-doesnt-do/backend_what-aptura-doesnt-do.md),
  [`../ai-explainability/backend_ai-explainability.md`](../ai-explainability/backend_ai-explainability.md),
  [`../sample-report/backend_sample-report.md`](../sample-report/backend_sample-report.md),
  [`../accessibility-statement/backend_accessibility-statement.md`](../accessibility-statement/backend_accessibility-statement.md).
- Authenticated-side audit viewer (cross-linked, not consumed): `/company/audit` —
  see the company-audit-log plan in the next wave.
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
