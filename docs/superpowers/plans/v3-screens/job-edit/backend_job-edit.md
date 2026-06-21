# Job edit — Backend contract (v3 · frozen)

> **Screen.** `/company/jobs/[id]/edit` dedicated job-edit surface. **FE consumer:** [`frontend_job-edit.md`](./frontend_job-edit.md).
> **Status:** `EXISTING — reuse v2` · **no new backend, no new collection, no new RPC, no proto
> delta.** Same `JobService` the post-a-job and job-pipeline screens use. Restated from
> [`../post-a-job/backend_post-a-job.md`](../post-a-job/backend_post-a-job.md) §A (additive
> `Job` fields + `UpdateJob` + `gate_mode` + `posted_at` backfill).
> **Anti-fiction reminder:** The form persists only fields the user typed; pre-population
> reads only what the server returned. The Rubric cell shows the real Aptura Core 6 (no fake
> "average score" claims). When the AI Improve service is down, the form still saves — no
> fabricated suggestions. The Publish toast says truthfully "Published — your role will
> appear in the marketplace within a minute." See the anti-fiction rule in
> [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today:** `CreateJob` / `GetJob` / `PublishJob` / `ListJobs` / `UpdateJob` are
> **live**; the additive marketplace fields + `gate_mode` land via v2's EXTEND (FE codes
> against `JobFormValues` mock until `pnpm gen`). `jd.improveJd` is **live**.

## Functionalities

- **Get** the job spec to seed the form (`Job.GetJob` — returns the extended `JobResponse`
  including `gate_mode`, `posted_at`, and all additive marketplace fields).
- **Update** the job spec (`Job.UpdateJob` — same additive fields as `CreateJob` minus the
  status; cross-tenant `jobId` returns `NOT_FOUND`).
- **Publish** a draft (`Job.PublishJob` — flips `status → published` and stamps `posted_at`).
- **Unpublish / archive** by flipping `status` through `Job.UpdateJob({ jobId, status })`.
- **Improve JD** with AI (`jd.improveJd` — same as post-a-job).

## Service & RPCs (`admin.job.v1.JobService` gRPC-web · ai-agents REST — every RPC already exists)

| Function | RPC / endpoint | Status | Auth / scope |
|---|---|---|---|
| Get job | `GetJob(GetJobRequest) → JobResponse` | EXISTING (returns the extended fields incl. `gate_mode`) | bearer, **manager + comp-scoped** (cross-tenant `job_id` → `NOT_FOUND`) |
| Update job | `UpdateJob(UpdateJobRequest) → JobResponse` | EXISTING (v2 NEW) | manager + comp-scoped; asserts job belongs to caller's comp (`NOT_FOUND` else) |
| Publish job | `PublishJob(PublishJobRequest) → JobResponse` | EXISTING (now stamps `posted_at`) | manager + comp-scoped |
| Improve JD | `jd.improveJd(jdText)` → ai-agents REST `{ jd_text, suggestions[] }` | EXISTING | bearer (manager) |

**Note:** there is **no** `Archive` or `Unpublish` RPC — both are status flips through
`UpdateJob({ jobId, status })` with `status ∈ {draft, published, archived}`. The FE renders
the kebab menu items as friendly labels.

## Request / Response structures (camelCase per protobuf-es on the FE)

Restated from [`../post-a-job/backend_post-a-job.md`](../post-a-job/backend_post-a-job.md) §A
verbatim — the edit screen consumes the **same** shapes, just uses `UpdateJob` instead of
`CreateJob`.

```proto
message UpdateJobRequest {
  string job_id = 1;                                  // EDIT REQUIRES THIS
  string title = 2; string jd_text = 3;
  string status = 4;                                  // "draft" | "published" | "archived"
  string city = 5; string region = 6; string country = 7;
  string remote_mode = 8;                              // "remote" | "hybrid" | "onsite"
  string employment_type = 9;                          // "full_time" | "contract" | "internship"
  int64  salary_min = 10; int64 salary_max = 11; string salary_currency = 12;  // ISO 4217
  repeated string skills = 13;                         // lowercased on write
  string gate_mode = 14;                               // "auto" | "advisory"
}
message GetJobRequest { string job_id = 1; }
message PublishJobRequest { string job_id = 1; }
message JobResponse {
  string job_id = 1; string title = 2; string jd_text = 3; string status = 4;
  string city = 5; string region = 6; string country = 7;
  string remote_mode = 8; string employment_type = 9;
  int64 salary_min = 10; int64 salary_max = 11; string salary_currency = 12;
  repeated string skills = 13; string gate_mode = 14; string posted_at = 15;  // ISO; empty for drafts
}
```

