# Backend — `recruiter-dashboard` (Midnight v3)

> **Screen:** Recruiter dashboard + KPIs · **FE consumer:** [`frontend_recruiter-dashboard.md`](./frontend_recruiter-dashboard.md)
> **Status:** **EXISTING — reuse v2** (one EXTEND already specified in v2). Restated from [`../../v2-screens/recruiter-dashboard.md`](../../v2-screens/recruiter-dashboard.md). **The Midnight redesign is appearance-only — no proto delta beyond what v2 already planned.**
> **Real-vs-mock today:** **funnel + recent jobs are LIVE** (`Analytics.GetFunnelAnalytics`, `Job.ListJobs` are generated + consumed in prod). **KPI strip is mock** (`makeMockKpis()`) until `Analytics.GetNoGhostingKpis` lands (the one v2 EXTEND). The needs-decision queue reuses existing decision RPCs (live).

## Functionalities
- **Get hiring funnel** — stage counts + total + conversion, comp-scoped, windowed (Last 30 days).
- **Get no-ghosting KPIs** — outcome rate, awaiting-outcome backlog, avg/median response time, total applicants (the anti-ghosting commitment as metrics).
- **List recent jobs** — the company's jobs (top 5) with status + applicant counts.
- **Decide / advance from the queue** — Advance (`OverrideGate`) and Reject (`DecideApplication(rejected)`) on awaiting-outcome applicants; reuses the pipeline's RPCs (no new surface).

## Service & RPCs
`admin.analytics.v1.AnalyticsService` · `admin.job.v1.JobService` · `admin.decision.v1.DecisionService` (gRPC-web). All **bearer-auth, manager-scoped** (`company_admin`/`recruiter`); `comp_id` from the **token, never the request**.

| Function | RPC | Status | Auth/scope |
|---|---|---|---|
| Hiring funnel | `AnalyticsService.GetFunnelAnalytics(FunnelAnalyticsRequest) → FunnelAnalytics` | EXISTING | manager + comp-scoped, read-only |
| No-ghosting KPIs | `AnalyticsService.GetNoGhostingKpis(NoGhostingKpisRequest) → NoGhostingKpis` | **NEW (v2 EXTEND)** | manager + comp-scoped, read-only |
| Recent jobs | `JobService.ListJobs(ListJobsRequest) → ListJobsResponse` | EXISTING | manager + comp-scoped |
| Advance (queue) | `DecisionService.OverrideGate({ applicationId })` | EXISTING | manager + comp-scoped, audited |
| Reject (queue) | `DecisionService.DecideApplication({ applicationId, outcome:"rejected" })` | EXISTING | manager + comp-scoped, audited, **notifies candidate** |

## Request / Response structures (camelCase per protobuf-es on the FE)
- **`GetFunnelAnalytics`** — req `{}` (comp from token); resp `FunnelAnalytics { states: { state: string, count: bigint }[], total: bigint, conversionRate: number }`.
- **`GetNoGhostingKpis`** — req `{ windowDays: number }` (default 30, clamped 7..90); resp `NoGhostingKpis { outcomeRate, openNoOutcome, avgResponseHours, medianResponseHours, totalApplicants, windowDays }` (`outcomeRate`/`*Hours` doubles; `open*`/`total*` bigint; `windowDays` echoed post-clamp).
  - **Semantics:** `outcomeRate` = terminal (`hired|rejected|withdrawn`) / total in-window; `openNoOutcome` = applicants with no terminal state (ghosting backlog → feeds the **Needs your decision** queue); `avg/median response` = apply → first recruiter action, from the application audit/state-history.
- **`ListJobs`** — req `{}`; resp `{ jobs: { jobId, title, status, ... }[] }` (`status ∈ draft|published|paused|closed`). FE `.slice(0,5)`.
- **FE mock shape** (`frontend/apps/company/app/dashboard-types.ts`) — the KPI strip codes against this until `pnpm gen`:
  ```ts
  export interface NoGhostingKpisDTO {
    outcomeRate: number; openNoOutcome: number;
    avgResponseHours: number; medianResponseHours: number;
    totalApplicants: number; windowDays: number;
  }
  ```
  `makeMockKpis()` returns a `NoGhostingKpisDTO`; after `pnpm gen` swap to `api.analytics.getNoGhostingKpis({ windowDays: 30 })` (widen bigints with `Number(...)`). `FunnelAnalytics` + `ListJobsResponse` are already generated — no mock.

## Data required
- **Mongo `applications`** (comp-scoped): funnel stage counts + the KPI aggregation (terminal-share + response-time percentiles over the window) — one aggregation in `resources/analytics.py` (`get_no_ghosting_kpis`); **no new collection**, derives from existing `applications` + funnel/audit data. Add a covering index only if the aggregation is hot.
- **Mongo `jobs`** (comp-scoped): recent-jobs rows (`title`, `status`) + applicant counts.
- **Application audit/state-history**: apply timestamp → first recruiter transition (response-time metric); terminal-state detection (outcome rate, awaiting-outcome backlog).

## Errors & edge cases
- `PERMISSION_DENIED` — non-manager / cross-tenant (comp mismatch).
- `UNAVAILABLE` / network — FE `ErrorState` + retry per region (page never fully blocks).
- **Empty:** no applicants → funnel "No applications yet", KPIs zeroed; no jobs → recent-jobs `EmptyState`; empty queue → "All caught up".
- `windowDays` out of range → clamped server-side (echoed back), never an error.

## Cross-references
- Restates: [`../../v2-screens/recruiter-dashboard.md`](../../v2-screens/recruiter-dashboard.md) §A (the `GetNoGhostingKpis` EXTEND + reuse of `GetFunnelAnalytics`/`ListJobs`).
- Shared enum: `ApplicationState` (terminal set `hired|rejected|withdrawn`); no-ghosting pillar (every applicant gets an outcome).
- Queue actions reuse the [`job-pipeline`](../job-pipeline/backend_job-pipeline.md) decision RPCs (`OverrideGate`, `DecideApplication`).
- `/company/analytics` shares the same `GetFunnelAnalytics` (one funnel source).
