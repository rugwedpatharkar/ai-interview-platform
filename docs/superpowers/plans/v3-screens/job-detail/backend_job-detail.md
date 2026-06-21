# Job detail — Backend contract (v3 · frozen)

> **Screen.** Public job-detail page (`/jobs/[id]`). **FE consumer:** [`frontend_job-detail.md`](./frontend_job-detail.md).
> **Status:** `EXISTING — reuse v2` (EXTEND) · live · proto already extended in v2 (no further delta), no new
> collections, no new events. Source: `../../v2-screens/job-detail.md`.
> **Anti-fiction reminder:** Aptura is pre-launch. The DTO carries only fields the FE renders today;
> no fabricated employer outcomes, no claimed ATS integrations, no unearned certifications — see the
> anti-fiction rule in [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today.** The authed gRPC `JobService.GetPublicJob` exists and is extended to the full public DTO;
> the public REST mirror `GET /public/jobs/{id}` is added on the `/public/*` app (shares `resources/discovery.py`).
> **Apply** (`api.applications.apply`) is live from day one. FE has a `NEXT_PUBLIC_MOCK` detail fixture.

## Functionalities

- **Get** a single published job's full public DTO (title, JD, location, work mode, type, salary, skills,
  posted-at, company `{id,name,logo}`).
- **Apply** to the job (authed island) — consent-gated; creates an application; idempotent per candidate+job.
- Opaque **404** for missing/unpublished/draft jobs (never leak draft existence).

## Service & RPCs

- **Public REST (SSR):** `GET /public/jobs/{id}` (`src/admin/app/routes/public_api.py`). **Auth:** none —
  published only (enforced in `resources/discovery.get_public_job_detail`); rate-limited (shared limiter);
  `Cache-Control: public, max-age=120`.
- **Authed gRPC mirror:** `admin.job.v1.JobService.GetPublicJob(GetJobRequest) returns (PublicJob)` — signature
  unchanged; the `PublicJob` message **grows** the new fields. Maps internal `comp_id` → public `company.id`.
- **Apply (separate, live):** `api.applications.apply({ jobId, consent })` — candidate-scoped (authed). Not part
  of the SSR read; the island targets it directly.

```proto
// service admin.job.v1.JobService — EXTEND existing rpc (signature unchanged)
rpc GetPublicJob(GetJobRequest) returns (PublicJob);

message PublicJob {
  string job_id=1; string title=2; string jd_text=3;          // existing
  string location=4; string remote_mode=5; string employment_type=6;   // NEW
  int64 salary_min=7; int64 salary_max=8; string salary_currency=9;    // NEW
  repeated string skills=10; string posted_at=11; Company company=12;  // NEW
}
message Company { string id=1; string name=2; string logo=3; }
```

## Request / Response structures

**REST `GET /public/jobs/{id}` (`200`, snake_case):**
```jsonc
{
  "job_id":"str","title":"str","jd_text":"str",
  "location":"str|null","remote_mode":"remote|hybrid|onsite|null",
  "employment_type":"full_time|part_time|contract|internship|null",
  "salary_min":0,"salary_max":0,"salary_currency":"USD|null",
  "skills":["str"],"posted_at":"ISO",
  "company":{ "id":"str","name":"str","logo":"str|null" }
}
```
`404 { "error":"not_found" }` for missing/unpublished/draft.

**FE DTO (camelCase, `app/jobs/[id]/types.ts`) the screen codes against:**
```ts
export type RemoteMode = "remote" | "hybrid" | "onsite";
export type EmploymentType = "full_time" | "part_time" | "contract" | "internship";
export interface PublicCompany { id: string; name: string; logo: string | null; }
export interface JobDetailDTO {
  jobId: string; title: string; jdText: string;
  location: string | null; remoteMode: RemoteMode | null; employmentType: EmploymentType | null;
  salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null;
  skills: string[]; postedAt: string; company: PublicCompany;
}
```
`fmtSalary(job)` → `"USD 120k–160k"` or `null` when the band is incomplete. **Mock shape** = a single
`JobDetailDTO` fixture (`id === "404"` throws `not_found`).

**Apply contract (live, preserved):** `api.applications.apply({ jobId, consent })` → on success the FE clears
`job-consent:<id>`, invalidates `["recommendations"]` + `["applications"]`, navigates to `/`.

## Data required

- **Collection:** `jobs` find-one where `status="published"`, projecting the public fields only; batched-join
  `companies`/`company_profiles` for `{id,name,logo}`. Shares published-only + projection with `search_jobs()`.
- **Backfill:** `posted_at` for legacy jobs.
- **Apply writes:** `applications` (candidate+job, consent flag) — owned by the live applications service.
- **Excluded from DTO (grep-test):** `comp_id` (internal name — mapped to `company.id`), `aptitude_config`,
  `required_topics`, `gate_mode`, recruiter notes, applicant counts.

## Errors & edge cases

- `NOT_FOUND` / 404 — opaque for draft/missing/closed (never leak draft existence) → FE `notFound()`.
- `UNAVAILABLE` / 5xx → SSR rethrows → Next `error.tsx` boundary.
- Apply: `PERMISSION_DENIED` (signed out → island shows "Sign in to apply" before calling); duplicate apply is
  idempotent; consent required (button disabled until checked).

## Cross-references

- Restates: `../../v2-screens/job-detail.md` §A.
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
- Shares `resources/discovery.py` projection with [`../marketplace-search/backend_marketplace-search.md`](../marketplace-search/backend_marketplace-search.md)
  and [`../company-profile/backend_company-profile.md`](../company-profile/backend_company-profile.md).
- Shared enum: `ApplicationState` (downstream of Apply). Pillar: `../../v2/2026-06-19-job-marketplace.md` Task 7.
