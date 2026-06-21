# Landing — Backend contract (v3 · frozen)

> **Screen.** Landing / public marketing front door. **FE consumer:** [`frontend_landing.md`](./frontend_landing.md).
> **Status:** `EXISTING — reuse v2` · no new backend, no new collections, no new events.
> **Truthfulness note:** Aptura is pre-launch. This contract documents only what the UI consumes today;
> claims of integrations, customer outcomes, or unearned certifications belong nowhere — see the
> anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities

- **None server-side for this page.** The landing renders entirely from static content (`content.ts`)
  and an SVG sprite. There is no fetch and no query key.
- **Final-CTA candidate button** — composes `?q=&location=` (empty by default) and `router.push("/jobs")`.
  The marketplace screen owns the live `discovery.searchJobs` / `GET /public/jobs` fetch — see
  [`../marketplace-search/backend_marketplace-search.md`](../marketplace-search/backend_marketplace-search.md).
- **Demo CTAs** (`Book a demo`, `Request a pilot`, `Join the waitlist`) — `mailto:` or external link
  constants only. No backend involved.
- **Deferred / out of scope.** Optionally hydrate the architecture stats from real product metrics
  later (e.g., total proctored interviews to date once we have any). Reuses existing `Analytics`
  KPIs; adds NO new RPC. Until then, the stats are **architectural truths**, not customer outcomes.

## Service & RPCs

- **No gRPC, no new REST, no proto delta.** Per v2 source: "No new backend, no new collections, no
  new events."
- The only downstream contract referenced from this page is the marketplace one
  (`discovery.searchJobs` / `GET /public/jobs`) — defined on the next page.

## Request / Response structures

There is no data contract for this screen. The only typed shapes are the static FE content models
the sections render off — these are FE constants, not a proto mirror.

```ts
// content.ts (FE static models — pre-launch voice)
HERO:               { status; h1; sub; cta_primary; cta_secondary; trust_row: string[] }
STATS:              { value: string; label: string }[]   // ["1","40+","0","100%"]
FLIP_RESUME:        { head; rows: { y: string; html: string; strike?: boolean }[] }
FLIP_REPORT_SAMPLE: { name: "Sample candidate"; role; score; recommendation; bars: { name; pct }[]; integrity: string }
ACTS:               { step; n; title; copy; bullets: string[]; visual: "identity"|"room"|"timeline"|"rubric"|"decision" }[]   // length 5
BENTO_CELLS:        { kind: "anchor"|"c1"|"c2"|"c3"|"c4"|"c5"|"c6"; tag; title; body; extra? }[]
TIMELINE_EVENTS:    { sev: "low"|"med"|"high"; at: string; title; body; clip?: string; expanded?: boolean }[]
DEFENSE_BLOCKS:     { html: string }[]
DEFENSE_PRIVACY:    { html: string }[]
EVIDENCE_SAMPLE:    { name: "Sample candidate"; role; recommendation; competencies: { name; score; quote; stamp }[] }
ADVISORY:           { ai: { title; body; bullets[] }; human: { title; body; bullets[] } }
COMPARE_ROWS:       { capability; resume; takehome; aptura }[]
WHAT_YOU_GET:       { tag; icon: "shield-check"|"timer"|"report"|"user"; title; body }[]
TRUST:              { intro; cols: { eyebrow; title; body }[]; badges: { label; sub }[] }
VERTICALS:          { icon; title; sub }[]
EARLY_ACCESS:       { companies: { title; body; cta }; candidates: { title; body; cta } }
FAQ_ITEMS:          { aud: "cand"|"comp"; q; a }[]   // length 16
FOOTER_COLS:        { brand: { tagline; badges: string[] }; cols: { title; links: { label; href }[] }[] }
```

All copy in this file MUST follow the **anti-fiction rule** in [`_design-language.md`](../_design-language.md):

- No fabricated customer names, logos, testimonials, outcomes, percentages, or ratings.
- No claimed certifications we haven't earned (use "design-aligned", "on the roadmap", "scheduled
  pre-launch", "target").
- No integrations we haven't built (Greenhouse / Lever / Workday / Ashby / SuccessFactors are called
  out as **roadmap**; today's product runs standalone with email + CSV handoff).
- Sample data uses generic names ("Sample candidate", "Candidate A").

## Data required

- **None.** No collection read or written by this page. No derived/aggregated values, no indexes.

## Errors & edge cases

- No fetch → no `NOT_FOUND` / `UNAVAILABLE` paths.
- Fully public, token-free, crawlable; SSR-renders immediately.
- Empty CTA navigation → `router.push("/jobs")` with no querystring; marketplace shows the full
  catalog.

## Cross-references

- Restates: v2 `landing.md` §A (no new backend).
- Downstream live contract: [`../marketplace-search/backend_marketplace-search.md`](../marketplace-search/backend_marketplace-search.md)
  (`/public/jobs`, `discovery.searchJobs`).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
