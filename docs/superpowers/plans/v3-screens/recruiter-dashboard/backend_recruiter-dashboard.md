# Recruiter dashboard — Backend contract (v3 · frozen)

> **Screen.** `/company` recruiter dashboard. **FE consumer:** [`frontend_recruiter-dashboard.md`](./frontend_recruiter-dashboard.md).
> **Status:** **EXISTING — reuse v2** (one EXTEND already specified in v2). Restated from
> [`../../v2-screens/recruiter-dashboard.md`](../../v2-screens/recruiter-dashboard.md). The
> Aperture Pro v3 redesign is **appearance-only** — no proto delta, no new collection, no new
> endpoint beyond what v2 already planned.
> **Anti-fiction reminder:** Aptura is pre-launch. The dashboard renders only what these RPCs
> truly return. Empty data shows truthful empties (e.g., "All caught up", "No jobs yet") — never
> fabricated applicants, fake company logos, or invented "wins". See the anti-fiction rule in
> [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today:** funnel + recent-jobs are LIVE (`Analytics.GetFunnelAnalytics`,
> `Job.ListJobs` generated + consumed in prod). KPI strip is **mock** (`makeMockKpis()`) until
> `Analytics.GetNoGhostingKpis` lands (the one v2 EXTEND). The needs-decision queue reuses
> existing decision RPCs (live).

## Functionalities

- **Get hiring funnel** — stage counts + total + conversion, comp-scoped, windowed (default 30d).
- **Get no-ghosting KPIs** — outcome rate, awaiting-outcome backlog, avg/median response time,
  total applicants (the anti-ghosting commitment as metrics).
- **List recent jobs** — the caller's company's jobs (top 4) with status + applicant counts.
- **Decide / advance from the needs-decision queue** — Advance (`OverrideGate`) and Decline
  (`DecideApplication(rejected)`) on awaiting-outcome applicants; reuses the pipeline's RPCs
  (no new surface). Decline notifies the candidate.

## Service & RPCs

`admin.analytics.v1.AnalyticsService` · `admin.job.v1.JobService` · `admin.decision.v1.DecisionService`
(gRPC-web). All **bearer-auth, manager-scoped** (`company_admin` / `recruiter`); `comp_id` derived
from the **token, never the request**.

| Function | RPC | Status | Auth / scope |
|---|---|---|---|
| Hiring funnel | `AnalyticsService.GetFunnelAnalytics(FunnelAnalyticsRequest) → FunnelAnalytics` | EXISTING | manager + comp-scoped, read-only |
| No-ghosting KPIs | `AnalyticsService.GetNoGhostingKpis(NoGhostingKpisRequest) → NoGhostingKpis` | **NEW (v2 EXTEND)** | manager + comp-scoped, read-only |
| Recent jobs | `JobService.ListJobs(ListJobsRequest) → ListJobsResponse` | EXISTING | manager + comp-scoped |
| Advance (queue) | `DecisionService.OverrideGate({ applicationId })` | EXISTING | manager + comp-scoped, audited |
| Decline (queue) | `DecisionService.DecideApplication({ applicationId, outcome:"rejected" })` | EXISTING | manager + comp-scoped, audited, **notifies candidate** |

## Request / Response structures (camelCase per protobuf-es on the FE)

- **`GetFunnelAnalytics`** — req `{}` (comp from token); resp
  `FunnelAnalytics { states: { state: string, count: bigint }[], total: bigint, conversionRate: number }`.
- **`GetNoGhostingKpis`** — req `{ windowDays: number }` (default 30, clamped 7..90); resp
  `NoGhostingKpis { outcomeRate, openNoOutcome, avgResponseHours, medianResponseHours, totalApplicants, windowDays }`
  (`outcomeRate`/`*Hours` doubles; `open*`/`total*` bigint; `windowDays` echoed post-clamp).
  - **Semantics:** `outcomeRate` = terminal (`hired|rejected|withdrawn`) / total in-window;
    `openNoOutcome` = applicants with no terminal state (ghosting backlog → feeds the **Needs
    your decision** queue); `avg/median response` = apply → first recruiter action, computed from
    the application audit / state-history.
- **`ListJobs`** — req `{}`; resp `{ jobs: { jobId, title, status, ... }[] }` (`status ∈
  draft|published|paused|closed`). FE slices to 4 for the dashboard cell.
- **FE mock shape** (`frontend/apps/company/app/dashboard-types.ts`) — the KPI strip codes against
  this until `pnpm gen`:
  ```ts
  export interface NoGhostingKpisDTO {
    outcomeRate: number; openNoOutcome: number;
    avgResponseHours: number; medianResponseHours: number;
    totalApplicants: number; windowDays: number;
  }
  ```
  `makeMockKpis()` returns a `NoGhostingKpisDTO`; after `pnpm gen` swap to
  `api.analytics.getNoGhostingKpis({ windowDays: 30 })` (widen bigints with `Number(...)`).
  `FunnelAnalytics` + `ListJobsResponse` are already generated — no mock.

## Data required

- **Mongo `applications`** (comp-scoped) — funnel stage counts + the KPI aggregation
  (terminal-share + response-time percentiles over the window) — one aggregation in
  `resources/analytics.py` (`get_no_ghosting_kpis`). No new collection; derives from existing
  `applications` + funnel/audit data. Add a covering index only if the aggregation is hot.
- **Mongo `jobs`** (comp-scoped) — recent-jobs rows (`title`, `status`) + applicant counts.
- **Application audit / state-history** — apply timestamp → first recruiter transition
  (response-time metric); terminal-state detection (outcome rate, awaiting-outcome backlog).

## Errors & edge cases

- `PERMISSION_DENIED` — non-manager / cross-tenant (comp mismatch).
- `UNAVAILABLE` / network — FE `ErrorState` + retry per cell (the page never fully blocks).
- **Empty.** No applicants → funnel "No applications yet" + zeroed KPIs; no jobs → recent-jobs
  empty state "No jobs yet — post a role to get started"; empty queue → "All caught up". Empty
  states are truthful — never seeded with fake rows.
- `windowDays` out of range → clamped server-side (echoed back), never an error.

## Cross-references

- Restates: [`../../v2-screens/recruiter-dashboard.md`](../../v2-screens/recruiter-dashboard.md)
  §A (the `GetNoGhostingKpis` EXTEND + reuse of `GetFunnelAnalytics` / `ListJobs`).
- Shared enum: `ApplicationState` (terminal set `hired|rejected|withdrawn`); no-ghosting pillar
  (every applicant gets an outcome).
- Queue actions reuse the [`job-pipeline`](../job-pipeline/backend_job-pipeline.md) decision
  RPCs (`OverrideGate`, `DecideApplication`).
- `/company/analytics` shares the same `GetFunnelAnalytics` (one funnel source).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
