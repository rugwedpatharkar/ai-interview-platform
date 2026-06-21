# Aptura vs. Take-Home — Backend contract (v3 · frozen)

> **Screen.** Public long-form comparison page. **FE consumer:** [`frontend_aptura-vs-take-home.md`](./frontend_aptura-vs-take-home.md).
> **Status:** `NEW — static page · no backend, no collections, no events.`
> **Truthfulness note:** Aptura is pre-launch. This contract documents only what the UI consumes today;
> claims of integrations, customer outcomes, or unearned certifications belong nowhere — see the
> anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities

- **None server-side for this page.** The compare page renders entirely from static content
  (`content.ts`) and the shared SVG sprite. There is no fetch and no query key.
- **In-page anchor scrolls** — pure client-side; no router.push.
- **Outbound cross-links:** `/trust`, `/ai-explainability`, `/sample-report`, `/pilot`,
  `/waitlist` — static `next/link` href constants.
- **Final-CTA buttons** — `next/link` cross-links; no fetch.
- **Deferred / out of scope.**
  - When we have published external research or a customer case study, link it from the
    appropriate row's `evidenceHref` — static asset; still no RPC.
  - Optionally render a CSV-export of the comparison rows for procurement teams — would be a
    static file served from `public/compare-take-home.csv`; still no RPC.

## Service & RPCs

- **No gRPC, no new REST, no proto delta.** This screen does not introduce any contract.
- The only adjacent contracts referenced from this page are:
  - The sample-report viewer — see
    [`../sample-report/backend_sample-report.md`](../sample-report/backend_sample-report.md).
  - The pilot / waitlist forms — see
    [`../request-pilot/backend_request-pilot.md`](../request-pilot/backend_request-pilot.md)
    and [`../waitlist/backend_waitlist.md`](../waitlist/backend_waitlist.md).

## Request / Response structures

There is no data contract for this screen. The only typed shapes are the static FE content models
the sections render off — these are FE constants, not a proto mirror.

```ts
// content.ts (FE static models — pre-launch voice)
HERO:        { eyebrow: string; h1: string; lead: string; status: string }
GLANCE_ROWS: { capability: string;
               resume:   "yes" | "no" | "mid" | string;
               takeHome: "yes" | "no" | "mid" | string;
               aptura:   "yes" | "no" | "mid" | string }[]                              // ≥8 rows
NARRATIVE:   { capability: string;
               takeHome: { title: string; body: string; bullets: string[]; cite?: string };
               aptura:   { title: string; body: string; bullets: string[]; cite?: string };
               evidenceHref?: string }[]                                                 // mirrors GLANCE_ROWS
RIGHT:       { title: string; html: string }                                              // teal-soft anchor
WRONG:       { title: string; html: string }                                              // coral-soft anchor
EXAMPLE:     { lead: string;
               acts: { n: 1|2|3; title: string;
                       takeHome: string; aptura: string }[] }                            // 3 acts
FAQ:         { aud: "cand" | "comp"; q: string; a: string }[]                            // 6–8
FINAL_CTA:   { left:  { title: string; body: string; href: string; label: string };
               right: { title: string; body: string; href: string; label: string } }
```

All copy in this file MUST follow the **anti-fiction rule** in [`_design-language.md`](../_design-language.md):

- **No fabricated stats** in any row. If a row needs an external claim ("Take-home drop-off rates
  rise to 40% after 3 days"), it MUST cite a real source via `cite` and the link MUST resolve.
  Otherwise, drop the claim.
- **No named vendor brands** in the narrative (no "unlike HackerRank…"). The page argues against
  a *category* (take-home assessments), not against specific vendors.
- The worked example MUST use `"Sample candidate"` / generic role per anti-fiction.
- The `RIGHT` block MUST list genuine cases when a take-home IS the right answer — strawmanning
  is anti-fiction by another name.

## Data required

- **None.** No collection read or written by this page. No derived/aggregated values, no indexes,
  no caches, no event topics.

## Errors & edge cases

- No fetch → no `NOT_FOUND` / `UNAUTHENTICATED` / `UNAVAILABLE` paths.
- Fully public, token-free, crawlable; SSR-renders immediately.
- Broken `cite` href — covered by the global `/_not-found` page; the FE plan's acceptance
  criterion requires citations resolve before merge.
- Old `#compare` deep-links from the landing footer — Task 7 of the FE plan updates the footer
  link; the landing's `#compare` anchor remains valid for direct deep-links into the landing.

## Cross-references

- Landing's `#compare` row — see [`../landing/frontend_landing.md`](../landing/frontend_landing.md)
  (section #11). The `<CompareTable />` primitive is imported from there.
- Sibling public pages: [`../trust-architecture/backend_trust-architecture.md`](../trust-architecture/backend_trust-architecture.md),
  [`../ai-explainability/backend_ai-explainability.md`](../ai-explainability/backend_ai-explainability.md),
  [`../what-aptura-doesnt-do/backend_what-aptura-doesnt-do.md`](../what-aptura-doesnt-do/backend_what-aptura-doesnt-do.md),
  [`../sample-report/backend_sample-report.md`](../sample-report/backend_sample-report.md),
  [`../accessibility-statement/backend_accessibility-statement.md`](../accessibility-statement/backend_accessibility-statement.md).
- Downstream CTAs: [`../request-pilot/backend_request-pilot.md`](../request-pilot/backend_request-pilot.md),
  [`../waitlist/backend_waitlist.md`](../waitlist/backend_waitlist.md).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
