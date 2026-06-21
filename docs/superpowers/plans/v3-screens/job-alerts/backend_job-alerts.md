# Job alerts (saved searches) — Backend contract (v3 · frozen)

> **Screen.** Signed-in candidate's saved-search "job alerts". **FE consumer:** [`frontend_job-alerts.md`](./frontend_job-alerts.md).
> **Status:** `EXISTING — reuse v2` · no proto delta, no new RPC, no new collections, no new events.
> **Real-vs-mock today:** `JobAlertsService` is the v2 contract; the FE codes against the `JobAlertsClient` seam (`makeMockJobAlertsClient()` until `pnpm gen` exposes `api.jobAlerts`, then `makeApiJobAlertsClient(api)`). The v3 work is a **complete UI rebuild** (Aperture Pro design language); the backend contract documented here is **frozen** — mark mock today, live once gen lands (swap is a one-line client change).
> **Anti-fiction reminder:** Example copy / placeholders use generic phrasing (skill names, regions) — never fabricated employer names. See [`_design-language.md`](../_design-language.md).

## Functionalities

- **Create** an alert (keyword + filters + frequency), candidate-scoped.
- **List** the caller's alerts (`created_at desc`).
- **Delete** an alert (own only; idempotent-ish — missing id → `NotFound`).
- *(NOT this screen)* the scheduled **run-alerts → notify** sweep is a separate BE pillar task; the FE never triggers a run.

## Service & RPCs (gRPC-web; `admin.job_alerts.v1.JobAlertsService`, candidate-scoped — owner from bearer token)

| Function | RPC | Auth/scope |
|---|---|---|
| Create | `api.jobAlerts.create({ keyword, filters, frequency })` → `JobAlert` | bearer, candidate; cap enforced |
| List | `api.jobAlerts.list({})` → `{ alerts: JobAlert[] }` | bearer, candidate; own only |
| Delete | `api.jobAlerts.delete({ alertId })` → `{ deleted: bool }` | bearer, candidate; own only |

> `candidate_user_id` is **NEVER** a request field — derived from `caller_identity(token)`. Running the searches + emitting notifications is a **scheduled backend sweep** (pillar task), not part of this service's request path.

## Request / Response structures (camelCase per protobuf-es on the FE)

```ts
type AlertFrequency = "daily" | "weekly";
interface AlertFilters {
  location?: string;
  remoteMode?: "remote" | "hybrid" | "onsite";
  employmentType?: string;
  experienceLevel?: string;
  skills?: string[];
}
// jobAlerts.create({ keyword: string, filters: AlertFilters, frequency: AlertFrequency }) → JobAlert
interface JobAlert {                  // FE: JobAlertDTO
  alertId: string;
  keyword: string;
  filters: AlertFilters;
  frequency: AlertFrequency;
  createdAt: string;                  // ISO
  lastRunAt: string | null;           // null → "Never run yet" (sweep-written)
}
// jobAlerts.list({})              → { alerts: JobAlert[] }   (created_at desc)
// jobAlerts.delete({ alertId })   → { deleted: boolean }
```

- **FE mock shape:** the `JobAlertsClient` seam — `list()`, `create(input)`, `remove(alertId)` — plus the pure `summarizeAlert(alert)` label helper. `makeMockJobAlertsClient()` (module-level array) today; the live adapter maps `api.jobAlerts.create/list/delete` once gen lands (the form + row components are unchanged across the swap).

## Data required

- **Read/write:** collection `job_alerts`; index `(candidate_user_id, created_at desc)` for the list; a `(frequency, last_run_at)` index the **sweep** scans. `create` persists the normalized `SearchJobsParams` + `frequency`; `last_run_at` starts unset.
- **Filters** mirror `SearchJobsParams` (marketplace-search) so an alert == a saved search.
- **Excluded from the DTO (grep-test):** `candidate_user_id`, internal cursor/dedupe state.

## Errors & edge cases

- **Auth:** missing/invalid bearer → `UNAUTHENTICATED`; non-candidate → `PERMISSION_DENIED`.
- **`frequency` ∉ {daily, weekly}** → `INVALID_ARGUMENT` (boundary validation — untrusted input).
- **Per-candidate cap** (e.g., 20 active alerts) exceeded → `FAILED_PRECONDITION`.
- **Delete of another candidate's alert / missing id** → `NOT_FOUND` (never reveal cross-tenant existence).
- **Empty list** → FE empty state (`.cell.anchor` "No alerts yet"). Transport error → FE `.cell.anchor` error branch + retry.

## Cross-references

- Restates: v2 `../v2-screens/job-alerts.md`.
- Filters mirror [`../marketplace-search/backend_marketplace-search.md`](../marketplace-search/backend_marketplace-search.md) `SearchJobsParams`; the run-alerts sweep feeds the notifications pillar — see [`../notifications/backend_notifications.md`](../notifications/backend_notifications.md) (out of scope for this screen).
- Design language: [`../_design-language.md`](../_design-language.md). Reference demo: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