- **`gate_mode` semantics** (restated):
  - `"advisory"` — integrity surfaced to the recruiter, never auto-ends the interview. The FE
    default for new jobs. Matches the design-language posture "AI recommends. Humans decide."
  - `"auto"` — HIGH-severity proctoring signals auto-terminate the interview (proctored
    default behavior on the server). The server's proto3 default for an omitted scalar.
  - Persisted on `aptitude_config.gate_mode`. Read by the interview / aptitude pipeline. The
    edit screen displays the persisted value via `<GateModeTiles />`.
- **`posted_at`** (restated): stamped at the `status → published` flip in `publish_job`
  (drafts have none; FE renders `—`). On edit, `posted_at` is **read-only** — the FE never
  sends it; the server preserves it across `UpdateJob` calls.
- **`status` transitions** (state machine):
  - `draft → published` — call `PublishJob` (stamps `posted_at`).
  - `draft → archived` — call `UpdateJob({ status: "archived" })`.
  - `published → draft` (unpublish) — call `UpdateJob({ status: "draft" })`; `posted_at` is
    preserved server-side (the role is hidden from the marketplace but its previous publish
    timestamp is kept).
  - `published → archived` — call `UpdateJob({ status: "archived" })`.
  - `archived → draft` (restore) — call `UpdateJob({ status: "draft" })`.
  - `archived → published` direct flip is NOT supported by the FE menu (must go through draft);
    the server may still accept the direct flip — the FE simply doesn't surface it.
- **FE mock shape** (`frontend/apps/company/app/jobs/job-form-types.ts`) — **unchanged**; the
  edit form binds to the same `JobFormValues` the post-a-job form uses. The new FE-only
  adapter `toUpdateRequest(jobId, JobFormValues)` mirrors `toCreateRequest` exactly (string
  → bigint salary, drop-empty, pass `gateMode`) but prepends `jobId`. Its unit test extends
  the post-a-job adapter tests with a `toFormValues → toUpdateRequest` round-trip case.

## Data required

- **Mongo `jobs`** (comp-scoped): additive document fields per
  [`../post-a-job/backend_post-a-job.md`](../post-a-job/backend_post-a-job.md). Indexes
  `(status, posted_at)`, `(status, remote_mode, employment_type)`, `(status, city)`. `skills`
  lowercased + de-duped on write.
- **`aptitude_config.gate_mode`** on the job (read by the interview / aptitude pipeline).
- ai-agents JD-improve service (no Mongo write).

## Errors & edge cases (boundary validation)

- `INVALID_ARGUMENT` — `remote_mode ∉ {remote,hybrid,onsite}`, `employment_type ∉
  {full_time,contract,internship}`, `gate_mode ∉ {auto,advisory}`, `status ∉
  {draft,published,archived}`, `salary_min > salary_max` (when both present). Empty strings
  normalise to null; `gate_mode == ""` falls back to the server default `"auto"` per proto3
  semantics.
- `NOT_FOUND` — `GetJob` / `UpdateJob` / `PublishJob` on a job not owned by the caller's comp
  (never leak another tenant's job). The FE renders the calm "Job unavailable" `.cell`.
- `PERMISSION_DENIED` — non-manager caller. The FE's `useRequireRole` redirects before this
  fires.
- `FAILED_PRECONDITION` — `PublishJob` on an already-published job (idempotent? — restate from
  the post-a-job contract; if the v2 server treats this as a no-op success, the FE's toast says
  "Already published"; if it returns `FAILED_PRECONDITION`, the FE surfaces it as an inline
  message).
- `UNAVAILABLE` — ai-agents JD-improve down → FE toast "AI suggestions unavailable right now —
  your draft is fine." Save is still possible without the suggestion.
- **Optimistic-locking note:** `UpdateJob` does NOT carry a `version` / `ifMatch` parameter
  today (per the v2 contract). If two recruiters edit the same job concurrently, last-write-
  wins. The FE does not attempt to detect this — flagged for a future enhancement (would
  require a `version` field added to `JobResponse` + `UpdateJobRequest`). **Out of scope** for
  this v3 plan.

## Cross-references

- Restates: [`../post-a-job/backend_post-a-job.md`](../post-a-job/backend_post-a-job.md) §A
  (additive fields + `UpdateJob` + `gate_mode` + `posted_at` backfill).
- Shared with: [`../jobs-list/backend_jobs-list.md`](../jobs-list/backend_jobs-list.md)
  (`ListJobs`), [`../job-pipeline/backend_job-pipeline.md`](../job-pipeline/backend_job-pipeline.md)
  (the `gate_mode` advisory branch + `assessment_review`), [`../job-detail/backend_job-detail.md`](../job-detail/backend_job-detail.md)
  (the public job-detail surface a published role is visible on).
- Pillar: job-marketplace (extended `JobService`, `posted_at`) + proctored-integrity
  (`gate_mode`).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
