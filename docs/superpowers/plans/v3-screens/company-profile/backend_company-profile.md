# Company profile — Backend contract (v3 · frozen)

> **Screen.** Public company profile page (`/companies/[id]`). **FE consumer:** [`frontend_company-profile.md`](./frontend_company-profile.md).
> **Status:** `EXISTING — reuse v2` (NEW service in v2 — already defined; no further proto delta).
> Source: `../../v2-screens/company-profile.md`.
> **Anti-fiction reminder:** Aptura is pre-launch. Trust signals are funnel-derived (never self-reported);
> no fabricated employer reviews, no fake testimonials, no claimed ATS integrations — see the
> anti-fiction rule in [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today.** `CompanyProfileService` (admin gRPC) + its public REST mirrors `GET /public/companies/{id}`
> and `/jobs` are defined in v2 (shared `resources/company_profile.py`). FE has a `NEXT_PUBLIC_MOCK` fixture; the
> trust aggregation degrades to `0`/hidden when the funnel has insufficient samples.

## Functionalities

- **Get** a company's public branding (name, about, website, logo, locations).
- **Compute trust signals** from funnel ground-truth (application state-transition timings) — `activelyReviewing`,
  `respondsInDays` (median applied→first-decision; `0` when below min-sample), `openJobs`. **Never self-reported.**
- **List** the company's published jobs (paginated) — same `JobCardDTO` shape as search, so `JobCard` is reused.
- Opaque **404** for a company with no published presence.

## Service & RPCs

- **Authed gRPC:** `admin.company_profile.v1.CompanyProfileService.GetCompanyProfile(GetCompanyProfileRequest)
  returns (CompanyProfile)` (`routes/pb/company_profile.proto`). The **public read** is unauthenticated (the REST
  mirror shares the resource). Upsert/logo-presign are recruiter-scoped — out of scope for this screen
  (see `../company-branding/`).
- **Public REST (SSR):**
  - `GET /public/companies/{id}` → `CompanyProfile` (`Cache-Control: public, max-age=300`).
  - `GET /public/companies/{id}/jobs?page=&page_size=≤24` → `{ jobs: JobCardDTO[], total, page, page_size }`
    (`max-age=120`).
  - **Auth:** none on both — "public" once the company has ≥1 published job or a published profile (enforced in
    the resource); rate-limited (shared limiter).

```proto
service CompanyProfileService { rpc GetCompanyProfile(GetCompanyProfileRequest) returns (CompanyProfile); }
message GetCompanyProfileRequest { string comp_id = 1; }
message CompanyProfile {
  string id=1; string name=2; string about=3; string website=4; string logo=5;
  repeated string locations=6; TrustSignals trust=7;
}
message TrustSignals { bool actively_reviewing=1; int32 responds_in_days=2; int32 open_jobs=3; }
```

## Request / Response structures

**REST `GET /public/companies/{id}` (`200`, snake_case):**
```jsonc
{
  "id":"str","name":"str","about":"str|null","website":"str|null",
  "logo":"str|null","locations":["str"],
  "trust":{ "actively_reviewing":true, "responds_in_days":4, "open_jobs":7 }
}
```
**REST `GET /public/companies/{id}/jobs` (`200`):** `{ "jobs":[ <JobCardDTO element, same as /public/jobs> ],
"total":N, "page":1, "page_size":24 }`. `404 { "error":"not_found" }` for no published presence.

**FE DTO (camelCase, `app/companies/[id]/types.ts`) the screen codes against:**
```ts
import type { JobCardDTO } from "../../jobs/types";   // shared marketplace card DTO
export interface TrustSignals { activelyReviewing: boolean; respondsInDays: number; openJobs: number; }
export interface CompanyProfileDTO {
  id: string; name: string; about: string | null; website: string | null;
  logo: string | null; locations: string[]; trust: TrustSignals;
}
export interface CompanyJobsResult { jobs: JobCardDTO[]; total: number; page: number; pageSize: number; }
```
`trustChips(trust)` → ordered `["Actively reviewing", "Responds in ~4 days", "7 open roles"]`; **hides** the
responds chip when `respondsInDays === 0`; pluralizes "open role(s)". **Mock shape** = a `CompanyProfileDTO` + a
`JobCardDTO[]` fixture (`id === "404"` throws `not_found`).

## Data required

- **Collections:** `company_profiles` (branding; unique `comp_id`, index in `infra/db.py`) + `companies` (name).
- **Trust aggregation** (read-only over the funnel): `applications` state-transition timings →
  `actively_reviewing` (≥1 application left `applied` in the trailing window), `responds_in_days` (median
  `applied`→first non-`applied` transition; `0` below min-sample), `open_jobs` (count of published jobs).
- **Jobs:** `list_company_jobs(comp_id, page)` reuses `resources/discovery.search_jobs(comp_id=…,
  status="published")` projection (same `JobCardDTO`).
- **Excluded from DTO (grep-test):** `comp_id` (internal name — mapped to public `id`), recruiter PII, draft jobs,
  raw funnel rows, applicant identities — only branding + aggregate trust ship.

## Errors & edge cases

- `NOT_FOUND` / 404 — company with no published presence → FE `notFound()`.
- `UNAVAILABLE` / 5xx → SSR rethrows profile → `error.tsx`; jobs error caught → `{ jobs: [] }` → empty grid.
- Trust degradation: `respondsInDays === 0` (insufficient data) → FE hides that chip; `openJobs` always shown
  (pluralized).

## Cross-references

- Restates: `../../v2-screens/company-profile.md` §A.
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
- Reuses `JobCardDTO`/`JobCard` from [`../marketplace-search/backend_marketplace-search.md`](../marketplace-search/backend_marketplace-search.md);
  shares `resources/discovery.py` projection. Links to per-job [`../job-detail/backend_job-detail.md`](../job-detail/backend_job-detail.md).
- Trust signals trace to the anti-ghosting differentiator (no-ghosting KPIs).
- Pillar: `../../v2/2026-06-19-job-marketplace.md` Task 7 (Company-profile resource).
