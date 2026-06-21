# Jobs list — Backend contract (v3 · frozen)

> **Screen.** `/company/jobs`. **FE consumer:** [`frontend_jobs-list.md`](./frontend_jobs-list.md).
> **Status:** **EXISTING — reuse v2.** Restated from [`../../v2-screens/post-a-job.md`](../../v2-screens/post-a-job.md)
> §A (the `Job` model / `JobService`). **No proto delta, no new collection, no new endpoint** —
> the Aperture Pro v3 redesign is appearance-only; this page consumes the same `JobService.ListJobs`
> it ships today.
> **Anti-fiction reminder:** The table renders only what `ListJobs` truly returns. Empty state
> shows truthful copy ("No jobs yet — post a role to get started") — never seeded with fake rows
> or fabricated company outcomes. See the anti-fiction rule in
> [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today:** **live.** `JobService.ListJobs` is generated + consumed in production.
> No mock seam.

## Functionalities

- **List jobs** for the caller's company — every posting with status
  (`draft|published|paused|closed`) + applicant counts, newest first.
- (Filter / sort by status is a **frontend-only** concern over the returned list — no per-status
  RPC.)

## Service & RPCs (`admin.job.v1.JobService`, gRPC-web)

| Function | RPC | Status | Auth / scope |
|---|---|---|---|
| List jobs | `ListJobs(ListJobsRequest) → ListJobsResponse` | EXISTING | **bearer, manager-scoped** (`company_admin` / `recruiter`), **comp-scoped** — `comp_id` from the **token, never the request** |

## Request / Response structures (camelCase per protobuf-es)

- **`ListJobs` request:** `{}` (comp derived from the token).
- **`ListJobs` response:** `{ jobs: JobSummary[] }` where each row carries at least:
  ```ts
  interface JobSummary {
    jobId: string;
    title: string;
    status: "draft" | "published" | "paused" | "closed";
    applicantCount?: number;   // Applicants cell (if the response provides it; else derive)
    newCount?: number;         // "+N new" cell (optional)
    postedAt?: string;         // ISO; empty for drafts → FE renders "—"
  }
  ```
- **FE mock shape:** none — binds to the **existing** generated `ListJobsResponse`. The table
  reads `jobId` / `title` / `status` (and counts when present); confirm the real field names
  against `job_pb.ts` and adapt the table cells (no behavior change).

## Data required

- **Mongo `jobs`** (comp-scoped): `title`, `status`, `posted_at`. Applicant counts come from
  `applications` grouped by `job_id` (the response may already join them; otherwise the count
  cell reads whatever `ListJobsResponse` provides). No new index for the list — the comp-scoped
  `jobs` query already exists.

## Errors & edge cases

- `PERMISSION_DENIED` — non-manager / cross-tenant.
- `UNAVAILABLE` / network → FE inline `.pill-danger` + Retry; the head + filter chips stay
  interactive (no full-page block).
- **Empty.** No jobs → `{ jobs: [] }` → FE truthful empty state "No jobs yet — post a role to
  get started" + primary CTA.
- **Filtered-empty.** Client-side filter to zero → FE inline "No <status> jobs." Never a 500.

## Cross-references

- Restates: [`../../v2-screens/post-a-job.md`](../../v2-screens/post-a-job.md) §A (the `Job`
  model + `JobService` surface).
- Sibling pages on the same service: [`post-a-job`](../post-a-job/backend_post-a-job.md)
  (`CreateJob` / `UpdateJob` / `PublishJob` / `GetJob`),
  [`job-pipeline`](../job-pipeline/backend_job-pipeline.md) (per-job applicants).
- Shared enum: job `status` (`draft|published|paused|closed`) drives `jobStatus()` pill tones.
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
