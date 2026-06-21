# Accessibility Statement — Backend contract (v3 · frozen)

> **Screen.** Public accessibility statement. **FE consumer:** [`frontend_accessibility-statement.md`](./frontend_accessibility-statement.md).
> **Status:** `NEW — static page · no backend, no collections, no events.`
> **Truthfulness note:** Aptura is pre-launch. This contract documents only what the UI consumes today;
> claims of integrations, customer outcomes, or unearned certifications belong nowhere — see the
> anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities

- **None server-side for this page.** The accessibility statement page renders entirely from
  static content (`content.ts`) and the shared SVG sprite. There is no fetch and no query key.
- **In-page anchor scrolls** to per-section ids; pure client-side.
- **Outbound links:** `/ai-explainability`, `/trust`, the proctored-interview-related screens
  (cross-linked from the interview-accommodations cards), and the in-product
  `/settings/accessibility` route (Tier 2 — placeholder OK until that plan ships).
- **Mailto:** `mailto:a11y@aptura.ai` (always visible) and the DPO mailto for escalation.
- **Final-CTA buttons** — `next/link` and `mailto:` cross-links; no fetch.
- **Deferred / out of scope.**
  - When an external a11y audit is completed, link the published artefact (PDF or VPAT) — static
    asset; still no RPC.
  - Optionally accept "Report an a11y issue" submissions via a form — that would be a
    `forms.submitA11yIssue` mirroring `forms.submitPilot` / `forms.submitWaitlist`. NOT in scope
    today; the mailto fallback covers it.

## Service & RPCs

- **No gRPC, no new REST, no proto delta.** This screen does not introduce any contract.
- The only adjacent contracts referenced from this page are:
  - The proctored-interview screens (cross-linked, not consumed) — the accommodations cards
    describe behaviour those screens implement.
  - The AI explainability statement — see
    [`../ai-explainability/backend_ai-explainability.md`](../ai-explainability/backend_ai-explainability.md).
  - The trust-architecture page — see
    [`../trust-architecture/backend_trust-architecture.md`](../trust-architecture/backend_trust-architecture.md).

## Request / Response structures

There is no data contract for this screen. The only typed shapes are the static FE content models
the sections render off — these are FE constants, not a proto mirror.

```ts
// content.ts (FE static models — pre-launch voice)
HERO:               { eyebrow: string; h1: string; lead: string; status: string;
                      lastReviewedIso: string; version: string; target: "WCAG 2.2 AA" }
COMMITMENT:         { html: string }
TARGET_BADGES:      { label: string; sub: string;
                      status: "target" | "design-aligned" | "implemented" }[]              // 4 badges
WORKS:              { implemented: string[]; tooling: string[] }
GAPS:               { wcagId: string;                                                       // e.g. "1.4.13"
                      plain: string;
                      targetFixDateIso: string;
                      workaround: string }[]
INTERVIEW_A11Y:     { kind: "captions" | "screen_reader" | "extended_time" | "alt_input";
                      title: string; available: string; enable: string;
                      integrityNote: string;                                                // how integrity model adapts
                      href: string }[]                                                       // 4 cards
WCAG_CHECKLIST:     { principle: "perceivable" | "operable" | "understandable" | "robust";
                      items: { id: string;                                                  // e.g. "1.4.3 Contrast (Minimum)"
                               title: string;
                               status: "pass" | "partial" | "fail";
                               note: string }[] }[]                                          // 4 groups
REQUEST:            { inProduct: { title: string; body: string; href: string };
                      outOfProduct: { title: string; body: string;
                                      email: string; dpoEmail: string } }
REVIEW_CADENCE:     { cadence: string;                                                       // "Reviewed quarterly"
                      nextReview: string;                                                    // "YYYY-QQ"
                      lastReviewedIso: string }
FINAL_CTA:          { left:  { title: string; body: string; href: string; label: string };
                      right: { title: string; body: string; href: string; label: string } }
```

All copy in this file MUST follow the **anti-fiction rule** in [`_design-language.md`](../_design-language.md):

- **No claimed WCAG conformance certificate we don't have.** `TARGET_BADGES[].status` MUST be
  `"target"` (or `"design-aligned"` / `"implemented"`) — never `"certified"`.
- **No fake audit byline.** If the page later cites an external audit, it MUST link to the
  artefact.
- **The `GAPS` section MUST NOT be empty pre-launch.** Declaring zero gaps would itself be a
  falsity. Every product has open a11y issues; this page is where we show them honestly.
- **The `WCAG_CHECKLIST` MUST honestly report status per criterion.** No greenwashing.
- **The `REVIEW_CADENCE.lastReviewedIso` MUST be the real date the statement was last reviewed**
  by a human (today at first commit; updated per review).

## Data required

- **None.** No collection read or written by this page. No derived/aggregated values, no indexes,
  no caches, no event topics.

## Errors & edge cases

- No fetch → no `NOT_FOUND` / `UNAUTHENTICATED` / `UNAVAILABLE` paths.
- Fully public, token-free, crawlable; SSR-renders immediately.
- Broken anchor — silently no-ops; the browser scrolls to top.
- a11y@aptura.ai mailto on a device without a configured mail client — browser handles natively.
- `/settings/accessibility` placeholder route — until that Tier 2 plan ships, the FE links to a
  graceful "Coming soon" stub or to the broader `/settings` route. Acceptance criterion in the
  FE plan keeps this honest.

## Cross-references

- Cross-linked authenticated screens: the proctored-interview plan (`proctored-interview`,
  `interview-lobby`, `interview-completed`) — the accommodations cards describe behaviour those
  screens implement.
- Sibling public pages: [`../trust-architecture/backend_trust-architecture.md`](../trust-architecture/backend_trust-architecture.md),
  [`../ai-explainability/backend_ai-explainability.md`](../ai-explainability/backend_ai-explainability.md),
  [`../what-aptura-doesnt-do/backend_what-aptura-doesnt-do.md`](../what-aptura-doesnt-do/backend_what-aptura-doesnt-do.md),
  [`../sample-report/backend_sample-report.md`](../sample-report/backend_sample-report.md).
- In-product future: `/settings/accessibility` — Tier 2 plan (next wave).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
