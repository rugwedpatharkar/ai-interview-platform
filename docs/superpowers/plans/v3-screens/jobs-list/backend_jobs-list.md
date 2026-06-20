# Backend — `jobs-list` (Midnight v3)

> **Screen:** Jobs list · **FE consumer:** [`frontend_jobs-list.md`](./frontend_jobs-list.md)
> **Status:** **EXISTING — reuse v2.** Restated from [`../../v2-screens/post-a-job.md`](../../v2-screens/post-a-job.md) §A (the `Job` model/`JobService`). **No proto delta, no new collection, no new endpoint** — the Midnight redesign is appearance-only; this page consumes the same `JobService.ListJobs` it ships today.
> **Real-vs-mock today:** **live.** `JobService.ListJobs` is generated + consumed in production. No mock seam.

## Functionalities
- **List jobs** for the caller's company — every posting with status (`draft|published|paused|closed`) + applicant counts, newest first.
- (Filter/sort by status is a **frontend** concern over the returned list — no per-status RPC.)

## Service & RPCs (`admin.job.v1.JobService`, gRPC-web)
| Function | RPC | Status | Auth/scope |
|---|---|---|---|
| List jobs | `ListJobs(ListJobsRequest) → ListJobsResponse` | EXISTING | **bearer, manager-scoped** (`company_admin`/`recruiter`), **comp-scoped** — `comp_id` from the **token, never the request** |

## Request / Response structures (camelCase per protobuf-es)
- **`ListJobs` request:** `{}` (comp derived from the token).
- **`ListJobs` response:** `{ jobs: JobSummary[] }` where each row carries at least:
  ```ts
  interface JobSummary {
    jobId: string;
    title: string;
    status: "draft" | "published" | "paused" | "closed";
    applicantCount?: number;   // count for the count cell (if the response provides it; else derive)
    newCount?: number;         // "+N new" (optional)
    postedAt?: string;         // ISO; empty for drafts
  }
  ```
- **FE mock shape:** none — binds to the **existing** generated `ListJobsResponse`. The table reads `jobId`/`title`/`status` (and counts when present); confirm the real field names against `job_pb.ts` and adapt the table cells (no behavior change).

## Data required
- **Mongo `jobs`** (comp-scoped): `title`, `status`, `posted_at`. Applicant counts come from `applications` grouped by `job_id` (the response may already join them; otherwise the count cell reads whatever `ListJobsResponse` provides). No new index for the list (the comp-scoped `jobs` query already exists).

## Errors & edge cases
- `PERMISSION_DENIED` — non-manager / cross-tenant.
- `UNAVAILABLE` / network → FE `ErrorState` + retry.
- **Empty:** no jobs → `{ jobs: [] }` → FE `EmptyState` "No jobs yet".

## Cross-references
- Restates: [`../../v2-screens/post-a-job.md`](../../v2-screens/post-a-job.md) §A (the `Job` model + `JobService` surface).
- Sibling pages on the same service: [`post-a-job`](../post-a-job/backend_post-a-job.md) (`CreateJob`/`UpdateJob`/`PublishJob`/`GetJob`), [`job-pipeline`](../job-pipeline/backend_job-pipeline.md) (per-job applicants).
- Shared enum: job `status` (`draft|published|paused|closed`) drives `jobStatus()` pill tones.
