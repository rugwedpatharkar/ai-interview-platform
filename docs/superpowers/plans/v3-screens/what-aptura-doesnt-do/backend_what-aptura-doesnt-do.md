# What Aptura Doesn't Do — Backend contract (v3 · frozen)

> **Screen.** Public constraints-as-features / privacy-inversion page. **FE consumer:** [`frontend_what-aptura-doesnt-do.md`](./frontend_what-aptura-doesnt-do.md).
> **Status:** `NEW — static page · no backend, no collections, no events.`
> **Truthfulness note:** Aptura is pre-launch. This contract documents only what the UI consumes today;
> claims of integrations, customer outcomes, or unearned certifications belong nowhere — see the
> anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities

- **None server-side for this page.** The refusals page renders entirely from static content
  (`content.ts`) and the shared SVG sprite. There is no fetch and no query key.
- **In-page anchor scrolls** (`#cat-surveillance`, `#cat-screening`, `#cat-judgement`) — pure
  client-side; no router.push.
- **Outbound cross-links:** `/trust` (with layer anchors `#layer-identity`, `#layer-environment`,
  `#layer-behaviour`, `#layer-timeline`, `#layer-advisory`), `/ai-explainability`,
  `/sample-report` — static `next/link` href constants.
- **Final-CTA buttons** — `next/link` cross-links; no fetch.
- **Deferred / out of scope.**
  - Optionally publish a versioned changelog if the refusal list changes — would become a static
    section appended below, still no RPC.
  - Optionally accept "Tell us a thing Aptura should refuse to do" suggestions — that would be a
    `forms.submitRefusalSuggestion` (mirroring `forms.submitPilot` / `forms.submitWaitlist`).
    NOT in scope today.

## Service & RPCs

- **No gRPC, no new REST, no proto delta.** This screen does not introduce any contract.
- The only adjacent contracts referenced from this page are:
  - The trust-architecture layers — see
    [`../trust-architecture/backend_trust-architecture.md`](../trust-architecture/backend_trust-architecture.md).
  - The AI explainability statement — see
    [`../ai-explainability/backend_ai-explainability.md`](../ai-explainability/backend_ai-explainability.md).

## Request / Response structures

There is no data contract for this screen. The only typed shapes are the static FE content models
the sections render off — these are FE constants, not a proto mirror.

```ts
// content.ts (FE static models — pre-launch voice)
HERO:              { eyebrow: string; h1: string; lead: string;
                     status: "Refusal posture · pre-launch" }
WHY:               { title: string; html: string }
CATEGORIES:        { id: "surveillance" | "screening" | "judgement";
                     title: string; lede: string }[]                                      // 3
REFUSALS:          { category: "surveillance" | "screening" | "judgement";
                     title: string;
                     explanation: string;
                     instead: { html: string;
                                href?: string;                                            // typically /trust#layer-*
                                layer?: 1 | 2 | 3 | 4 | 5 } }[]
MECHANISMS:        { refusal: string; mechanism: string; layerHref: string }[]
DO_DO:             { html: string }[]                                                     // counterweight bullets
COMPARE:           { capability: string;
                     vendor: string;                                                       // "typical proctoring vendor"
                     aptura: string }[]                                                    // 6–8 rows
FAQ_ITEMS:         { aud: "cand" | "comp"; q: string; a: string }[]                       // 6–8 items
FINAL_CTA:         { left:  { title: string; body: string; href: string; label: string };
                     right: { title: string; body: string; href: string; label: string } }
```

All copy in this file MUST follow the **anti-fiction rule** in [`_design-language.md`](../_design-language.md):

- No fabricated customer names, logos, testimonials, outcomes, percentages, or ratings.
- **No named competitor brands** in the `COMPARE` rows — `COMPARE[].vendor` MUST be the generic
  "typical proctoring vendor". Naming specific vendors invites legal risk and undermines the
  page's principled framing.
- Every `REFUSALS[].instead.href` MUST resolve to a real `/trust#layer-*` anchor (no dead links).
- No claimed certifications we haven't earned.

## Data required

- **None.** No collection read or written by this page. No derived/aggregated values, no indexes,
  no caches, no event topics.

## Errors & edge cases

- No fetch → no `NOT_FOUND` / `UNAUTHENTICATED` / `UNAVAILABLE` paths.
- Fully public, token-free, crawlable; SSR-renders immediately.
- Broken in-page anchor — silently no-ops; the browser scrolls to top.
- Broken `/trust#layer-*` cross-link — covered by the global `/_not-found` page; the FE plan's
  acceptance criterion requires all such links resolve before merge.

## Cross-references

- Sibling public pages: [`../trust-architecture/backend_trust-architecture.md`](../trust-architecture/backend_trust-architecture.md),
  [`../ai-explainability/backend_ai-explainability.md`](../ai-explainability/backend_ai-explainability.md),
  [`../sample-report/backend_sample-report.md`](../sample-report/backend_sample-report.md),
  [`../accessibility-statement/backend_accessibility-statement.md`](../accessibility-statement/backend_accessibility-statement.md).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
