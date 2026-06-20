# Backend — `analytics` (Midnight v3)

> **Screen:** Hiring analytics · **FE consumer:** [`frontend_analytics.md`](./frontend_analytics.md)
> **Status:** **EXISTING — reuse `admin.analytics.v1.AnalyticsService.GetFunnelAnalytics`.** Restated from [`../../v2-screens/recruiter-dashboard.md`](../../v2-screens/recruiter-dashboard.md) §A (the Analytics funnel KPIs section). **No proto delta, no new collection, no new endpoint** — the Midnight redesign is appearance-only; this page consumes the same `GetFunnelAnalytics` it ships today.
> **Real-vs-mock today:** **live.** `GetFunnelAnalytics` is built, generated, and consumed on `/company/analytics` and the recruiter dashboard. There is **no mock seam** for the funnel. (The dashboard's separate `GetNoGhostingKpis` strip is **not** on this page.)

## Functionalities
- **Get hiring-funnel analytics** for the company: total applications, conversion-to-hire rate, and a per-stage breakdown (count per `ApplicationState`) across all the company's jobs.
- Render the funnel as **`.bar` meters** + two **KPI cards** (total, conversion) — all derived from the single `FunnelAnalytics` response (no second RPC on this page).

## Service & RPCs (`admin.analytics.v1` `AnalyticsService`, gRPC-web — manager + comp-scoped, read-only)
| Function | RPC | Auth/scope |
|---|---|---|
| Funnel + headline KPIs | `GetFunnelAnalytics(FunnelAnalyticsRequest) → FunnelAnalytics` | manager (`company_admin`/`recruiter`); `comp_id` from token |

- **Auth/scope:** bearer; **manager-scoped** and **comp-scoped** — `comp_id` from the **token, never the request**. Read-only.

## Request / Response structures (camelCase per protobuf-es on the FE)
- **`FunnelAnalyticsRequest {}`** (comp_id from token) → **`FunnelAnalytics`**:
  - `total` — total applications (**bigint**; widened on the FE with `Number(...)`); also the empty-state threshold (`Number(total) === 0` → `EmptyState`).
  - `conversionRate` — `0..1` share converting to hire (FE renders `Math.round(rate * 100)%`).
  - `states[]` — `{ state: ApplicationState, count: bigint }` per stage; the FE bars use `width = count / max * 100%` and `applicationStatus(state)` for label/tone.
- **FE mock shape:** **none** — the page binds directly to the **already-generated** `api.analytics.getFunnelAnalytics`. No mock client to stand up. (`FunnelAnalytics` is already exported from `@ip/api-client`.)

## Data required
- Derives from the existing **`applications`** data (comp-scoped) — terminal/stage counts + the conversion ratio. Aggregation lives in `resources/analytics.py` (the comp-scoped funnel query already exists). No new collection; no new index strictly required for v2.

## Errors & edge cases
- Empty company (no applications) → `total = 0`, `states = []` → the FE shows the `EmptyState` ("No applications yet"). The funnel `FunnelChart` itself also guards `states.length === 0` with "No applications yet."
- `PERMISSION_DENIED` (non-manager / wrong comp) is structurally prevented — `comp_id` is from the token; the shell already gates the route to managers.
- `UNAVAILABLE`/network → surfaced as `errorMessage(err)` in the `ErrorState` + retry (existing behavior).

## Cross-references
- Restated contract: [`../../v2-screens/recruiter-dashboard.md`](../../v2-screens/recruiter-dashboard.md) §A (Analytics funnel KPIs; `GetFunnelAnalytics` reused as-is; the `GetNoGhostingKpis` extension is the **dashboard's**, not this page's).
- Shared component: the `FunnelChart` is the **same** component the recruiter dashboard renders (one chart, no divergence) — `frontend/apps/company/components/funnel-chart.tsx`.
- Shared enum: `ApplicationState` (drives `applicationStatus(state)` labels/tones).
