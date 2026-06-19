# Inc 1 — Job Marketplace & Discovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use `- [ ]`
> checkboxes. Spec: `docs/superpowers/v2/2026-06-19-job-marketplace-design.md`. Read the canonical
> overview (`…-v2-architecture-overview-design.md`, §5 Pillar A) first.
>
> **Goal:** turn the closed funnel into a two-sided marketplace — anonymous browse/search of the
> published catalog (SSR, SEO) over a new `/public/*` read surface, with saved jobs, alerts, a
> recommended feed, company branding, and employer sourcing — **without touching the apply/funnel
> path**. Search is Mongo `$text` + `$facet` for v2.0; a Qdrant semantic rerank lands last (v2.1).

## Global constraints

- **LOCAL-ONLY — never run git/gh.** The skill's "commit" steps are replaced by **"run the gate":**
  `bash scripts/check.sh` (ruff format + lint S-rules line-88, pip-audit, pytest ×5) must stay green;
  **baseline today is 423 tests** — it only grows. Frontend: `npx pnpm@9.15.0 --filter @ip/candidate
  build` + `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck`. **Never
  `next build` while `pnpm dev` is live.**
- **Production-grade-minimal** (`~/.claude/CLAUDE.md` + `docs/superpowers/plans/PRODUCTION_STANDARDS.md`):
  validate at boundaries (Pydantic on every API/event/MCP edge; the `/public/*` query params are an
  untrusted boundary), trust validated internals; every external call (Mongo/Redis/Qdrant) has a
  timeout + bounded retry; **tenant-scoped** `comp_id` always from the **token, never client input**;
  structured logging; no PII/secret/internal-error leak; no nested try/except, no defensive coercion
  on typed params.
- **The proto → `pnpm --filter @ip/api-client gen` → `@ip/api-client` pipeline is the FE contract.**
  Every new gRPC service: `.proto` in `src/admin/app/routes/pb/` → servicer in `routes/*.py` (thin
  adapter, mirror `routes/job.py`) → register in `routes/web.py` → `pnpm gen` → wire the client into
  `frontend/packages/api-client/src/index.ts`.
- **The central guardrail:** public REST and authed gRPC are **two thin adapters over one
  `resources/*` layer**. Published-only, tenant scoping, and DTO shaping live **only** in the
  resource. **No query/filter logic in `public_api.py` or any servicer.**
- **Do not touch** the funnel state machine, CAS, audit, consent, or `ApplicationService.apply`. The
  apply path is the regression baseline.
- **Free / self-hostable only.** No Atlas Search, no Meilisearch/Typesense/Elasticsearch. Qdrant
  (already in the stack) is the only vector store; it appears in v2.1 only.

---

## File structure (new + modified)

