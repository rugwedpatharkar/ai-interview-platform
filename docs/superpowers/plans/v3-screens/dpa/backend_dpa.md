# Data Processing Agreement — Backend contract (v3 · frozen)

> **Screen.** Data Processing Agreement (DPA) / public B2B legal long-form. **FE consumer:** [`frontend_dpa.md`](./frontend_dpa.md).
> **Status:** `NONE — no backend` · no new RPC, no new collections, no new events.
> **Truthfulness note:** Aptura is pre-launch. This document does not state any
> controller/processor relationship, transfer-mechanism (SCC / IDTA), or subprocessor — those
> words belong only inside the legal markdown source once legal ratifies them. See the
> anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities

- **None server-side for this page.** The page is rendered from a static markdown source file
  (`frontend/apps/candidate/content/legal/dpa.md`) at build time. There is no fetch, no query
  key, no mutation.
- **No telemetry events** unless / until the wider product analytics seam is added at the layout
  level (and even then this page emits nothing screen-specific).
- **No "I accept" affordance.** DPA execution between Aptura and a company customer happens
  out-of-band (signed addendum or click-through during pilot onboarding). If a click-through
  consent flow is ever added inline on this page, it lives behind a new `legal.RecordDpaSignature`
  RPC owned by the pilot-onboarding screens — explicitly **out of scope** here.
- **Subprocessors list.** Linked from this page to `/subprocessors` when that route ships. Today
  the inline list (legal-owned, sourced from the markdown) is authoritative.

## Service & RPCs

- **No gRPC, no new REST, no proto delta.**
- The only contract this screen depends on is the FE build pipeline reading
  `content/legal/dpa.md` from disk during SSR.

## Request / Response structures

There is no data contract for this screen. The only typed shape is the FE frontmatter model the
markdown source conforms to — it reuses the shared `LegalDoc` type defined in
[`../privacy-policy/backend_privacy-policy.md`](../privacy-policy/backend_privacy-policy.md),
extended with an optional `audience` field:

```ts
// frontend/apps/candidate/content/legal/types.ts (FE static model — shared, extended)
type LegalDoc = {
  title: string;                                   // "Data Processing Agreement"
  slug: "dpa";
  version: string;                                 // e.g. "v1.0"
  lastUpdated: string;                             // ISO date
  effective: string;                               // ISO date
  sections: { id: string; label: string }[];      // 10 fixed sections — see FE plan
  changelog?: { date: string; note: string }[];   // optional, empty by default
  audience?: "b2b";                                // DPA-specific — drives the header pill
};
```

All body copy inside the markdown source MUST follow the **anti-fiction rule** in
[`_design-language.md`](../_design-language.md):

- No fabricated controller/processor relationships.
- No invented international-transfer mechanisms (SCC / IDTA / Adequacy / etc.) until legal
  supplies ratified language.
- No invented subprocessor list — engineering does not name vendors in the DPA. Legal does.
- No claimed certifications (SOC 2, ISO 27001) until legal supplies ratified language.
- Placeholder copy is the literal string `[LEGAL: insert ratified text here]` — engineering ships
  the page with that placeholder; legal replaces it.

## Data required

- **None.** No collection read or written. No derived/aggregated values, no indexes, no caches.

## Errors & edge cases

- No fetch → no `NOT_FOUND` / `UNAVAILABLE` paths.
- Fully public, token-free, crawlable; SSR-renders immediately.
- If the markdown source is missing at build time, the build fails (catch at CI, not at runtime).
- The "View live subprocessors" link is disabled (`aria-disabled="true"`) until `/subprocessors`
  ships — handled purely in the FE.

## Cross-references

- Frontend plan: [`frontend_dpa.md`](./frontend_dpa.md).
- Design language: [`_design-language.md`](../_design-language.md).
- Sister legal docs: [`../privacy-policy/backend_privacy-policy.md`](../privacy-policy/backend_privacy-policy.md) ·
  [`../terms-of-service/backend_terms-of-service.md`](../terms-of-service/backend_terms-of-service.md).
- Linked from: [`../request-pilot/`](../request-pilot/) (B2B pilot intake — "Review our DPA").
- Footer chrome demo: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
