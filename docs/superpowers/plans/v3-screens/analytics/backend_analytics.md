# Hiring analytics — Backend contract (v3 · frozen)

> **Screen.** `/company/analytics` hiring funnel + KPI workspace. **FE consumer:** [`frontend_analytics.md`](./frontend_analytics.md).
> **Status:** **EXISTING — reuse `admin.analytics.v1.AnalyticsService`** (`GetFunnelAnalytics` +
> `GetNoGhostingKpis` + the integrity aggregates already plumbed into the recruiter dashboard's
> Integrity Headlines cell). Restated from
> [`../../v2-screens/recruiter-dashboard.md`](../../v2-screens/recruiter-dashboard.md) §A. The
> Aperture Pro v3 redesign is **appearance-only** — no proto delta, no new collection, no new
> endpoint beyond what v2 already ships.
> **Anti-fiction reminder:** Aptura is pre-launch. The page renders only what these RPCs truly
> return. Empty data shows truthful empties ("No applications yet", "All caught up", "No
> integrity events in the last <window>") — never fabricated counts, fake outcomes, or invented
> "company highlights". See the anti-fiction rule in [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today:** funnel is **live** (`Analytics.GetFunnelAnalytics` generated +
> consumed in prod by both this page and the recruiter dashboard). No-ghosting KPIs are **mock**
> (`makeMockKpis()`) until `Analytics.GetNoGhostingKpis` lands (the one v2 EXTEND). Integrity
> aggregates reuse the existing analytics queries.

## Functionalities

- **Get hiring funnel** — stage counts + total + conversion-to-hire, comp-scoped, **all-time**.
- **Get no-ghosting KPIs** — outcome rate, awaiting-outcome backlog, avg/median response time,
  total applicants — **windowed** (default 30d; clamped 7..90).
- **Read integrity aggregates** — auto-ended (HIGH), fullscreen exits (MED), second-voice flags
  (MED) — **windowed** with the same `windowDays`. Already plumbed for the recruiter dashboard's
  Integrity Headlines cell; reused here with no new RPC.

## Service & RPCs

`admin.analytics.v1.AnalyticsService` (gRPC-web). All **bearer-auth, manager-scoped**
(`company_admin` / `recruiter`); `comp_id` derived from the **token, never the request**.
Read-only.

| Function | RPC | Status | Auth / scope |
|---|---|---|---|
| Hiring funnel (all-time) | `AnalyticsService.GetFunnelAnalytics({}) → FunnelAnalytics` | EXISTING | manager + comp-scoped, read-only |
| No-ghosting KPIs (windowed) | `AnalyticsService.GetNoGhostingKpis({ windowDays }) → NoGhostingKpis` | **NEW (v2 EXTEND)** | manager + comp-scoped, read-only |
| Integrity aggregates (windowed) | reuses the analytics aggregates already plumbed for the recruiter dashboard's Integrity Headlines cell — no new RPC | EXISTING | manager + comp-scoped, read-only |

## Request / Response structures (camelCase per protobuf-es on the FE)

- **`GetFunnelAnalytics`** — req `{}` (comp from token); resp
  `FunnelAnalytics { states: { state: string /*ApplicationState*/, count: bigint }[],
                     total: bigint, conversionRate: number }`.
  - The FE widens bigints with `Number(...)`; the empty-state threshold is
    `Number(total) === 0`; the bar widths use `count / max * 100%`;
    `applicationStatus(state)` drives per-stage labels / tones.
- **`GetNoGhostingKpis`** — req `{ windowDays: number }` (default 30, clamped 7..90); resp
  `NoGhostingKpis { outcomeRate, openNoOutcome, avgResponseHours, medianResponseHours,
                     totalApplicants, windowDays }`
  (`outcomeRate` / `*Hours` doubles; `open*` / `total*` bigint; `windowDays` echoed
  post-clamp).
  - **Semantics:** `outcomeRate` = terminal (`hired|rejected|withdrawn`) / total in-window;
    `openNoOutcome` = applicants with no terminal state (the ghosting backlog → feeds the
    awaiting-outcome card + the recruiter dashboard's needs-decision queue);
    `avg/median response` = apply → first recruiter action, computed from the application audit
    / state-history.
- **Integrity aggregates** — windowed counts of HIGH auto-ends + MED fullscreen exits + MED
  second-voice flags, comp-scoped. Already plumbed; no new shape.
- **FE mock shape** (`apps/company/app/dashboard-types.ts`) — the KPI strip codes against this
  until `pnpm gen`:
  ```ts
  export interface NoGhostingKpisDTO {
    outcomeRate: number;
    openNoOutcome: number;
    avgResponseHours: number;
    medianResponseHours: number;
    totalApplicants: number;
    windowDays: number;
  }
  ```
  `makeMockKpis()` returns a `NoGhostingKpisDTO`; after `pnpm gen` swap to
  `api.analytics.getNoGhostingKpis({ windowDays })` (widen bigints with `Number(...)`).
  `FunnelAnalytics` is already generated — no mock.

## Data required

- **Mongo `applications`** (comp-scoped) — funnel stage counts (all-time) + the KPI aggregation
  (terminal-share + response-time percentiles over the window) — one aggregation in
  `resources/analytics.py` (`get_no_ghosting_kpis`). No new collection; derives from existing
  `applications` + funnel / audit data. Add a covering index only if the aggregation is hot.
- **Application audit / state-history** — apply timestamp → first recruiter transition
  (response-time metric); terminal-state detection (outcome rate, awaiting-outcome backlog).
- **Integrity events** — windowed counts of HIGH auto-ends + MED fullscreen exits + MED
  second-voice flags. Already plumbed for the recruiter dashboard's Integrity Headlines cell.

## Errors & edge cases

- **Empty company (no applications)** → `total = 0`, `states = []` → the FE renders the truthful
  funnel empty ("No applications yet") and degrades the KPI strip to "—" placeholders. The
  awaiting-outcome card shows "All caught up — no applicants awaiting a decision."
- **No integrity events in window** → the integrity-volume card shows "No integrity events in
  the last <window>." (truthful empty).
- **`PERMISSION_DENIED`** — non-manager / cross-tenant — structurally prevented (`comp_id` from
  token; shell already gates the route).
- **`UNAVAILABLE` / network** — surfaced as `errorMessage(err)` in `ErrorState` + retry per card
  (the page never fully blocks).
- **`windowDays` out of range** → clamped server-side (echoed back), never an error.
- **No chart library on the FE.** The contract returns counts only; the UI renders them as CSS
  `.bar / .bar > i` meters + `.tnum` deltas — never as line / area charts.

## Cross-references

- Restated contract: [`../../v2-screens/recruiter-dashboard.md`](../../v2-screens/recruiter-dashboard.md)
  §A (Analytics funnel KPIs; `GetFunnelAnalytics` reused as-is; the `GetNoGhostingKpis` EXTEND).
- Shared component: the funnel card is the **same** component the recruiter dashboard's
  `<ActiveFunnel />` consumes (one funnel source, no fork) —
  `apps/company/components/analytics/funnel-card.tsx`.
- Queue (the awaiting-outcome card's CTA) opens the dashboard's needs-decision cell, which fires
  the same `DecisionService.OverrideGate` / `DecideApplication` mutations documented in
  [`../recruiter-dashboard/backend_recruiter-dashboard.md`](../recruiter-dashboard/backend_recruiter-dashboard.md).
- Shared enum: `ApplicationState` (drives `applicationStatus(state)` labels / tones; terminal
  set `hired | rejected | withdrawn`).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
