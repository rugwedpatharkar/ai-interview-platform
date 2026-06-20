# Backend — Landing / marketing (`/` signed-out) · contract

> **Screen.** Landing / marketing front door. **FE consumer:** `frontend_landing.md`.
> **Status.** `EXISTING — reuse v2` (no new backend). Source: `../../v2-screens/landing.md`.
> **Real-vs-mock today.** Nothing fetched on this page. The hero search **navigates** to `/jobs`, which owns the
> live read (`discovery.searchJobs` gRPC + public `GET /public/jobs`) — see `../marketplace-search/backend_marketplace-search.md`.
> The stat strip uses **static demo constants**.

## Functionalities

- **None server-side for this page.** The landing renders entirely from static content (`content.ts`).
- **Hero search** — compose `?q=&location=` and `router.push("/jobs")`; the marketplace screen performs the fetch.
- **(Deferred, out of scope)** Optionally hydrate the outcome-rate + avg-response-time stat tiles from existing
  `Analytics` KPIs server-side. Adds **no new RPC** (reuses `api.analytics.*`). Ship static first.

## Service & RPCs

- **No gRPC, no new REST, no proto delta.** Per `../../v2-screens/landing.md` §A: "No new backend, no new
  collections, no new events."
- The only downstream contract is the **marketplace** one the hero links into (next page).

## Request / Response structures

There is **no data contract** for this screen. The only typed shapes are the static content models the sections
render off (in `content.ts`) — these are FE constants, not a proto mirror:

```ts
// content.ts (FE static models — unchanged by the redesign)
HERO: { eyebrow; h1; subhead; micro: string[] }
STATS: { value: string; label: string }[]            // ["100%","12,400+","1","3-day"]
DIFFERENTIATORS: { key: "answered"|"cheatproof"|"merit"; icon; title; body }[]
STEPS, MERIT_FLOW, FEATURES, VALUE_PILLS, TESTIMONIALS
COMPANY_HIRE_HREF: string                             // env NEXT_PUBLIC_COMPANY_URL
FOOTER_TAGLINE: string                               // "Proctored. No ghosting. On merit."
```

Hero → marketplace handoff (the only outbound contract): `GET /public/jobs?q=<title>&location=<loc>` — defined in
`../marketplace-search/backend_marketplace-search.md`.

## Data required

- **None.** No collection read or written by this page. No derived/aggregated values, no indexes.

## Errors & edge cases

- No fetch → no `NOT_FOUND`/`UNAVAILABLE` paths. Fully public, token-free, crawlable.
- Empty hero inputs → `router.push("/jobs")` with no querystring (marketplace shows the full catalog).

## Cross-references

- Restates: `../../v2-screens/landing.md` §A (no new backend).
- Downstream live contract: `../marketplace-search/backend_marketplace-search.md` (`/public/jobs`,
  `discovery.searchJobs`).
- No shared event/enum consumed.
