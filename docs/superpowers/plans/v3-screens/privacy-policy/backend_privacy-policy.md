# Privacy Policy — Backend contract (v3 · frozen)

> **Screen.** Privacy Policy / public legal long-form. **FE consumer:** [`frontend_privacy-policy.md`](./frontend_privacy-policy.md).
> **Status:** `NONE — no backend` · no new RPC, no new collections, no new events.
> **Truthfulness note:** Aptura is pre-launch. This document does not state any compliance claim
> (GDPR / CCPA / SOC 2 / ISO) — those words belong only inside the legal markdown source once legal
> ratifies them. See the anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities

- **None server-side for this page.** The page is rendered from a static markdown source file
  (`frontend/apps/candidate/content/legal/privacy-policy.md`) at build time. There is no fetch,
  no query key, no mutation.
- **No telemetry events** unless / until the wider product analytics seam is added at the layout
  level (and even then this page emits nothing screen-specific).
- **No subscribe form.** The "Subscribe to changes" affordance is a `mailto:` link, not an
  endpoint. If a real subscription mechanism is ever added, it lives behind a new
  `notifications.SubscribeToLegalChanges` RPC — explicitly **out of scope** for this screen.

## Service & RPCs

- **No gRPC, no new REST, no proto delta.**
- The only contract this screen depends on is the FE build pipeline reading
  `content/legal/privacy-policy.md` from disk during SSR.

## Request / Response structures

There is no data contract for this screen. The only typed shape is the FE frontmatter model the
markdown source conforms to:

```ts
// frontend/apps/candidate/content/legal/types.ts (FE static model)
type LegalDoc = {
  title: string;                                   // "Privacy Policy"
  slug: "privacy-policy";
  version: string;                                 // e.g. "v1.0"
  lastUpdated: string;                             // ISO date
  effective: string;                               // ISO date
  sections: { id: string; label: string }[];      // 8 fixed sections — see FE plan
  changelog?: { date: string; note: string }[];   // optional, empty by default
};
```

All body copy inside the markdown source MUST follow the **anti-fiction rule** in
[`_design-language.md`](../_design-language.md):

- No claimed certifications we haven't earned (SOC 2, ISO 27001, AEDT-144 audited, Holistic AI).
- No fabricated regulatory framings ("compliant with…", "certified under…") until legal supplies
  ratified language.
- Placeholder copy is the literal string `[LEGAL: insert ratified text here]` — engineering ships
  the page with that placeholder; legal replaces it.

## Data required

- **None.** No collection read or written. No derived/aggregated values, no indexes, no caches.
  The markdown source is the only "data", and it lives in the FE app's repo, not in a database.

## Errors & edge cases

- No fetch → no `NOT_FOUND` / `UNAVAILABLE` paths.
- Fully public, token-free, crawlable; SSR-renders immediately.
- If the markdown source is missing at build time, the build fails (catch at CI, not at runtime).
- If a section in the frontmatter has no matching heading in the markdown body, the build emits a
  warning (handled in the FE markdown pipeline, not in the backend).

## Cross-references

- Frontend plan: [`frontend_privacy-policy.md`](./frontend_privacy-policy.md).
- Design language: [`_design-language.md`](../_design-language.md).
- Sister legal docs: [`../terms-of-service/backend_terms-of-service.md`](../terms-of-service/backend_terms-of-service.md) ·
  [`../dpa/backend_dpa.md`](../dpa/backend_dpa.md).
- Footer chrome demo: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
