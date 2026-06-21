# Terms of Service — Backend contract (v3 · frozen)

> **Screen.** Terms of Service / public legal long-form. **FE consumer:** [`frontend_terms-of-service.md`](./frontend_terms-of-service.md).
> **Status:** `NONE — no backend` · no new RPC, no new collections, no new events.
> **Truthfulness note:** Aptura is pre-launch. This document does not state any SLA / warranty /
> liability claim — those words belong only inside the legal markdown source once legal ratifies
> them. See the anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities

- **None server-side for this page.** The page is rendered from a static markdown source file
  (`frontend/apps/candidate/content/legal/terms-of-service.md`) at build time. There is no fetch,
  no query key, no mutation.
- **No telemetry events** unless / until the wider product analytics seam is added at the layout
  level (and even then this page emits nothing screen-specific).
- **No "I accept" affordance.** Terms acceptance happens elsewhere — at register-candidate /
  register-company and at company-pilot onboarding. If that consent flow is ever added inline on
  this page, it lives behind a new `legal.RecordConsent` RPC owned by the auth / onboarding
  screens — explicitly **out of scope** here.

## Service & RPCs

- **No gRPC, no new REST, no proto delta.**
- The only contract this screen depends on is the FE build pipeline reading
  `content/legal/terms-of-service.md` from disk during SSR.

## Request / Response structures

There is no data contract for this screen. The only typed shape is the FE frontmatter model the
markdown source conforms to — it reuses the `LegalDoc` type defined in
[`../privacy-policy/backend_privacy-policy.md`](../privacy-policy/backend_privacy-policy.md):

```ts
// frontend/apps/candidate/content/legal/types.ts (FE static model — shared)
type LegalDoc = {
  title: string;                                   // "Terms of Service"
  slug: "terms-of-service";
  version: string;                                 // e.g. "v1.0"
  lastUpdated: string;                             // ISO date
  effective: string;                               // ISO date
  sections: { id: string; label: string }[];      // 10 fixed sections — see FE plan
  changelog?: { date: string; note: string }[];   // optional, empty by default
};
```

All body copy inside the markdown source MUST follow the **anti-fiction rule** in
[`_design-language.md`](../_design-language.md):

- No fabricated SLA percentages or warranty claims.
- No invented "service availability" numbers.
- No claimed certifications or audited standards until legal supplies ratified language.
- Placeholder copy is the literal string `[LEGAL: insert ratified text here]` — engineering ships
  the page with that placeholder; legal replaces it.

## Data required

- **None.** No collection read or written. No derived/aggregated values, no indexes, no caches.

## Errors & edge cases

- No fetch → no `NOT_FOUND` / `UNAVAILABLE` paths.
- Fully public, token-free, crawlable; SSR-renders immediately.
- If the markdown source is missing at build time, the build fails (catch at CI, not at runtime).

## Cross-references

- Frontend plan: [`frontend_terms-of-service.md`](./frontend_terms-of-service.md).
- Design language: [`_design-language.md`](../_design-language.md).
- Sister legal docs: [`../privacy-policy/backend_privacy-policy.md`](../privacy-policy/backend_privacy-policy.md) ·
  [`../dpa/backend_dpa.md`](../dpa/backend_dpa.md).
- Footer chrome demo: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
