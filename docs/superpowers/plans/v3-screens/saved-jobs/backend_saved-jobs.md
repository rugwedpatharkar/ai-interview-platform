# Backend — Saved jobs

> **Screen:** Signed-in candidate's saved/bookmarked jobs.
> **FE consumer:** `frontend_saved-jobs.md`.
> **Status:** **EXISTING — reuse v2.** Source: `../v2-screens/saved-jobs.md`. The v3 work is an **appearance-only
> reskin** — no proto delta, no new RPC.
> **Real-vs-mock today:** `SavedJobsService` is **LIVE** — `savedJobs.{save,unsave,listSavedJobs}` ship over `admin`
> gRPC-web; the FE binds via `makeApiSavedJobsClient(api)` (not the in-memory mock). The reskin binds to the same calls.

## Functionalities
- **Save** a job (idempotent bookmark; candidate = caller).
- **Unsave** a job (idempotent; no error if not saved).
- **List** the caller's saved jobs (joined to the published job-card projection, `saved_at desc`).

## Service & RPCs (gRPC-web; `admin.saved_jobs.v1.SavedJobsService`, candidate-scoped — subject from bearer token)
| Function | RPC | Auth/scope |
|---|---|---|
| Save | `api.savedJobs.save({ jobId })` → `{ saved: true }` | bearer, candidate; idempotent |
| Unsave | `api.savedJobs.unsave({ jobId })` → `{ saved: false }` | bearer, candidate; idempotent |
| List | `api.savedJobs.listSavedJobs({})` → `{ jobs: SavedJob[] }` | bearer, candidate; own only |

> `candidate_user_id` is **NEVER** a request field — always derived from `caller_identity(token)`. Save is idempotent
> on the unique `(candidate_user_id, job_id)` index. **LIVE — no backend change for the reskin.**

## Request / Response structures (camelCase per protobuf-es on the FE)
```ts
// savedJobs.save({ jobId: string })   → { saved: true }   (idempotent)
// savedJobs.unsave({ jobId: string }) → { saved: false }  (idempotent)
// savedJobs.listSavedJobs({})         → { jobs: SavedJob[] }
interface SavedJob {                   // FE: SavedJobDTO extends JobCardDTO + savedAt
  jobId: string;
  title: string;
  companyName: string;
  companyId: string;
  location: string;          // "" when unset
  remoteMode: string;        // "remote" | "hybrid" | "onsite" | ""
  employmentType: string;    // "" when unset
  salaryMin: number;
  salaryMax: number;
  salaryCurrency: string;
  skills: string[];
  postedAt: string;          // ISO
  snippet: string;           // first ~160 chars of the JD
  savedAt: string;           // ISO — when the candidate bookmarked it
}
```
- **FE mock shape:** the `SavedJobsClient` seam (`list`/`save`/`unsave`) — **but the live adapter is wired today**
  (`makeApiSavedJobsClient(api)`). The in-memory `makeMockSavedJobsClient()` exists only for tests; the screen runs real.

## Data required
- **Read/write:** collection `saved_jobs`, unique index `(candidate_user_id, job_id)`; sort `saved_at desc`.
- **Join:** `listSavedJobs` joins each saved `job_id` to the **same published `JobCardDTO` projection** as
  `discovery.searchJobs` (a job unpublished after saving is filtered out of the list — the bookmark row stays harmless).
- **Excluded from the DTO (grep-test):** `candidate_user_id`, `comp_id` internals, draft fields.

## Errors & edge cases
- **Auth:** missing/invalid bearer → `UNAUTHENTICATED`; non-candidate → `PERMISSION_DENIED`.
- **Save of a non-published / non-existent job** → `NOT_FOUND` (can't bookmark a draft).
- **Unsave of a not-saved job** → idempotent (`saved: false`, no error).
- **Empty list** → FE empty state ("No saved jobs yet" → `/jobs`). Transport error → FE `ErrorState`.

## Cross-references
- Restates `../v2-screens/saved-jobs.md`.
- Shares the `JobCardDTO` projection with `marketplace-search` / `discovery.searchJobs`; `SaveJobButton` (the optimistic
  toggle) is reused on search/company/detail.