```
src/admin/app/
  model/
    job.py                        (MODIFY — add location split, remote_mode, employment_type,
                                    salary_*, skills, posted_at; all optional/additive)
    company_profile.py            (NEW — CompanyProfile pydantic model)
    saved_job.py                  (NEW)         job_alert.py (NEW)
  infra/
    db.py                         (MODIFY — add jobs text + facet indexes, company_profiles unique,
                                    saved_jobs unique, job_alerts index — the single index authority)
    migrations/
      backfill_posted_at.py       (NEW — BLOCKING one-shot idempotent backfill: published jobs with
                                    posted_at=null inherit created_at; run on deploy after ensure_indexes)
    repositories/
      jobs.py                     (MODIFY — search aggregation lives in job_search.py; jobs stays
                                    CRUD; add posted_at to set_status-on-publish path if needed)
      job_search.py               (NEW — $text/$facet aggregation; v2.1 Qdrant rerank hook)
      company_profiles.py         (NEW)   saved_jobs.py (NEW)   job_alerts.py (NEW)
  resources/
    job.py                        (MODIFY — create/update accept new fields; publish_job stamps
                                    posted_at; get_public_job returns the new display fields)
    discovery.py                  (NEW — search_jobs, get_public_job_detail,
                                    list_company_published_jobs, get_recommended_feed)
    company_profile.py            (NEW — get, get_public, upsert, presign_logo_upload)
    saved_jobs.py                 (NEW)   job_alerts.py (NEW)   sourcing.py (NEW — search_candidates)
  routes/
    public_api.py                 (NEW — create_public_app(deps): Starlette read-only /public/*)
    discovery.py                  (NEW servicer)   saved_jobs.py (NEW)   job_alerts.py (NEW)
    company_profile.py            (NEW)   sourcing.py (NEW; or fold SearchCandidates into discovery)
    job.py                        (MODIFY — UpdateJob + new fields on Create/JobResponse/PublicJob)
    web.py                        (MODIFY — register the new servicers)
    pb/
      discovery.proto company_profile.proto saved_jobs.proto job_alerts.proto sourcing.proto (NEW)
      job.proto                   (MODIFY — additive fields + UpdateJob)
  main.py                         (MODIFY — extend _oauth_dispatcher to route /public/* → public_app;
                                    build public_app via create_public_app; thread RateLimiter; run the
                                    posted_at backfill after ensure_indexes; (v2.1) jobs:catalog
                                    reconcile pass in run_schedulers)
  config.py                       (MODIFY — public_page_size_max, public_rate_limit_*, public cache TTL;
                                    logo_max_bytes, logo_allowed_content_types)

src/admin/tests/
  test_discovery_resource.py test_job_search_repo.py test_public_api.py
  test_saved_jobs.py test_job_alerts.py test_company_profile.py test_sourcing.py
  test_posted_at_migration.py (NEW — backfill idempotency + draft exclusion + null-sort guard)
  test_job_resource.py (MODIFY — new fields + posted_at)   conftest.py (+fake repos/limiter)

src/ai-agents/app/                (v2.1 ONLY)
  resources/matcher.py or handlers.py  (MODIFY — on job.published/edited, upsert JD vector to
                                        jobs:catalog; delete on unpublish/close)
  infra/                          (jobs:catalog Qdrant collection via the existing vector client)

frontend/
  packages/api-client/src/index.ts (MODIFY — add discovery/savedJobs/jobAlerts/companyProfile clients
                                    via the import + `export *` + ApiClients + clientsFromTransport quad)
  packages/shared/src/
    public-api.ts                 (NEW — typed `fetchPublicJobs/fetchPublicJob/fetchPublicCompany/
                                    fetchCompanyJobs` over `/public/*`: server-safe plain `fetch`, no
                                    token, returns the PublicJobCard/Detail DTOs; the SSR data layer)
    index.ts                      (MODIFY — re-export the public-api helpers + PublicJob* types)
  apps/candidate/
    lib/public-url.ts             (NEW — `publicApiBase()`: `ADMIN_INTERNAL_URL ?? NEXT_PUBLIC_ADMIN_URL`,
                                    so SSR fetch can target an in-cluster origin, client falls back)
    components/
      job-card.tsx                (NEW — server-safe `JobCard` (title/company/location/remote badge/
                                    salary/skills/posted-at) — used by SSR grid + client island + saved)
      job-search-bar.tsx          (NEW — `"use client"` query input + submit, pushes ?q= to the URL)
      filter-sidebar.tsx          (NEW — `"use client"` facet groups: remote_mode/employment_type/level/
                                    salary/skills, reads facet COUNTS from the response, writes URL params)
      sort-control.tsx            (NEW — `"use client"` Select: relevance/recent (best_match in v2.1))
      pagination.tsx              (NEW — `"use client"` prev/next + page N of M from {page,page_size,total};
                                    @ip/ui has no Pagination — build it from Button + buttonVariants)
      job-results.tsx             (NEW — `"use client"` island: owns filter/sort/page state from
                                    searchParams, runs the TanStack `["public-jobs", params]` query,
                                    renders JobCard grid + Skeleton/EmptyState/ErrorState)
      apply-button.tsx            (NEW — `"use client"` island lifted verbatim from today's [id] page:
                                    useRequireAuth + consent localStorage + api.applications.apply +
                                    invalidate ["recommendations"]/["applications"] + router.push("/"))
      save-job-button.tsx         (NEW — `"use client"` bookmark toggle (savedJobs.save/unsave),
                                    optimistic, used on JobCard + detail; authed-only, hidden anon)
    app/
      jobs/page.tsx               (NEW — SSR server component: fetchPublicJobs(searchParams) → first
                                    paint grid + facets; mounts JobSearchBar + FilterSidebar +
                                    SortControl + JobResults island; export `metadata`/`generateMetadata`)
      jobs/[id]/page.tsx          (MODIFY — SSR public detail: fetchPublicJob(id) (404 → notFound());
                                    renders JD + meta; mounts ApplyButton + SaveJobButton islands)
      companies/[id]/page.tsx     (NEW — SSR: fetchPublicCompany(id) + fetchCompanyJobs(id) → brand
                                    header (logo/about/website) + JobCard grid; generateMetadata)
      saved/page.tsx              (NEW — authed client page: savedJobs.listSaved → JobCard grid +
                                    SaveJobButton; CandidateShell; Skeleton/EmptyState)
      alerts/page.tsx             (NEW — authed client page: jobAlerts.list/create/delete CRUD form +
                                    list; CandidateShell)
      sitemap.ts (NEW)   robots.ts (NEW)
    components/candidate-shell.tsx (MODIFY — add Jobs/Saved/Alerts to NAV)
  apps/company/
    lib/upload.ts                 (NEW — `uploadViaPresign(presignFn, file)`: call PresignLogoUpload →
                                    fetch PUT the bytes to the returned URL → return logo_key; mirrors
                                    the resume MIME/size gate; the logo-presign helper)
    components/
      job-form.tsx                (NEW — `"use client"` shared create/edit form: title/jd + the new
                                    fields (city/region/country, remote_mode/employment_type Selects,
                                    salary_min/max/currency, skills CSV→list); used by new + [id])
      logo-upload.tsx             (NEW — `"use client"` logo picker → uploadViaPresign → preview;
                                    PNG/JPG/WEBP + size gate (no SVG); reused by /branding)
    app/
      branding/page.tsx           (NEW — companyProfile.get/upsert editor + LogoUpload; CompanyShell)
      jobs/new/page.tsx           (MODIFY — render JobForm; createJob with the new fields)
      jobs/[id]/page.tsx          (MODIFY — render JobForm prefilled; updateJob with the new fields)
      talent/page.tsx             (MODIFY — add a SearchCandidates query box above the talent table)
    components/company-shell.tsx  (MODIFY — add Branding to NAV)
```

**Responsibilities (one job each):** `job_search.py` = the only place the `$text`/`$facet` pipeline
lives (+ the v2.1 rerank hook). `discovery.py` (resource) = published-only + DTO shaping + the
batched joins; called by BOTH `public_api.py` and `DiscoveryService`. `public_api.py` = Starlette
adapter only (parse/clamp params, rate-limit, cache headers, map resource → JSON). Servicers = gRPC
adapters only. This keeps the contract single-sourced and the adapters dumb.

---

## TIER 0 — data model + indexes (the additive foundation)

### Task 1 — extend `jobs` + new models (TDD)
**Files:** Modify `model/job.py`; Create `model/company_profile.py`, `model/saved_job.py`,
`model/job_alert.py`. Test `tests/test_job_resource.py` (extend).

- [ ] **Step 1 — failing test:** assert a `Job(...)` accepts the new optional fields and that a
  legacy `Job(comp_id=..., title=...)` (no new fields) still validates (back-compat); assert `skills`
  default `[]`, `posted_at` default `None`. Run → FAIL.
- [ ] **Step 2 — implement** the additive fields on `Job` (`city`/`region`/`country: str | None`,
  `remote_mode: str | None`, `employment_type: str | None`, `salary_min`/`salary_max: int | None`,
  `salary_currency: str | None`, `skills: list[str] = []`, `posted_at: datetime | None = None`).
  Create `CompanyProfile` (`comp_id`, `display_name`, `logo_key`, `about`, `website`,
  `locations: list[str]`, `industry`, `size`), `SavedJob` (`candidate_user_id`, `job_id`,
  `created_at`), `JobAlert` (`candidate_user_id`, `query`, `filters: dict`, `frequency`,
  `last_run_at: datetime | None`). Run → PASS.
- [ ] **Step 3 — gate green.**

### Task 2 — indexes in the single authority (`infra/db.py`)
**Files:** Modify `infra/db.py`.

- [ ] **Step 1 — add the index specs** (see spec §3.3): jobs **text** `(title,jd_text,skills)`, jobs
  `(status,posted_at)`, jobs `(status,remote_mode,employment_type)`, jobs `(status,city)`,
  `company_profiles` unique `comp_id`, `saved_jobs` unique `(candidate_user_id,job_id)`, `job_alerts`
  `candidate_user_id`. Add the doc-comment line noting these are catalog/discovery indexes.
- [ ] **Step 2 — verify** `ensure_indexes` is idempotent over the new specs (the existing
  startup path in `main.py` runs `await ensure_indexes(mongo.db, INDEXES)`); if a unit test exists for
  `INDEXES`, extend it; otherwise assert the list parses + has the unique flags.
- [ ] **Step 3 — gate green.**

### Task 2.5 — `posted_at` backfill migration (BLOCKING, TDD)
**Files:** Create `infra/migrations/backfill_posted_at.py` (or extend the startup path in `main.py`
next to `ensure_indexes`). Test `tests/test_posted_at_migration.py`. **Spec §3.3.**

> **Why blocking:** every job published *before* this pillar has `posted_at = null`; without the
> backfill the `recent` sort silently sinks/loses them (Mongo sorts nulls first on a desc sort). The
> migration runs on deploy, in the same startup path as `ensure_indexes`.

- [ ] **Step 1 — failing test:** seed `jobs` with (a) a legacy **published** job with no `posted_at`
  (has `created_at`), (b) a **draft** with no `posted_at`, (c) a published job that already has
  `posted_at`. Run the migration. Assert (a) now has `posted_at == created_at`, (b) stays `None`
  (drafts excluded), (c) is **unchanged** (not overwritten), and a **second run mutates nothing**
  (idempotent — re-running matches zero docs). Run → FAIL.
- [ ] **Step 2 — implement** an idempotent one-shot: `jobs.update_many({"status":"published",
  "posted_at": {"$in":[None]}}, [{"$set":{"posted_at":"$created_at"}}])` (pipeline update so
  `posted_at` inherits each doc's own `created_at`). Wire it into the **startup path** (`main.py`,
  right after `ensure_indexes`) so a deploy backfills before any `recent` query serves traffic. Add
  the bounded-retry/timeout the other startup Mongo calls use. Run → PASS.
- [ ] **Step 3 — null-guard the sorts:** confirm `job_search.search` (Task 3) excludes/handles
  null `posted_at` on `recent`/`best_match` (a job published during the migration window can't make a
  non-deterministic page) — the `_id` tie-break from Task 3 Step 2 covers the residual. Add an
  assertion to `test_job_search_repo.py` that a null-`posted_at` published job never destabilises the
  `recent` page order.
- [ ] **Step 4 — gate green.**

---

## TIER 1 — search repo + resource (failing test → impl; the core of the pillar)

### Task 3 — `job_search` repo: `$text` + `$facet` aggregation (TDD)
**Files:** Create `infra/repositories/job_search.py`. Test `tests/test_job_search_repo.py`.

- [ ] **Step 1 — failing test** against the fake/in-memory Mongo boundary used by the other repo
  tests: seed published + draft jobs; assert (a) a text query returns published matches ranked by
  text score, (b) a `remote_mode` filter narrows results, (c) `sort=recent` orders by `posted_at`
  desc, (d) **a draft never appears**, (e) the facet block returns counts per `remote_mode` /
  `employment_type`, (f) pagination returns `{page, page_size, total}`, (g) **tie-break determinism:
  two jobs with an identical `textScore` (and two with an identical `posted_at`) come back in a
  **stable, repeatable** order across calls** (the `_id` final key), and pagination doesn't drop or
  duplicate a tied row across page boundaries. Run → FAIL.
- [ ] **Step 2 — implement** `search(query, *, filters, sort, page, page_size)` building ONE
  aggregation: `$match {status:"published", ...exact filters}` (+ `$text` stage only when `query` is
  non-empty) → `$facet { page: [$sort, $skip, $limit, $project], counts: [$group per facet],
  total: [$count] }`. **Sort keys (spec §3.1) are compound, with `_id` as the final total-order
  stabiliser** so ties don't yield page-unstable results: `relevance` →
  `{ score: {$meta:"textScore"}, posted_at: -1, _id: 1 }`; `recent` →
  `{ posted_at: -1, _id: 1 }`. The no-text path drops the `$text`/`textScore` stages and sorts by
  `{ posted_at: -1, _id: 1 }`. Trust the index; cap `page_size` at the caller (resource), not here.
  Run → PASS.
- [ ] **Step 3 — gate green.**

### Task 4 — `discovery` resource (TDD — published-only + DTO + batched joins)
**Files:** Create `resources/discovery.py`. Test `tests/test_discovery_resource.py`. (Repos:
`job_search`, existing `jobs`, `match_results`, `company_profiles`.)

- [ ] **Step 1 — failing tests:** `search_jobs(...)` clamps `page_size` to the configured max,
  returns the public-card DTO (assert it carries title/location/remote_mode/salary/skills/posted_at),
  and is **published-only**. A **grep-style absence test** (spec §3.2): seed a job/company doc whose
  Mongo record *also* holds `aptitude_config`, `gate_mode`, `status`, `_id`, applicant/`match_results`
  data, and auth-`companies` fields (`plan`, owner email); serialise the mapped DTO and assert **none
  of those keys appear** (`assert "aptitude_config" not in dto`, `"gate_mode"`, `"applications"`,
  `"plan"`, `"_id"`, `"status"`, …) — proving the mapper is an **allowlist**, not a denylist, so a new
  Mongo field can't auto-leak. `get_public_job_detail` raises `NotFoundError` for a draft/unknown id
  (extends today's `get_public_job` contract). `list_company_published_jobs(comp_id)` returns only
  that company's published jobs. `get_recommended_feed(identity)` joins `match_results.list_by_candidate`
  to jobs and returns full cards via **one `$in` batch** (assert no per-row job read). Run → FAIL.
- [ ] **Step 2 — implement** the four functions; centralize the `_to_public_card` /
  `_to_public_detail` mappers here as **explicit per-field allowlists** (the enumerated subset in spec
  §3.2 — never `dict(doc)` minus a denylist; the security boundary). `search_jobs` delegates the
  pipeline to `job_search`, applies the page-size clamp + DTO map. Run → PASS.
- [ ] **Step 3 — gate green.**

---

## TIER 2 — public REST surface (`/public/*`)

### Task 5 — `create_public_app` Starlette read app (TDD)
**Files:** Create `routes/public_api.py`; Modify `main.py` (dispatcher + build), `config.py`
(page-size max, rate-limit limit/window, cache TTL). Test `tests/test_public_api.py`.

- [ ] **Step 1 — config:** add `public_page_size_max` (e.g. 50), `public_rate_limit_per_min`,
  `public_rate_limit_window_seconds`, `public_cache_max_age_seconds` (60) to `config.py` (mirror the
  existing Settings pattern).
- [ ] **Step 2 — failing test** (Starlette `TestClient` over `create_public_app(deps)` with fake
  repos + a fake `RateLimiter`): `GET /public/jobs` → 200 with `{jobs, facets, page, page_size,
  total}`; `GET /public/jobs/{draft_id}` → **404**; `GET /public/companies/{id}` → 200 /
  `GET /public/companies/{unknown}` → 404; `GET /public/companies/{id}/jobs` → 200; **`page_size`
  above max is clamped**; **429 with `Retry-After` AND an opaque body when the limiter returns `not
  allowed`** — assert the body is the fixed `{"error":"rate_limited"}` and **leaks no quota/limit/
  remaining/per-endpoint detail** (mirror `routes/oauth.py` refresh tests); `Cache-Control: public,
  max-age=60` present on 200, `no-store` on error; **the grep-style absence test** — assert the
  response JSON string contains **none** of `aptitude_config`/`gate_mode`/`applications`/
  `match_results`/`plan`/`_id`/`status`/any internal-`comp_id` handle. Run → FAIL.
- [ ] **Step 3 — implement** `make_public_routes(deps)` + `create_public_app(deps)` mirroring
  `create_oauth_app`: each handler is thin — `_client_ip` + `RateLimiter.hit` gate (reuse oauth's
  trusted-proxy logic) returning an **opaque 429** (fixed `{"error":"rate_limited"}` + `Retry-After`,
  nothing else), parse/clamp query params, call the `discovery` / `company_profile` resource, return
  `JSONResponse` with `Cache-Control: public, max-age={public_cache_max_age_seconds}` (the **≤ 60 s
  edit-visibility tradeoff is intended** — spec §3.2). Map `NotFoundError` → 404 with `no-store`.
  **No query logic here.** Run → PASS.
- [ ] **Step 4 — wire `main.py`:** extend `_oauth_dispatcher` to also route `path.startswith("/public/")`
  → `public_app` (else unchanged); build `public_app = create_public_app({... "limiter":
  RateLimiter(redis), "jobs": JobRepository(...), "job_search": JobSearchRepository(...),
  "company_profiles": CompanyProfileRepository(...), "settings": s, "trusted_proxy": s.trusted_proxy
  })`. (No media/auth flows through it — read-only.)
- [ ] **Step 5 — gate green** + manual: `curl -s localhost:<port>/public/jobs` (no token) returns
  published-only.

---

## TIER 3 — candidate SSR pages (the front door — the biggest FE surface in v2)

> **Architecture for this tier (read once).** Public pages are **SSR server components** that do a
> token-free `fetch` of `/public/*` for a crawlable first paint; **interactivity is isolated into
> `"use client"` islands** mounted inside the server-rendered shell. The split:
> - **Server component (no `"use client"`):** the route's `page.tsx`. Reads `searchParams`/`params`,
>   calls the **shared SSR data layer** (`@ip/shared` `fetchPublicJobs/fetchPublicJob/…`, plain
>   `fetch`, `cache: "no-store"` or `next.revalidate`), renders the static frame (header, grid of
>   `JobCard`, facet sidebar shell) from the fetched data, and exports `metadata`/`generateMetadata`.
>   No hooks, no `useAuth`, no TanStack here — it runs server-side and must render for an anonymous,
>   token-less request.
> - **Client islands (`"use client"`):** the interactive bits — `JobResults`, `JobSearchBar`,
>   `FilterSidebar`, `SortControl`, `Pagination`, `ApplyButton`, `SaveJobButton`. They use `useAuth`,
>   TanStack Query, `next/navigation` (`useRouter`/`useSearchParams`). Anonymous-safe islands
>   (search/filter/results) work with **no token over plain `fetch`**; authed-only islands
>   (`ApplyButton`, `SaveJobButton`) gate on `useRequireAuth`/token and are hidden/redirecting when
>   signed-out.
> - **Server-side fetch origin.** `NEXT_PUBLIC_ADMIN_URL` is inlined at build for the browser; SSR
>   `fetch` runs on the Node server and may need an in-cluster origin. `apps/candidate/lib/public-url.ts`
>   `publicApiBase()` returns `process.env.ADMIN_INTERNAL_URL ?? process.env.NEXT_PUBLIC_ADMIN_URL ??
>   "http://localhost:8080"`; the shared `fetchPublic*` helpers take the base as an arg (framework-free).
> - **`@ip/ui` only; design tokens only.** Reuse `Card/CardContent`, `Badge` (`tone`/`variant`),
>   `Select*`, `Button/buttonVariants`, `Input`, `Field`, `Checkbox`, `Skeleton`, `EmptyState`,
>   `ErrorState`, `LoadingState`, `PageHeader`, `cn`. **No raw hex** — `text-foreground`,
>   `text-muted-foreground`, `bg-surface-muted`, `text-brand-500`, `border-border`, etc. (mirror
>   `recommended-roles.tsx`/`dashboard.tsx`). `@ip/ui` has **no Pagination** — build `Pagination` from
>   `Button`. Every page is responsive (sidebar collapses under `lg:`, grid `grid-cols-1 sm:grid-cols-2
>   lg:grid-cols-3`) and dark-mode correct via tokens.

### Task 6a — shared SSR data layer for `/public/*` (the FE half of the contract)
**Files:** Create `packages/shared/src/public-api.ts`; Modify `packages/shared/src/index.ts`; Create
`apps/candidate/lib/public-url.ts`.

- [ ] **Step 1 — types + fetchers.** In `public-api.ts` declare the FE-side DTO types **mirroring the
  resource's `_to_public_card`/`_to_public_detail`** (the strict subset — never internal handles):
  `PublicJobCard { jobId, title, companyName, companyId, city?, region?, country?, locationLabel?,
  remoteMode?, employmentType?, salaryMin?, salaryMax?, salaryCurrency?, skills: string[], postedAt? }`,
  `PublicJobDetail extends PublicJobCard { jdText, companyLogoUrl?, companyAbout? }`,
  `PublicCompanyProfile { companyId, displayName, logoUrl?, about?, website?, locations: string[],
  industry?, size? }`, `Facets { remoteMode: {value,count}[]; employmentType: {…}[]; … }`,
  `JobSearchResult { jobs: PublicJobCard[]; facets: Facets; page; pageSize; total }`. Implement
  `fetchPublicJobs(base, params: URLSearchParams): Promise<JobSearchResult>`,
  `fetchPublicJob(base, id): Promise<PublicJobDetail | null>` (null on 404 — the caller maps to
  `notFound()`), `fetchPublicCompany(base, id): Promise<PublicCompanyProfile | null>`,
  `fetchCompanyJobs(base, id, params): Promise<{ jobs; page; pageSize; total }>`. All use plain
  `fetch` (NO token, NO `authedFetch`), set `headers: { accept: "application/json" }`, and a sane
  timeout via `AbortSignal.timeout(...)`; non-2xx (≠404) throws `HttpError` (reuse `errors.ts`) so the
  client island's `ErrorState` can render + retry. These same helpers serve **SSR (server)** and the
  **anonymous client island (browser)** — one code path, two callers.
- [ ] **Step 2 — re-export** the helpers + the `Public*`/`JobSearchResult`/`Facets` types from
  `packages/shared/src/index.ts`; add `publicApiBase()` in `apps/candidate/lib/public-url.ts`.
- [ ] **Step 3 — `@ip/shared` typecheck green.**

### Task 6b — `/jobs` SSR search index + filter/results islands
**Files:** Create `apps/candidate/app/jobs/page.tsx`; Create `components/job-card.tsx`,
`components/job-search-bar.tsx`, `components/filter-sidebar.tsx`, `components/sort-control.tsx`,
`components/pagination.tsx`, `components/job-results.tsx`.

- [ ] **Step 1 — `JobCard` (server-safe, no `"use client"`).** Props: `job: PublicJobCard` + optional
  `action?: ReactNode` slot (so `/saved` can drop a `SaveJobButton` in). Renders an `@ip/ui` `Card`
  (mirror `recommended-roles.tsx`'s `Card hoverable` + `CardContent`): title as a `Link` to
  `/jobs/{jobId}`, company name (link to `/companies/{companyId}`), a location string
  (`locationLabel` or `city, region` joined), `Badge`s for `remoteMode`/`employmentType`, a salary
  line (`formatSalary(min,max,currency)` — a small pure helper, omit when absent), up to ~6 skill
  `Badge`s (`tone="neutral"`), and a "Posted {relativeTime(postedAt)}" caption. Pure presentational —
  importable by both server and client trees.
- [ ] **Step 2 — interactive islands (`"use client"`).** All read/write the **URL searchParams** as
  the single source of truth (so SSR first paint, back/forward, and shareable filtered links all
  agree); each uses `useRouter()` + `useSearchParams()` and pushes a new query string (no local
  mirror state to drift):
  - `JobSearchBar` — `@ip/ui` `Input` + submit `Button`; on submit sets `?q=` (debounce optional),
    resets `?page=1`.
  - `FilterSidebar` — facet groups for `remoteMode`, `employmentType`, `level`, salary band, `skills`.
    Renders the **facet counts** from the current `JobSearchResult.facets` (e.g. "Remote (12)") using
    `Checkbox`/`RadioGroup`; toggling a facet rewrites the matching URL param + resets `page`. Collapses
    into a `Dialog`/`Sheet`-style "Filters" `Button` under `lg:` for mobile.
  - `SortControl` — `@ip/ui` `Select` (`relevance` default, `recent`; `best_match` appears in v2.1 —
    leave the option list extensible); writes `?sort=`.
  - `Pagination` — built from `Button`/`buttonVariants` (no `@ip/ui` Pagination): "Prev/Next" +
    "Page {page} of {ceil(total/pageSize)}"; disables Prev on page 1, Next past the last page; writes
    `?page=`.
  - `JobResults` — the **data island**. Reads `searchParams` via `useSearchParams()`, builds a
    `URLSearchParams`, runs `useQuery({ queryKey: ["public-jobs", paramsString], queryFn: () =>
    fetchPublicJobs(base, params) })` (`base` from `NEXT_PUBLIC_ADMIN_URL` for the browser; **authed
    users may instead call `api.discovery.searchJobs` when a token is present** — same DTO, identical
    cards). It hydrates from the SSR result via `initialData`/`placeholderData` so the first client
    render matches the server paint (no flash). States: `isLoading`/`isFetching` → `Skeleton` grid
    (~6 `JobCard`-shaped skeletons); empty `jobs` → `EmptyState` ("No jobs match your filters", with a
    "Clear filters" action that resets the URL); `isError` → `ErrorState` + `retry={() => refetch()}`.
    On success renders the `JobCard` grid + `Pagination`. It also feeds the live `facets` down to
    `FilterSidebar` (lift via a shared parent or a light context).
- [ ] **Step 3 — `app/jobs/page.tsx` (SSR server component).** `export default async function` taking
  `{ searchParams }`; build a `URLSearchParams` from them, `const data = await
  fetchPublicJobs(publicApiBase(), params)`. Render a two-column layout (sidebar + main) inside a
  plain `<main>` (NOT `CandidateShell` — this is a public page; use a lightweight public header with
  the `Logo` + a "Sign in" link, and `ThemeToggle`). Mount `JobSearchBar`, `FilterSidebar`
  (seeded with `data.facets`), `SortControl`, and `JobResults` (seeded with `data` as `initialData`).
  Export `generateMetadata` (title "Browse jobs", description, canonical) for SEO. Renders fully for an
  **anonymous, token-less** request.
- [ ] **Step 4 — `sitemap.ts` + `robots.ts`.** `sitemap.ts` (`MetadataRoute.Sitemap`) pages through
  `fetchPublicJobs` (and company URLs) server-side to enumerate `/jobs/{id}` + `/companies/{id}`;
  `robots.ts` (`MetadataRoute.Robots`) allows crawling and points `sitemap` at the absolute sitemap URL.
- [ ] **Step 5 — verify:** `--filter @ip/candidate build` green; manual check the page renders the
  grid + facet counts with **no token** (anonymous), filters/sort/paginate update the URL and re-query,
  and the layout is correct at ~375px (sidebar collapses) and in dark mode.

### Task 7 — `/jobs/[id]` SSR detail + Apply/Save islands; `/companies/[id]`; `/saved`; `/alerts`
**Files:** Modify `apps/candidate/app/jobs/[id]/page.tsx`; Create `components/apply-button.tsx`,
`components/save-job-button.tsx`, `app/companies/[id]/page.tsx`, `app/saved/page.tsx`,
`app/alerts/page.tsx`; Modify `components/candidate-shell.tsx`.

- [ ] **Step 1 — `ApplyButton` island (`"use client"`) — lift the existing flow VERBATIM.** Extract
  today's `app/jobs/[id]/page.tsx` apply logic into `components/apply-button.tsx` with prop
  `jobId: string`, **byte-for-byte preserving**: `const { api, token, ready } = useAuth()` +
  `useRequireAuth(token, ready)`; `consentKey = \`job-consent:${jobId}\`` + the `useState`/`useEffect`
  `localStorage` restore + `toggleConsent` persistence; the `Checkbox` ("I consent to AI-assisted
  screening…"); the `useMutation({ mutationFn: () => api.applications.apply({ jobId, consent }) })`
  with `onSuccess`: `toast.success("Application submitted")`, `localStorage.removeItem(consentKey)`,
  `queryClient.invalidateQueries(["recommendations"])`, `invalidateQueries(["applications"])`,
  `router.push("/")`; `onError: toast.error(errorMessage(err))`; the disabled/`loading` Apply `Button`.
  **Do not change the apply contract, the consent key, or the invalidation set** — this is the funnel
  regression baseline. When signed-out, the existing `useRequireAuth` redirect to sign-in fires on
  mount of the island after a click-through, preserving anon → sign-in → consent → apply.
- [ ] **Step 2 — `SaveJobButton` island (`"use client"`).** Prop `jobId`. Authed-only (returns
  `null` when no token). A bookmark toggle backed by `api.savedJobs.save/unsave` with an **optimistic**
  `useMutation` over the `["saved-jobs"]` cache (toggle immediately, roll back on error,
  `invalidateQueries(["saved-jobs"])` on settle); `toast` on error only. Reused on `JobCard`'s
  `action` slot and the detail page.
- [ ] **Step 3 — `/jobs/[id]` SSR detail (rewrite to a server component).** `export default async
  function` taking `{ params }`; `const job = await fetchPublicJob(publicApiBase(), params.id)`;
  `if (!job) notFound()` (Next's `not-found.tsx` already exists). Render the JD + meta server-side
  (title, company link, location/remote/employment `Badge`s, salary, skills, `posted_at`,
  `whitespace-pre-wrap` `jdText` — mirroring today's card body but from the public DTO) in a public
  `<main>` frame; mount `<ApplyButton jobId={params.id} />` + `<SaveJobButton jobId={params.id} />`
  as the only client islands. `generateMetadata` from the job (title/company/description) for
  crawlable, shareable link previews. **No `useRequireAuth` on the page** (it's public now); auth lives
  in the Apply island.
- [ ] **Step 4 — `/companies/[id]` SSR page.** `const [company, jobs] = await Promise.all([
  fetchPublicCompany(base, id), fetchCompanyJobs(base, id, params) ])`; `if (!company) notFound()`.
  Brand header (`Avatar`/logo from `company.logoUrl`, `displayName`, `about`, `website` link,
  `locations`/`industry`/`size` `Badge`s) + a `JobCard` grid of the company's published jobs +
  `Pagination`. `generateMetadata` from the company. Public frame, no auth.
- [ ] **Step 5 — `/saved` (authed client page).** `"use client"` under `CandidateShell`;
  `useRequireAuth`; `useQuery({ queryKey: ["saved-jobs"], queryFn: () =>
  api.savedJobs.listSaved({}) })` → `JobCard` grid with a `SaveJobButton` in each card's `action`
  slot (un-saving removes it); `Skeleton` while loading, `EmptyState` ("No saved jobs yet" → link to
  `/jobs`), `ErrorState` + retry.
- [ ] **Step 6 — `/alerts` (authed client page).** `"use client"` under `CandidateShell`;
  `useRequireAuth`. A create form (`Input` for query + the same facet `Select`s as search + a
  `frequency` `Select` daily/weekly) → `api.jobAlerts.create`; a list of existing alerts
  (`useQuery(["job-alerts"], jobAlerts.list)`) each with a `ConfirmDialog`-gated Delete
  (`jobAlerts.delete`, invalidate `["job-alerts"]`). Note in a one-line comment that **alert
  *execution* (scheduled run + notify) is a Pillar-D follow-up**, not wired here — this page is CRUD
  over the saved searches.
- [ ] **Step 7 — nav + verify.** Add `Jobs` (`/jobs`), `Saved` (`/saved`), `Alerts` (`/alerts`) to
  `candidate-shell.tsx`'s `NAV`. `--filter @ip/candidate build` green; manual **headline E2E**:
  anonymous `/jobs` → `/jobs/[id]` (SSR, crawlable) → click Apply → sign-in (SSO) → consent → apply
  completes and lands in the funnel exactly as today; saving a job from a card appears in `/saved`.

---

## TIER 4 — authed discovery services + `pnpm gen`

### Task 8 — `DiscoveryService` (SearchJobs + GetRecommendedFeed) (TDD)
**Files:** Create `routes/pb/discovery.proto`, `routes/discovery.py`; Modify `routes/web.py`. Test
`tests/test_discovery_service.py`. Then `pnpm gen` + wire the client.

- [ ] **Step 1 — proto:** `DiscoveryService { SearchJobs(...) returns (SearchJobsResponse);
  GetRecommendedFeed(...) returns (SearchJobsResponse); }` with a `JobCard` message (the public-card
  fields) + facets + paging. Additive package, new file.
- [ ] **Step 2 — failing servicer test** (mirror `test`s for the job/recommendation servicers):
  `SearchJobs` returns the same cards as the resource; `GetRecommendedFeed` for a candidate returns
  full cards joined from `match_results` (assert batched, not N+1); role/tenant scoping. Run → FAIL.
- [ ] **Step 3 — implement** the servicer (thin adapter → `resources/discovery.*`, `caller_identity`
  + `_STATUS` abort pattern from `routes/auth.py`); register in `routes/web.py`
  (`discovery_pb2_grpc.add_DiscoveryServiceServicer_to_server(...)`). Run → PASS.
- [ ] **Step 4 — `pnpm gen` + wire the client.** `npx pnpm@9.15.0 --filter @ip/api-client gen`. In
  `frontend/packages/api-client/src/index.ts` add the **four-touch quad** for `DiscoveryService`
  (mirror every existing service exactly): the `import { DiscoveryService } from "./gen/discovery_pb.js"`,
  the `export * from "./gen/discovery_pb.js"`, the `discovery: Client<typeof DiscoveryService>` field
  on `ApiClients`, and `discovery: createClient(DiscoveryService, transport)` in `clientsFromTransport`.
  `--filter @ip/api-client typecheck` green.
- [ ] **Step 5 — gate green + repoint the recommended feed.** Upgrade the candidate dashboard's
  "Recommended for you" from the bare-match widget to the full-card feed: change
  `components/recommended-roles.tsx` to `useQuery({ queryKey: ["recommendations"], queryFn: () =>
  api.discovery.getRecommendedFeed({}) })` and render the returned `JobCard`s (reuse Task 6b's
  `JobCard`) instead of the `{score, reasons}` stub — **keep the `["recommendations"]` query key
  unchanged** so the apply/withdraw invalidations in `dashboard.tsx` and `apply-button.tsx` still
  refresh it. The match score/reasons can ride along on the card (or drop to a "X% match" `Badge`) but
  the link target stays `/jobs/{jobId}`. `--filter @ip/candidate build` green.

### Task 9 — `SavedJobsService` + `JobAlertsService` (TDD)
**Files:** Create `routes/pb/saved_jobs.proto`, `routes/pb/job_alerts.proto`, `routes/saved_jobs.py`,
`routes/job_alerts.py`, `resources/saved_jobs.py`, `resources/job_alerts.py`,
`infra/repositories/saved_jobs.py`, `infra/repositories/job_alerts.py`; Modify `routes/web.py`. Tests
`tests/test_saved_jobs.py`, `tests/test_job_alerts.py`. Then `pnpm gen` + `/saved` + `/alerts` pages.

- [ ] **Step 1 — failing resource tests:** `saved_jobs.save` is idempotent (unique
  `(candidate_user_id,job_id)`), `unsave` removes, `list_saved` returns full cards via a **batched**
  job join (candidate-scoped, never another user's). `job_alerts` create/list/delete candidate-scoped
  over `JobAlert`. Run → FAIL.
- [ ] **Step 2 — implement** resources + repos + thin servicers; register in `routes/web.py`. Run →
  PASS.
- [ ] **Step 3 — `pnpm gen` + wire `savedJobs`/`jobAlerts` clients.** `npx pnpm@9.15.0 --filter
  @ip/api-client gen`; add the import + `export *` + `ApiClients` field + `clientsFromTransport`
  `createClient` quad for **both** `SavedJobsService` (`savedJobs`) and `JobAlertsService`
  (`jobAlerts`) in `frontend/packages/api-client/src/index.ts`. This unblocks the `/saved` + `/alerts`
  pages and the `SaveJobButton` island already specified in **Task 7 (Steps 2, 5, 6)** — confirm
  those compile against the generated clients (`api.savedJobs.save/unsave/listSaved`,
  `api.jobAlerts.create/list/delete`). `--filter @ip/api-client typecheck` + `--filter @ip/candidate
  build` green.
- [ ] **Step 4 — gate green.** (NB: scheduled alert *execution* — a `job_alerts` pass in `main.py`'s
  `run_schedulers` fanning into Pillar-D notifications — is an explicit follow-up, NOT this task.)

---

## TIER 5 — company branding + extended job form

### Task 10 — `CompanyProfileService` (Get/Upsert/PresignLogoUpload) (TDD)
**Files:** Create `routes/pb/company_profile.proto`, `routes/company_profile.py`,
`resources/company_profile.py`, `infra/repositories/company_profiles.py`; Modify `routes/web.py`.
Test `tests/test_company_profile.py`. Then `pnpm gen` + the `/branding` page.

- [ ] **Step 1 — failing tests:** `company_profile.upsert` is manager-scoped + comp-scoped (1:1 unique
  `comp_id`); `get` returns the brand doc; `get_public(comp_id)` returns the public subset (no auth
  `companies` fields); `presign_logo_upload` returns a presigned PUT URL via `ObjectStorage`
  presign (TTL-clamped, like `presigned_get_url`) with a **content-type allowlist + size cap** (spec
  §3.4, mirror the résumé validation in `resources/profile.py`): assert a request with a
  **disallowed content-type is rejected** (only `image/png`, `image/jpeg`, `image/webp` mint a URL —
  **SVG is rejected**, script-injection risk), a request **over `logo_max_bytes` is rejected** (the
  cap rides as a presign `content-length-range` condition), and the object key is **namespaced under
  the caller's `comp_id`** (from the token, never client input) so a presign can't target another
  tenant's prefix. Run → FAIL.
- [ ] **Step 2 — implement** resource + repo (writing `company_profiles`, **never** the auth
  `companies` doc) + thin servicer; register in `routes/web.py`. Add `logo_max_bytes` (~2 MB) +
  `logo_allowed_content_types` (`{"image/png","image/jpeg","image/webp"}`) to `config.py`; the
  resource rejects an off-allowlist content-type or an over-cap size **before** minting the URL, binds
  the content-type + a `content-length-range` on the presign, and builds the key under the caller's
  `comp_id`. Run → PASS.
- [ ] **Step 3 — `pnpm gen` + wire `companyProfile` + build `/branding`.** `npx pnpm@9.15.0 --filter
  @ip/api-client gen`; add the `companyProfile` quad to `ApiClients`/`clientsFromTransport` in
  `frontend/packages/api-client/src/index.ts`. Then:
  - **`apps/company/lib/upload.ts` — `uploadViaPresign(presignFn, file)`** (the new logo-upload
    helper; resume upload is gRPC-bytes, so presign is genuinely new). Steps: validate MIME + size
    client-side (mirror `profile/page.tsx`'s `ACCEPTED_MIME` set + `MAX_*_BYTES` gate, but for images
    — **`image/png` / `image/jpeg` / `image/webp` only (no SVG — script risk), ~2 MB** to match the
    server `logo_max_bytes` from Task 10 Step 2; this client check is a courtesy, the server presign
    is the real guard); call `presignFn({ contentType, size })` →
    `api.companyProfile.presignLogoUpload(...)` returning `{ url, logoKey }`; `await fetch(url, {
    method: "PUT", body: file, headers: { "content-type": file.type } })` direct to S3/MinIO (plain
    `fetch`, **not** `authedFetch` — the presigned URL carries its own auth); throw on non-2xx; return
    `logoKey`. Keep the chosen file on failure so the user can retry (mirror `profile/page.tsx`).
  - **`components/logo-upload.tsx` (`"use client"`)** — a file picker (`sr-only input` + styled
    `label` via `buttonVariants`, exactly like the resume picker; `accept="image/png,image/jpeg,
    image/webp"`) that runs `uploadViaPresign`, shows a `Spinner` while uploading, then previews the
    logo (`Avatar`/`img` from the uploaded key) and calls back with `logoKey`. Surface a clear
    validation `Alert` when the file is the wrong type or over the size cap (mirror the résumé picker).
  - **`apps/company/app/branding/page.tsx`** — under `CompanyShell`; `useQuery(["company-profile"],
    () => api.companyProfile.get({}))` to seed the form (`displayName`, `about`, `website`,
    `locations`, `industry`, `size` via `@ip/ui` `Field`/`Input`/`Textarea`/`Select`); a `LogoUpload`
    that sets `logoKey` in form state; Save → `api.companyProfile.upsert({ ...form, logoKey })`,
    `toast.success`, `invalidateQueries(["company-profile"])`. `LoadingState`/`ErrorState` on the
    query; `Alert` for validation. Add `Branding` (`/branding`) to `company-shell.tsx`'s `NAV`.
- [ ] **Step 4 — gate green** + `--filter @ip/company build` green.

### Task 11 — extend `JobService` + job create/edit forms (TDD)
**Files:** Modify `routes/pb/job.proto` (additive fields + `UpdateJob`), `routes/job.py`,
`resources/job.py`; Test `tests/test_job_resource.py`. Then `pnpm gen` + the company job forms.

- [ ] **Step 1 — failing tests:** `create_job` accepts + persists the new fields (skills lowercased);
  a new `update_job` (manager + comp-scoped) edits them; **`publish_job` stamps `posted_at = now`**
  at the `status → published` flip (drafts have none); `get_public_job` returns the new display
  fields. Run → FAIL.
- [ ] **Step 2 — implement:** thread the new fields through `create_job` / `update_job` (lowercase
  `skills`), add `posted_at = now` in `publish_job`, extend `get_public_job`'s returned dict + the
  `_to_response` / public mappers. Additive proto fields (preserve existing field numbers); add
  `UpdateJob` RPC. Run → PASS.
- [ ] **Step 3 — `pnpm gen` + extend the company job forms via a shared `JobForm`.** `npx
  pnpm@9.15.0 --filter @ip/api-client gen` (regenerates `job_pb.ts` with the additive fields +
  `UpdateJob`; `JobService` already exists, so no new quad — just the wider message types).
  - **`apps/company/components/job-form.tsx` (`"use client"`)** — factor the create/edit fields into
    one component (`apps/company/app/jobs/new/page.tsx` is currently inline; `[id]` mirrors it). Props:
    `initial?: JobFormValues`, `submitting: boolean`, `onSubmit(values)`, plus the existing
    "Improve with AI" affordance (`jdClient.improve`, kept verbatim). Fields: `title` (`Input`,
    required — keep the existing `titleError` validation + double-submit `useRef` latch), `jdText`
    (`Textarea`), `city`/`region`/`country` (`Input`s in a responsive grid), `remoteMode` (`Select`:
    remote/hybrid/onsite — reuse the exact vocabulary from `profile/page.tsx`'s job-preference
    `Select`), `employmentType` (`Select`: full_time/contract/internship — fixed enum per spec §6 open
    question), `salaryMin`/`salaryMax` (`type="number"` `Input`s) + `salaryCurrency` (`Select`/`Input`,
    ISO), `skills` (comma-separated `Input` → `split(",").map(trim).filter(Boolean)`, **exactly like
    `profile/page.tsx`'s skills field**; the resource lowercases on write).
  - **`jobs/new/page.tsx` (MODIFY)** — render `<JobForm onSubmit={(v) => create.mutate(v)} … />`;
    `create` calls `api.jobs.createJob({ title, jdText, city, region, country, remoteMode,
    employmentType, salaryMin, salaryMax, salaryCurrency, skills })`; on success
    `router.push(\`/jobs/${res.jobId}\`)` (unchanged).
  - **`jobs/[id]/page.tsx` (MODIFY)** — load the job, render `<JobForm initial={…} onSubmit={(v) =>
    update.mutate(v)} />` where `update` calls the new `api.jobs.updateJob({ jobId, ...v })`; keep the
    existing publish/status controls on that page intact.
- [ ] **Step 4 — gate green** + `--filter @ip/company build` green.

---

## TIER 6 — employer sourcing

### Task 12 — `SearchCandidates` over own-company applicants (TDD)
**Files:** Create `resources/sourcing.py` + the proto/servicer (a small `SourcingService`, or add
`SearchCandidates` to `DiscoveryService`); Modify `routes/web.py`. Test `tests/test_sourcing.py`.
Then `pnpm gen` + extend `/talent`.

- [ ] **Step 1 — failing tests:** `sourcing.search_candidates(identity, query)` is **manager-scoped**,
  searches **only the company's own applicants** (spec §3.4 — the universe = **every candidate with an
  application to ANY job owned by this `comp_id`**, the seed set reused from the application repo as
  `resources/talent.py` already does, joined to the talent/profile repo for the skill/experience text
  the keyword match runs over) and returns **no ID/background/biometric data** (human-in-the-loop
  result set only). Assert: (a) a candidate of **another company never appears** (seed an applicant to
  a different `comp_id` → absent); (b) an applicant in a **`rejected`** state **still surfaces**;
  (c) an applicant to a **`closed`/`paused`** job **still surfaces** — the universe is
  application-existence, **not** current funnel state; (d) there is **no global candidate index** path
  (a candidate who never applied here is unreachable). Run → FAIL.
- [ ] **Step 2 — implement** the resource (comp-scoped keyword match over own applicants' profile
  text — seed candidate ids from the application repo scoped to the token's `comp_id`, never client
  input; **don't** filter by funnel state, so rejected/closed-job applicants remain searchable) + thin
  servicer; register in `routes/web.py`. Run → PASS.
- [ ] **Step 3 — `pnpm gen` + add the `SearchCandidates` box to `/talent`.** `npx pnpm@9.15.0
  --filter @ip/api-client gen`; if `SearchCandidates` rides on `DiscoveryService`, the `discovery`
  client already exists — else add the `sourcing` quad. In `apps/company/app/talent/page.tsx`
  (currently a `getTalentPool` table) add a search affordance **above** the existing table: an
  `@ip/ui` `Input` + `Button` (or a `Field`) bound to a `query` state; a `useQuery({ queryKey:
  ["candidate-search", query], enabled: query.length > 0, queryFn: () =>
  api.discovery.searchCandidates({ query }) })`. When `query` is empty, render the existing full talent
  pool table unchanged; when a query is present, render the **results** in the same `Table`/card shape
  (candidate id + applicationCount, the same masked-handle treatment — `slice(0,12)` mono — since the
  result set carries **no ID/background/biometric data**, only the human-in-the-loop fields).
  `Skeleton`/`LoadingState` while fetching, `EmptyState` ("No candidates match") for an empty result.
- [ ] **Step 4 — gate green** + `--filter @ip/company build` green.

---

## TIER 7 — (v2.1) semantic `best_match` rerank

### Task 13 — `jobs:catalog` Qdrant collection + publish/edit upsert (TDD)
**Files:** Modify `src/ai-agents/app/resources/matcher.py` (or `handlers.py`) + the ai-agents vector
infra; the rerank hook in `infra/repositories/job_search.py`. Tests in ai-agents + admin (fake Qdrant
client).

- [ ] **Step 1 — failing test (ai-agents):** on a `job.published` / `job.edited` event, the handler
  embeds `jd_text` (the matcher already does this) and **upserts** the JD vector into `jobs:catalog`
  keyed by `job_id`; on unpublish/close it **deletes**. Use a fake/injected vector client — no
  network. Add (spec §3.1): (a) a **debounce test** — N rapid `job.edited` events for the **same**
  `job_id` within the quiet window collapse into a **single** upsert of the **latest** `jd_text` (not
  N embeds), while a **delete is immediate** (not debounced); (b) an **upsert-failure test** — when
  the vector client raises, the handler **logs a structured warning and does NOT propagate** (publish
  is never blocked; it runs off the publish path), and the next reconcile pass repairs it. Run → FAIL
  → implement → PASS.
- [ ] **Step 1b — reconcile sweep (TDD).** Add a `jobs:catalog` reconcile pass to `main.py`'s
  `run_schedulers` (alongside the existing retention/aptitude-expiry passes): diff published `jobs`
  against `jobs:catalog`, **re-upsert** any missing/stale vector and **delete** any orphan (vector for
  a job no longer published), so the catalog is **eventually consistent** with Mongo after any dropped
  upsert. Test against the fake vector client: seed a published job with no vector + an orphan vector;
  assert the sweep upserts the former and deletes the latter. Run → FAIL → implement → PASS.
- [ ] **Step 2 — failing test (admin):** `job_search.search(..., sort="best_match")` retrieves a
  candidate set from `jobs:catalog` (query embedding, or the logged-in candidate's profile embedding)
  and **re-ranks** the `$text`/filter result by semantic score; `$text` remains the candidate-set
  generator and the anonymous default. Fake Qdrant client; assert ordering. Run → FAIL → implement →
  PASS.
- [ ] **Step 3 — expose `sort=best_match`** through `discovery.search_jobs` → `/public/jobs` +
  `DiscoveryService.SearchJobs`; default sort stays `relevance`/`recent`.
- [ ] **Step 4 — gate green** (no network in tests — the Qdrant client is an injected seam).

---

## Resolved gaps (completeness audit 2026-06-19)

The completeness audit (`2026-06-19-v2-completeness-audit.md`, Part B → Inc 1) flagged these
blocking/high gaps; each is now woven into the tasks above. This is the closure index for a reviewer.

| # | Gap | Sev | Task(s) | What landed |
|---|---|---|---|---|
| 1 | `$text` tie-break undefined | 🟠 | Task 3 | Compound sorts with `_id` final key (`relevance`=`{score,posted_at desc,_id}`, `recent`=`{posted_at desc,_id}`) + a determinism/pagination-stability test |
| 2 | `posted_at` migration missing | 🔴 | **Task 2.5** (new) | One-shot idempotent backfill on deploy (published null → `created_at`, drafts stay null) + null-sort guard in Task 3 + idempotency test |
| 3 | Public DTO whitelist not enumerated | 🟠 | Task 4, Task 5 | Allowlist mappers (not denylist) + a grep-style absence test at both the resource and `/public/*` layers (asserts `aptitude_config`/`gate_mode`/applicant/`plan`/`_id` absent) |
| 4 | Qdrant rerank freshness/consistency | 🟠 | Task 13 (+ Step 1b) | Per-`job_id` debounce (latest JD, deletes immediate); best-effort off the publish path (log on fail, never block); reconcile sweep in `run_schedulers` for eventual consistency |
| 5 | Logo upload type/size validation | 🟠 | Task 10 | `image/{png,jpeg,webp}` allowlist + `logo_max_bytes` cap as presign conditions + comp-scoped key; SVG dropped (was erroneously listed); FE MIME/size gate aligned |
| 6 | `SearchCandidates` universe undefined | 🟠 | Task 12 | Universe = applicants to any of this comp's jobs (reuse application+talent repos); rejected/closed-job applicants stay searchable; no global index; tests for each |
| 7 | `/public/*` CDN staleness (60s) | 🟠 | Task 5 | `max-age=60` documented as the intended ≤60 s edit-visibility tradeoff for v2 (CDN-invalidate-on-publish a later option) |
| 8 | Public rate-limit leak | 🟠 | Task 5 | Opaque 429 — fixed `{"error":"rate_limited"}` body + `Retry-After` only; test asserts no quota/limit/detail leak |

## Verification (end to end)

1. **Per task:** `bash scripts/check.sh` GREEN (grows from **423**); new vector/infra code sits behind
   injected seams (fake Qdrant client) so the gate stays offline.
2. **Search correctness (offline):** `test_job_search_repo.py` + `test_discovery_resource.py` prove
   text/facet/sort/pagination, **published-only**, page-size clamp, the **enumerated strict-subset
   public DTO** (grep-style absence test), the **compound-sort tie-break determinism** (ties are
   page-stable via `_id`), and the **null-`posted_at` sort guard**. `test_posted_at_migration.py`
   proves the backfill is idempotent and excludes drafts.
3. **Public surface:** `test_public_api.py` proves 200 shapes, **404 for unpublished/unknown**,
   page-size clamp, **opaque 429 + `Retry-After`** on the IP limit (no quota/detail leak),
   `Cache-Control: public, max-age=60`, and the **grep-style no-field-leak** assertion.
4. **Authed services:** servicer tests prove role/tenant scoping, the **batched** feed/saved joins,
   and `SearchCandidates` = own-company applicants only (rejected/closed-job applicants still
   searchable; another company's never appears).
5. **Apply regression:** the existing apply + consent + funnel tests stay untouched + green.
6. **Frontend:** `--filter @ip/candidate build` + `--filter @ip/company build` +
   `--filter @ip/{ui,shared,api-client} typecheck` all green. Concretely, the build proves:
   - **SSR/island split holds** — `app/jobs/page.tsx`, `jobs/[id]/page.tsx`, `companies/[id]/page.tsx`
     are server components (no `"use client"`, no `useAuth`/TanStack at the top); the interactive bits
     are the islands (`JobResults`, `FilterSidebar`, `JobSearchBar`, `SortControl`, `Pagination`,
     `ApplyButton`, `SaveJobButton`). A server component importing a client hook fails the build —
     that's the guardrail.
   - **`@ip/api-client` wiring** — `discovery`, `savedJobs`, `jobAlerts`, `companyProfile` (and
     `sourcing` if split out) each appear in the import + `export *` + `ApiClients` + `clientsFromTransport`
     quad; `--filter @ip/api-client typecheck` catches a missing touch.
   - **Shared data layer** — `@ip/shared` typecheck proves the `PublicJob*`/`JobSearchResult`/`Facets`
     types + `fetchPublic*` helpers compile and are re-exported.
7. **Smoke (manual, no token):** `curl -s /public/jobs` returns published-only; `/jobs` SSR HTML
   contains job titles + facet counts in the **first paint** (view-source, not post-hydration);
   `sitemap.ts` enumerates `/jobs/{id}` + `/companies/{id}`; `robots.ts` allows crawl + points at the
   sitemap. Re-check `/jobs` at ~375px (sidebar collapses to a Filters button) and in dark mode (no raw
   colors — all tokens).
8. **Headline E2E (manual, Chrome via preview):** **anonymous browse `/jobs` (filter/sort/paginate via
   URL) → public `/jobs/[id]` (SSR, crawlable) → click Apply → sign-in (SSO) → consent → apply**
   completes and lands in the funnel exactly as today; then **save a job from a `JobCard` → it appears
   in `/saved`**, and the dashboard "Recommended for you" renders full `JobCard`s from
   `GetRecommendedFeed`. The apply path must be byte-for-byte today's (consent key, invalidations,
   `router.push("/")`).

## Risks / re-verify at execution

- **Two surfaces drifting** — enforce in review: no query/filter logic in `public_api.py` or any
  servicer; both go through `resources/discovery.*`.
- **Scrape surface** — confirm published-only is in the *resource*, the page-size cap + per-IP
  `RateLimiter` fire with an **opaque 429** (no quota/detail leak), and the public DTO (an enumerated
  allowlist) carries no internal handle / applicant / config — locked by the grep-style absence test.
- **`$text` is single-index/no-typo** — acceptable for demo; the v2.1 rerank covers fuzzy intent;
  resource is the swap point.
- **Rerank freshness** — the `jobs:catalog` upsert/delete must be driven by `job.published`/`edited`/
  unpublish, **debounced per `job_id`** (collapse edit storms, embed the latest JD; deletes
  immediate), **best-effort off the publish path** (log on fail, never block publish), with the
  **reconcile sweep** as the eventual-consistency backstop — never a one-shot backfill.
- **N+1 on joins** — every list join (feed/saved/company-jobs) uses one `$in` batch.
- **`posted_at`** — set on publish only; double-check re-publish-after-pause stamps a fresh value.
  **Legacy backfill (Task 2.5) is BLOCKING** — it must run on deploy *before* any `recent` query, and
  every `recent`/`best_match` sort null-guards (with the `_id` tie-break) so a job published during
  the migration window can't produce a non-deterministic page.
- **Logo presign** — manager-scoped, short clamped TTL, **`image/{png,jpeg,webp}` allowlist + a
  `logo_max_bytes` cap enforced as presign conditions, key namespaced under the token `comp_id`**
  (SVG excluded — script risk), mirroring résumé validation. FE: the browser PUTs to the presigned
  URL with **plain `fetch`, not `authedFetch`** (the URL is self-authorizing; a stray bearer header
  can break the S3 signature).
- **SSR fetch origin** — `NEXT_PUBLIC_ADMIN_URL` is inlined for the **browser**; the SSR server
  component runs on Node and needs a server-reachable origin. Route SSR fetches through
  `publicApiBase()` (`ADMIN_INTERNAL_URL ?? NEXT_PUBLIC_ADMIN_URL`); a public page that hard-codes
  `NEXT_PUBLIC_ADMIN_URL` for its server fetch can break in a deployed (non-localhost) topology.
- **Island boundary leaks** — keep `useAuth`/TanStack/`next/navigation` hooks **out of the public
  server components**; a server component that imports `lib/auth` (a `"use client"` module) turns the
  whole route client-side and kills crawlability. The Apply/Save/Results bits stay in their own
  `"use client"` files.
- **Apply-contract preservation** — `ApplyButton` is the funnel regression surface: the `job-consent:{id}`
  localStorage key, the `["recommendations"]` + `["applications"]` invalidations, and `router.push("/")`
  must be lifted **unchanged** from today's `[id]/page.tsx`. Re-run the existing apply/consent E2E.
- **First-paint hydration match** — `JobResults` must seed its TanStack query from the SSR result
  (`initialData`) keyed by the **same** params string the server used, or the first client render
  flashes/refetches and the URL-as-state contract drifts.
- **`["recommendations"]` key stability** — repointing the feed to `GetRecommendedFeed` must keep that
  query key so `dashboard.tsx`/`apply-button.tsx`'s apply+withdraw invalidations still refresh it.
