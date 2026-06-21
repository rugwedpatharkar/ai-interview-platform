# Marketplace search — Backend contract (v3 · frozen)

> **Screen.** Public job marketplace / search (`/jobs`). **FE consumer:** [`frontend_marketplace-search.md`](./frontend_marketplace-search.md).
> **Status:** `EXISTING — reuse v2` · live · no proto delta, no new collections, no new events.
> **Anti-fiction reminder:** Aptura is pre-launch. This contract documents only what the UI consumes today;
> no fabricated job counts, no fake employers, no claimed integrations — see the anti-fiction rule in
> [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today.** The public REST `GET /public/jobs` is **live** (token-free, SSR-read) and the authed
> mirror `discovery.searchJobs` gRPC shares the same resource layer. FE has a `NEXT_PUBLIC_MOCK` fixture for
> offline dev; flipping the flag points at the real endpoint with no code change.

## Functionalities

- **Search** published jobs by `q` (text over title/jd/skills), `location`, and facet filters.
- **Filter** by `remote` (work mode), `type` (employment type), `level` (experience level), `skills` (csv).
- **Sort** by `relevance` (default, text score) or `recent` (`posted_at desc`).
- **Paginate** (`page`, `page_size` ≤ 24).
- **Facet** — return bucket counts for work mode / employment type / experience level for the rail.

## Service & RPCs

- **Public REST (primary, SSR):** `GET /public/jobs` on the admin `/public/*` Starlette app
  (`src/admin/app/routes/public_api.py`). **Auth/scope:** none — published jobs only (enforced in the resource);
  rate-limited (`lib.redis.RateLimiter`); `page_size` capped at 24; `Cache-Control: public, max-age=60`.
- **Authed gRPC mirror:** `admin.discovery.v1.DiscoveryService.SearchJobs` (`routes/pb/discovery.proto`) — same
  `resources/discovery.search_jobs()` layer; used by signed-in surfaces. Tenant: n/a (public catalog).

```
GET /public/jobs?q=<str>&location=<str>&remote=<remote|hybrid|onsite>
                 &type=<full_time|part_time|contract|internship>&level=<str>
                 &skills=<csv>&sort=<relevance|recent>&page=<int>&page_size=<int≤24>
```

## Request / Response structures

**Wire response (`200`, snake_case):**
```jsonc
{
  "jobs": [{
    "job_id": "str", "title": "str", "company_name": "str", "company_id": "str",
    "location": "str|null", "remote_mode": "remote|hybrid|onsite|null",
    "employment_type": "full_time|…|null", "salary_min": 0, "salary_max": 0,
    "salary_currency": "USD|null", "skills": ["str"], "posted_at": "ISO",
    "snippet": "str"                                  // first ~160 chars of jd
  }],
  "facets": {
    "remote_mode":       [{ "value": "remote", "count": 12 }],
    "employment_type":   [{ "value": "full_time", "count": 40 }],
    "experience_level":  [{ "value": "senior", "count": 8 }]
  },
  "total": 124, "page": 1, "page_size": 24
}
```

**FE DTO (camelCase, `app/jobs/types.ts`) the screen codes against:**
```ts
export type RemoteMode = "remote" | "hybrid" | "onsite";
export interface JobCardDTO {
  jobId: string; title: string; companyName: string; companyId: string;
  location: string | null; remoteMode: RemoteMode | null; employmentType: string | null;
  salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null;
  skills: string[]; postedAt: string; snippet: string;
}
export interface FacetBucket { value: string; count: number; }
export interface SearchJobsResult {
  jobs: JobCardDTO[];
  facets: { remoteMode: FacetBucket[]; employmentType: FacetBucket[]; experienceLevel: FacetBucket[] };
  total: number; page: number; pageSize: number;
}
export interface SearchJobsParams {
  q?: string; location?: string; remote?: RemoteMode; type?: string; level?: string;
  skills?: string[]; sort?: "relevance" | "recent"; page?: number; pageSize?: number;
}
```
`toQuery(params)` serializes camelCase params → the snake_case querystring (`page_size`); drops empties; joins
`skills` with `,`. **Mock shape** = the same `SearchJobsResult` from a fixture array.

## Data required

- **Collection:** `jobs` where `status="published"`. Read fields: title, jd_text, skills, location, remote_mode,
  employment_type, salary_min/max/currency, posted_at, comp_id (→ company_id/company_name).
- **Derived:** Mongo `$text`(title, jd_text, skills) score for relevance; `$facet` aggregation for bucket counts;
  `snippet` = first ~160 chars of `jd_text`. Secondary sort `posted_at desc` on text-score tie.
- **Backfill:** `posted_at` for legacy jobs.
- **Excluded from DTO (grep-test):** `comp_id` (internal name — exposed only as `company_id`), draft jobs,
  `aptitude_config`, `required_topics`. Only the fields above ship.

## Errors & edge cases

- `INVALID_ARGUMENT` / 400 — malformed sort or page params (clamp `page_size` to 24).
- `UNAVAILABLE` / 5xx → FE error `EmptyState` ("Couldn't load jobs"); SSR `page.tsx` catches → `initial = null`.
- Empty result set → `total: 0`, `jobs: []` → FE empty `EmptyState` ("No matching jobs").
- No `NOT_FOUND` for the list (an empty catalog is a valid 200).

## Cross-references

- Restates: `../../v2-screens/marketplace-search.md` §A.
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
- Shares `resources/discovery.py` with [`../job-detail/backend_job-detail.md`](../job-detail/backend_job-detail.md)
  (`get_public_job_detail`) and [`../company-profile/backend_company-profile.md`](../company-profile/backend_company-profile.md)
  (`list_company_jobs` reuses `search_jobs` projection — same `JobCardDTO`).
- Pillar: `../../v2/2026-06-19-job-marketplace.md` (Inc 1, Mongo `$text`+`$facet`).
