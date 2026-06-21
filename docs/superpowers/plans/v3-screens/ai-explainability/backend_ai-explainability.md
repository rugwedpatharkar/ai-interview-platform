# AI Explainability — Backend contract (v3 · frozen)

> **Screen.** Public AI Explainability Statement page. **FE consumer:** [`frontend_ai-explainability.md`](./frontend_ai-explainability.md).
> **Status:** `NEW — static page · no backend, no collections, no events.`
> **Truthfulness note:** Aptura is pre-launch. This contract documents only what the UI consumes today;
> claims of integrations, customer outcomes, or unearned certifications belong nowhere — see the
> anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities

- **None server-side for this page.** The explainability page renders entirely from static content
  (`content.ts` + MDX section files) and the shared SVG sprite. There is no fetch and no query key.
- **In-page anchor scrolls** to per-section ids; pure client-side.
- **Outbound links:** `/trust`, `/what-we-dont-do`, `/sample-report`, `/dpa` (Tier 2), and a
  `mailto:` to the DPO inbox — all static href constants.
- **Final-CTA buttons** — `next/link` cross-links; no fetch.
- **Deferred / out of scope.**
  - When a bias audit is actually completed pre-launch, link the published PDF as a download —
    static asset; still no RPC.
  - When EU AI Act Annex III conformity assessment is filed, link the artefact ID — still static.
  - If we later need an "I want to file an appeal" form, that becomes a
    `forms.submitExplainabilityAppeal` contract similar to the pilot / waitlist forms — see
    [`../request-pilot/backend_request-pilot.md`](../request-pilot/backend_request-pilot.md). NOT
    in scope for this page today.

## Service & RPCs

- **No gRPC, no new REST, no proto delta.** This screen does not introduce any contract.
- The only adjacent contracts referenced from this page are:
  - `/applications/[id]/outcome` re-score path — described on the application-outcome plan (next
    wave). Cross-linked, not consumed here.
  - The sample-report viewer — see
    [`../sample-report/backend_sample-report.md`](../sample-report/backend_sample-report.md).

## Request / Response structures

There is no data contract for this screen. The only typed shapes are the static FE content models
the sections render off — these are FE constants, not a proto mirror.

```ts
// content.ts (FE static models — pre-launch voice)
HERO:              { eyebrow: string; h1: string; lead: string; status: string;
                     lastUpdatedIso: string; version: string }
TLDR:              { bullets: string[] }                                                // 5 items
SECTIONS:          { id: "what-it-is"|"rubric"|"recommend"|"advisory"|"bias"|"rights"|"escalation";
                     title: string; body: MDXContent }[]
INPUTS:            { sees: string[]; neverSees: string[] }
RUBRIC_EXAMPLE:    { competency: string; score: number;                                  // 0–100
                     utterance: string; anchor: string; rationale: string }
RECOMMEND_LOGIC:   { rules: { if: string; then: "recommend"|"borderline"|"not_recommend" }[] }
BIAS:              { methodology: string; cadence: string; publishes: string[];
                     status: "scheduled" | "design-aligned" }
RIGHTS:            { kind: "access"|"correction"|"appeal"|"delete";
                     title: string; body: string; href: string }[]                        // 4 items
ESCALATION:        { inProduct:  { title: string; body: string; href: string };
                     outOfProduct: { title: string; body: string; email: string; dpaHref: string } }
COMPLIANCE:        { label: string; sub: string;
                     status: "scheduled" | "design-aligned" | "target" }[]
FAQ_ITEMS:         { aud: "cand" | "comp"; q: string; a: string }[]                       // 8–10 items
FINAL_CTA:         { left:  { title: string; body: string; href: string; label: string };
                     right: { title: string; body: string; href: string; label: string } }
```

All copy in this file MUST follow the **anti-fiction rule** in [`_design-language.md`](../_design-language.md):

- No fabricated customer names, logos, testimonials, outcomes, percentages, or ratings.
- No claimed certifications we haven't earned (use "design-aligned", "on the roadmap", "scheduled
  pre-launch", "target").
- No claimed bias-audit results — `BIAS.status` MUST be `"scheduled"` or `"design-aligned"` until
  an actual audit PDF exists.
- The `RUBRIC_EXAMPLE` MUST use a generic candidate (e.g. "Sample candidate", "Sample utterance").

## Data required

- **None.** No collection read or written by this page. No derived/aggregated values, no indexes,
  no caches, no event topics.

## Errors & edge cases

- No fetch → no `NOT_FOUND` / `UNAUTHENTICATED` / `UNAVAILABLE` paths.
- Fully public, token-free, crawlable; SSR-renders immediately.
- Broken anchor — silently no-ops; the browser scrolls to top.
- DPO mailto on a device without a configured mail client — browser handles natively.

## Cross-references

- Sibling public pages: [`../trust-architecture/backend_trust-architecture.md`](../trust-architecture/backend_trust-architecture.md),
  [`../what-aptura-doesnt-do/backend_what-aptura-doesnt-do.md`](../what-aptura-doesnt-do/backend_what-aptura-doesnt-do.md),
  [`../sample-report/backend_sample-report.md`](../sample-report/backend_sample-report.md),
  [`../accessibility-statement/backend_accessibility-statement.md`](../accessibility-statement/backend_accessibility-statement.md).
- Live adjacent contracts (cross-linked, not consumed): re-score on `/applications/[id]/outcome`
  (next wave), DPO inbox (no contract — mailto).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
