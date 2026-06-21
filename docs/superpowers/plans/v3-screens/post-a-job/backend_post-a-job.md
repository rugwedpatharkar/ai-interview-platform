# Post a job — Backend contract (v3 · frozen)

> **Screen.** `/company/jobs/new` (and `/company/jobs/[id]` edit, which reuses the same form).
> **FE consumer:** [`frontend_post-a-job.md`](./frontend_post-a-job.md).
> **Status:** **EXISTING — reuse v2** (the additive `Job` fields + `UpdateJob` + `gate_mode` are
> already specified in v2). Restated from [`../../v2-screens/post-a-job.md`](../../v2-screens/post-a-job.md)
> §A. **The Aperture Pro v3 redesign is appearance-only — no proto delta beyond what v2 already
> planned.**
> **Anti-fiction reminder:** The form persists only fields the user typed; the Rubric cell shows
> the real Aptura Core 6 (no fake "average score" claims). When the AI Improve service is down,
> the form still submits — no fabricated suggestions. See the anti-fiction rule in
> [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today:** `CreateJob` / `GetJob` / `PublishJob` / `ListJobs` are **live**; the
> additive marketplace fields + `UpdateJob` + `gate_mode` land via v2's EXTEND (FE codes against
> the `JobFormValues` mock until `pnpm gen`). `jd.improveJd` (ai-agents REST) is **live**.

## Functionalities

- **Create a job** — title + JD + marketplace display fields (location / remote / employment /
  salary / skills) + integrity `gate_mode`.
- **Update a job** — same additive fields on an existing job (the shared `JobForm` reuses this
  for `/company/jobs/[id]` edit).
- **Publish a job** — flips `status → published` and stamps `posted_at = now`.
- **Get a job** — returns the extended fields (seeds the edit form, incl. `gate_mode`).
- **Improve the JD with AI** — ai-agents REST returns an improved `jd_text` + `suggestions[]`.

## Service & RPCs (`admin.job.v1.JobService` gRPC-web · ai-agents REST)

| Function | RPC / endpoint | Status | Auth / scope |
|---|---|---|---|
| Create job | `CreateJob(CreateJobRequest) → JobResponse` | **EXTEND req** | bearer, **manager + comp-scoped** (comp from token) |
| Update job | `UpdateJob(UpdateJobRequest) → JobResponse` | **NEW (v2)** | manager + comp-scoped; asserts job belongs to caller's comp (404 else) |
| Publish job | `PublishJob(PublishJobRequest) → JobResponse` | EXISTING (now stamps `posted_at`) | manager + comp-scoped |
| Get job | `GetJob(GetJobRequest) → JobResponse` | EXISTING (returns new fields) | manager + comp-scoped |
| Improve JD | `jd.improveJd(jdText)` → ai-agents REST `{ jd_text, suggestions[] }` | EXISTING | bearer (manager) |

## Request / Response structures (camelCase per protobuf-es)

**Additive `Job` fields (all optional, back-compat with legacy jobs — new field numbers only):**

```proto
message CreateJobRequest {
  string title = 1; string jd_text = 2;            // EXISTING
  string city = 3; string region = 4; string country = 5;
  string remote_mode = 6;        // "remote" | "hybrid" | "onsite"
  string employment_type = 7;    // "full_time" | "contract" | "internship"
  int64  salary_min = 8; int64 salary_max = 9; string salary_currency = 10;  // ISO 4217
  repeated string skills = 11;   // lowercased on write
  string gate_mode = 12;         // "auto" | "advisory" (FE default "advisory"; server default "auto")
}
message UpdateJobRequest { string job_id = 1; /* …same additive fields… */ }
message JobResponse {
  string job_id = 1; string title = 2; string jd_text = 3; string status = 4;  // EXISTING
  string city = 5; string region = 6; string country = 7;
  string remote_mode = 8; string employment_type = 9;
  int64 salary_min = 10; int64 salary_max = 11; string salary_currency = 12;
  repeated string skills = 13; string gate_mode = 14; string posted_at = 15;  // ISO; empty for drafts
}
```

- **`gate_mode` semantics:**
  - `"advisory"` — integrity surfaced to the recruiter, never auto-ends the interview. The FE
    default. Matches the design-language posture "AI recommends. Humans decide."
  - `"auto"` — HIGH-severity proctoring signals auto-terminate the interview (proctored
    default behavior on the server). The server's proto3 default for an omitted scalar.
  - Persisted on `aptitude_config.gate_mode`. Read by the interview / aptitude pipeline.
- **`posted_at`:** stamped at the `status → published` flip in `publish_job` (drafts have none;
  FE renders `—`).
- **`jd.improveJd` response:** `{ jd_text: string, suggestions: string[] }`.
- **FE mock shape** (`frontend/apps/company/app/jobs/job-form-types.ts`) — `JobForm` codes
  against this until `pnpm gen`:
  ```ts
  export type RemoteMode = "remote" | "hybrid" | "onsite";
  export type EmploymentType = "full_time" | "contract" | "internship";
  export type GateMode = "auto" | "advisory";
  export interface JobFormValues {
    title: string; jdText: string; city: string; region: string; country: string;
    remoteMode: RemoteMode | ""; employmentType: EmploymentType | "";
    salaryMin: string; salaryMax: string; salaryCurrency: string;
    skills: string[]; gateMode: GateMode;
  }
  ```
  `toCreateRequest(JobFormValues)` maps to the request (string → bigint salary, drop-empty, pass
  `gateMode`) — the only adapter that changes when the proto camelCase lands.

## Data required

- **Mongo `jobs`** (comp-scoped): additive document fields above; indexes `(status, posted_at)`,
  `(status, remote_mode, employment_type)`, `(status, city)`. `skills` lowercased + de-duped on
  write.
- **`aptitude_config.gate_mode`** on the job (read by the interview / aptitude pipeline).
- ai-agents JD-improve service (no Mongo write).

## Errors & edge cases (boundary validation)

- `INVALID_ARGUMENT` — `remote_mode ∉ {remote,hybrid,onsite}`, `employment_type ∉
  {full_time,contract,internship}`, `gate_mode ∉ {auto,advisory}`, `salary_min > salary_max`
  (when both present). Empty strings normalise to null; `gate_mode == ""` falls back to the
  server default `"auto"` per proto3 semantics.
- `NOT_FOUND` — `UpdateJob` on a job not owned by the caller's comp (never leak another
  tenant's job).
- `PERMISSION_DENIED` — non-manager.
- `UNAVAILABLE` — ai-agents JD-improve down → FE toast "AI suggestions unavailable right now —
  your draft is fine." Form is still submittable without the suggestion.

## Cross-references

- Restates: [`../../v2-screens/post-a-job.md`](../../v2-screens/post-a-job.md) §A (additive
  fields + `UpdateJob` + `gate_mode` + `posted_at` backfill).
- Shared with: [`jobs-list`](../jobs-list/backend_jobs-list.md) (`ListJobs`),
  [`job-pipeline`](../job-pipeline/backend_job-pipeline.md) (the `gate_mode` advisory branch +
  `assessment_review`).
- Pillar: proctored-integrity (`gate_mode`) + job-marketplace (extended `JobService`, `posted_at`).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
