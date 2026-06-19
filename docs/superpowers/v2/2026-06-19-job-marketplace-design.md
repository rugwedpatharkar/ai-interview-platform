# Inc 1 — Job Marketplace & Discovery — Design

> **Pillar A of v2** (the headline new subsystem). Read the canonical
> `docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md` first — esp. §5 Pillar A
> and §3 (the one structural addition is the `/public/*` read surface). This spec details that
> pillar; the TDD build is `docs/superpowers/v2/2026-06-19-job-marketplace.md`.
>
> **Status:** design, awaiting review. No production code yet (v2 build is a later, separately
> green-lit phase). **Local-only project; never run git/gh.**

---

## 1. Goal & scope

Turn today's **closed, invite-driven AI-screening funnel** into a true two-sided **job marketplace**.
Today a candidate can only reach a job whose id they already hold — via the AI recommendation widget
(`RecommendationService.GetCandidateRecommendations` → `/jobs/[id]`) or a shared link. There is **no
search, browse, or discovery**: a candidate with no invite literally cannot find a job. The current
`get_public_job` resource (`resources/job.py`) already proves the "published job is discoverable"
seam, but it is reachable only over **authed gRPC-web** (`JobService.GetPublicJob`, any logged-in
user) and the candidate `/jobs/[id]` page is a client component behind `useRequireAuth`.

**In scope (v2.0):**

- **Anonymous discovery** — browse + keyword search + facet filter the *published* catalog with no
  token; crawlable public job and company pages (SSR, SEO).
- The **discovery flow**: anonymous browse/search → public job/company page → **Apply triggers
  sign-in + consent** (unchanged). The recommendation/invite path becomes **one entry point among
  many**, not the only door.
- **Search tech:** MongoDB `$text` + compound/`$facet` aggregation (Mongo is community 7 — **no Atlas
  Search**). One text index over `{title, jd_text, skills}` + compound facet indexes.
- A new **`/public/*` read-only REST surface** on admin (Starlette app mounted via the existing
  `_oauth_dispatcher` pattern, same uvicorn process), consumed by Next.js SSR server components.
- **New data:** additive `jobs` fields (location split, `remote_mode`, `employment_type`, salary,
  `skills`, `posted_at`) + new collections `company_profiles`, `saved_jobs`, `job_alerts`.
- **New authed gRPC services:** `DiscoveryService`, `SavedJobsService`, `JobAlertsService`,
  `CompanyProfileService`; extend `JobService` create/job fields; add employer `SearchCandidates`
  (over the company's *own* applicants only).
- **New candidate frontend:** `/jobs` (search index), public `/jobs/[id]`, `/companies/[id]`,
  `/saved`, `/alerts`; **company** `/branding` + extended job create/edit forms + `/talent` search.

**In scope (v2.1, sequenced last):** a **Qdrant semantic `best_match` re-rank** sort — reuse the
matcher's JD embeddings in a `jobs:catalog` Qdrant collection, populated on publish/edit. `$text` is
the v2.0 default sort; semantic rerank is an additive sort option, not a replacement.

**Out of scope / explicit non-goals:** Meilisearch / Typesense / Elasticsearch (no new search infra —
`$text` now, Qdrant rerank later, both already in the stack). Paid Atlas Search. Any change to the
funnel state machine, CAS, audit, consent, or the apply contract. ID/background/biometric checks
(excluded platform-wide per overview §2). Cross-tenant candidate sourcing — employer
`SearchCandidates` is **own-company applicants only**, human-in-the-loop.

---

## 2. Where it fits

```
   Anonymous web ─┐   SSR fetch (no token)   ┌──────────────────────────────────────┐
   (SEO/browse)   └────────────────────────►│  ADMIN  (owns MongoDB, source of truth)│
   Candidate app ─┐   gRPC-web (authed)      │  • gRPC-web servicers (authed actions) │
   (Next.js SSR + ├────────────────────────►│  • /public/* REST (read-only)  ◄── NEW │
    client island)│                          │  • /auth/oauth/* (SSO, existing)       │
   Company app ───┘                          │  _oauth_dispatcher routes by path prefix│
                                             └───────┬───────────────────┬────────────┘
                                  RabbitMQ {dom}.{act}│                   │ both surfaces call the
                                  job.published/edited │                  │ SAME resources/* funcs
                                                       ▼                   ▼
                          (v2.1) ai-agents matcher ── jobs:catalog Qdrant   resources/{discovery,
                          reuses JD embeddings on     (semantic rerank)     saved_jobs,job_alerts,
                          publish/edit                                      company_profile,sourcing}
```

- **admin still owns MongoDB**; ai-agents stays stateless. No new service — the marketplace is new
  *capabilities* (servicers + one REST app) on admin, plus a v2.1 Qdrant collection the existing
  matcher populates.
- **The single structural addition is `/public/*`.** It mirrors `routes/oauth.py`: a Starlette app
  built by a `create_*_app(deps)` factory, mounted in `main.py` by extending `_oauth_dispatcher` to
  also route `/public/*` (else → gRPC-web). Same process, same Mongo handle, no proxy. This is the
  established precedent for "a non-gRPC HTTP surface alongside gRPC-web on admin".
- **Both read surfaces call the same `resources/*` functions** (transport-agnostic, the existing
  convention — see `resources/job.py`, `recommendations.py`). The public REST app and the authed gRPC
  servicers are two thin adapters over one resource layer. **This is the central guardrail:** no
  query logic lives in a route/adapter; published-only + tenant scoping live in the resource.
- **The funnel is untouched.** Apply still flows through `ApplicationService.apply` →
  `application.created` → the existing CAS state machine. Discovery is pure read-side; it adds no
  funnel events and no AI-decision surface, so it carries **no Local-Law-144 / EU-AI-Act risk**
  (overview §6).

---

## 3. Design

### 3.1 Search technology (decision + rationale)

**Decision: MongoDB `$text` + compound/`$facet` aggregation for v2.0; Qdrant semantic re-rank for a
`best_match` sort in v2.1. No new search engine.**

- **Why not Atlas Search / Meilisearch / Typesense / Elasticsearch:** the deployment is **MongoDB
  Community 7** (Atlas Search is Atlas-only). Adding a dedicated search engine means a new service to
  run, sync, secure, and keep consistent with the source of truth — disproportionate for a
  demo-scale catalog and against the v2 posture ("evolve the foundation; free/self-hostable only; no
  new infra unless a pillar truly needs it"). `$text` ships **zero new infra**, and Qdrant is
  **already in the stack** for matching, so the v2.1 rerank reuses an existing dependency.
- **v2.0 — `$text` + `$facet`:** one **text index** over `{title, jd_text, skills}` (Mongo allows
  exactly one text index per collection — this is the catalog search index). A single `$facet`
  aggregation returns, in one round-trip: the **page** of matching jobs (filtered + sorted +
  paginated) and the **facet counts** (e.g. counts by `remote_mode`, `employment_type`,
  city/region) the filter sidebar renders. Structured filters (`remote_mode`, `employment_type`,
  city/region, salary band) are exact-match `$match` stages backed by **compound facet indexes**;
  the default sorts are `relevance` (the `$text` `textScore`) and `recent` (`posted_at` desc). When
  the query has no text term, it degrades to a pure filtered+sorted `find` (no `$text` stage).
- **v2.1 — Qdrant `best_match` semantic rerank:** add a `jobs:catalog` Qdrant collection keyed by
  `job_id`, storing the **JD embedding the matcher already computes** (the matcher in
  `src/ai-agents/app/resources/matcher.py` embeds `jd_text` via the mcp-capability embedder and
  scores cosine similarity — exactly the vector we need). On **`job.published` / `job.edited`**, the
  matcher upserts the JD vector into `jobs:catalog`; on unpublish/close it deletes. The `best_match`
  sort embeds the candidate's query (or, for a logged-in candidate, reuses their **profile**
  embedding), retrieves a candidate set from Qdrant, and **re-ranks the `$text`/filter result** by
  semantic score. `$text` remains the candidate-set generator and the anonymous default; Qdrant is a
  re-rank layer, never the sole index.

**Honest tradeoff.** `$text` is a **single-index, stem-based, no-typo-tolerance** matcher: it handles
"python backend engineer" well, fumbles "pythonn" or "k8s ⇄ kubernetes". For a demo catalog this is
acceptable, and the v2.1 semantic rerank covers **fuzzy intent** ("someone who can build ML
pipelines") that lexical search misses. If lexical quality ever becomes the bottleneck, the resource
layer is the swap point — a future engine slots behind `resources/discovery.search_jobs` without
touching any adapter, page, or proto.

### 3.2 Public read surface (`/public/*`)

A **new read-only Starlette app** `src/admin/app/routes/public_api.py`, built by
`create_public_app(deps)` (mirroring `create_oauth_app`), mounted via the **extended
`_oauth_dispatcher`** in `main.py`:

```
/auth/oauth/*  → oauth_app      (existing)
/public/*      → public_app     (NEW)
else           → grpc_app       (gRPC-web)
```

**Endpoints (all GET, all token-free, all published-only):**

| Endpoint | Returns | Resource called |
|---|---|---|
| `GET /public/jobs?q=&remote_mode=&employment_type=&city=&salary_min=&sort=&page=&page_size=` | `{ jobs: [PublicJobCard], facets: {...}, page, page_size, total }` | `discovery.search_jobs(...)` |
| `GET /public/jobs/{job_id}` | `PublicJobDetail` (404 if not published) | `discovery.get_public_job_detail(job_id, ...)` |
| `GET /public/companies/{comp_id}` | `PublicCompanyProfile` (404 if no profile) | `company_profile.get_public(comp_id, ...)` |
| `GET /public/companies/{comp_id}/jobs?page=&page_size=` | `{ jobs: [PublicJobCard], page, page_size, total }` | `discovery.list_company_published_jobs(comp_id, ...)` |

**Hardening (this is a public, anonymous, scrapeable surface — the security spine of the pillar):**

- **Published-only is enforced in the resource, never the client.** The resource filters
  `status == "published"` (extending the existing `get_public_job` contract); a draft / paused /
  closed / unknown id is `NotFound`. An adapter cannot opt out — there is no "include drafts" param.
- **Public DTO is a strict subset.** `PublicJobCard` / `PublicJobDetail` / `PublicCompanyProfile`
  expose only display fields (title, JD, location, remote_mode, employment_type, salary band, skills,
  posted_at, company display name/logo/about). They **never** carry `comp_id` as an internal handle
  for mutation, applicant data, rubric/aptitude config, or any candidate PII. Internal docs are
  mapped to the public DTO in the resource, so a field added to a Mongo doc is **not** auto-exposed.
- **Page-size cap.** `page_size` is clamped to a configured max (mirrors `BaseRepository.find_capped`
  / `presigned_get_url`'s TTL clamp); an attacker cannot request an unbounded page.
- **Rate-limit via `lib.redis.RateLimiter`** keyed by client IP — exactly as `routes/oauth.py` gates
  `/refresh` (per-IP `hit(key, limit, window)` → 429 + `Retry-After` on `not allowed`). Trusted-proxy
  handling reuses oauth's `_client_ip` (X-Forwarded-For only when `trusted_proxy`).
- **`Cache-Control: public, max-age=60`** on every public response — short TTL so SSR/CDN/browser can
  cache the catalog (it changes on the order of minutes, gated by publish/edit) while the API absorbs
  crawler/scrape bursts. Errors carry `no-store`.
- **CORS** allows the FE origins for the (rare) client-side hit; the primary consumer is **server-side
  SSR**, which is same-origin-agnostic and sends no credentials.

### 3.3 Data model

All additive; existing documents stay valid (new fields optional). All tenant docs carry `comp_id`
derived from the **authenticated token, never client input** (PRODUCTION_STANDARDS §2).

**Extend `jobs`** (`src/admin/app/model/job.py`, additive/optional):

| Field | Type | Notes |
|---|---|---|
| `city` / `region` / `country` | `str \| None` | Structured location (the legacy free-text `location` stays for back-compat / display). |
| `remote_mode` | `"remote" \| "hybrid" \| "onsite" \| None` | Facet. Mirrors the profile's `_JOB_PREFERENCES` vocabulary. |
| `employment_type` | `str \| None` | e.g. full_time / contract / internship. Facet. |
| `salary_min` / `salary_max` | `int \| None` | Optional band. |
| `salary_currency` | `str \| None` | ISO code. |
| `skills` | `list[str]` (default `[]`) | **Lowercased** on write (consistent with the matcher's `profile.skills` join); part of the text index + a facet. |
| `posted_at` | `datetime \| None` | **Set on publish, not `created_at`.** `publish_job` stamps it (drafts have none); it is the `recent` sort key and the freshness signal. |

> Why `posted_at` ≠ `created_at`: a job can be drafted weeks before going live, re-published after a
> pause, etc. Discovery ranks/labels by *when it became visible*, so `publish_job` (the existing
> resource) sets `posted_at = now` at the moment it flips `status → published`.

**New collections:**

- **`company_profiles`** — 1:1 with a company (`comp_id`), the **public-facing brand doc**,
  deliberately **isolated from the auth `companies` doc** (which holds billing/identity, never
  public). Fields: `comp_id`, `display_name`, `logo_key` (S3 object key), `about`, `website`,
  `locations: list[str]`, `industry`, `size`. Editing brand never touches the auth record.
- **`saved_jobs`** — a candidate's bookmarks: `candidate_user_id`, `job_id`, `created_at`. Unique on
  `(candidate_user_id, job_id)` so a double-save is idempotent.
- **`job_alerts`** — a candidate's saved searches: `candidate_user_id`, `query` (text), `filters`
  (the same structured filter shape as search), `frequency` (e.g. daily/weekly), `last_run_at`. The
  scheduler reuse (a `job_alerts` pass alongside the existing retention/aptitude-expiry passes in
  `main.py`'s `run_schedulers`) is a **post-Inc-1 follow-up**; Inc 1 ships CRUD + the data shape.

**Indexes — added to the single authority `src/admin/app/infra/db.py` `INDEXES`:**

```python
# jobs — catalog text search (ONE text index per collection) + facet/sort indexes
IndexSpec("jobs", [("title", "text"), ("jd_text", "text"), ("skills", "text")]),
IndexSpec("jobs", [("status", 1), ("posted_at", -1)]),                  # recent sort, published-only
IndexSpec("jobs", [("status", 1), ("remote_mode", 1), ("employment_type", 1)]),  # compound facet
IndexSpec("jobs", [("status", 1), ("city", 1)]),                        # location facet
# company_profiles — 1:1 brand doc
IndexSpec("company_profiles", "comp_id", {"unique": True}),
# saved_jobs — idempotent bookmark
IndexSpec("saved_jobs", [("candidate_user_id", 1), ("job_id", 1)], {"unique": True}),
# job_alerts — a candidate's saved searches
IndexSpec("job_alerts", "candidate_user_id"),
```

(`jobs` already has `IndexSpec("jobs", "comp_id")`; the company-scoped management read path is
unchanged.)

### 3.4 API surface

The **proto → `pnpm --filter @ip/api-client gen` → `@ip/api-client`** pipeline is the FE contract.
Each new service is a `.proto` in `src/admin/app/routes/pb/`, a thin servicer in
`src/admin/app/routes/*.py` (mirroring `routes/job.py` / `routes/recommendation.py`), registered in
`routes/web.py`, with the generated TS client wired into `ApiClients` in
`frontend/packages/api-client/src/index.ts`.

**New authed gRPC services:**

- **`DiscoveryService`**
  - `SearchJobs(SearchJobsRequest) → SearchJobsResponse` — the **authed twin of `GET /public/jobs`**;
    calls the *same* `discovery.search_jobs`. (A logged-in candidate gets the identical catalog; the
    only difference is `best_match` can reuse their profile embedding in v2.1.)
  - `GetRecommendedFeed(GetRecommendedFeedRequest) → SearchJobsResponse` — **wraps**
    `MatchResultRepository.list_by_candidate` (the existing recommendations read) **joined to the
    `jobs` docs**, returning full job cards instead of bare `{job_id, score, reasons}`. This upgrades
    today's recommendation widget into a real "recommended for you" feed without changing the matcher
    or the match-results write path. The join is **batched** (one `$in` over the matched job_ids), not
    N+1.
- **`SavedJobsService`** — `Save`, `Unsave`, `ListSaved` (candidate-scoped; `ListSaved` batches the
  job lookup like the feed).
- **`JobAlertsService`** — `Create`, `List`, `Delete` (candidate-scoped CRUD over `job_alerts`).
- **`CompanyProfileService`** — `Get`, `Upsert`, `PresignLogoUpload` (manager-scoped). The
  `PresignLogoUpload` RPC returns a presigned PUT URL via `ObjectStorage.presigned_*` — the same
  pattern the resume/storage path uses (`lib/lib/storage/client.py` `presigned_get_url`, TTL-clamped);
  the browser uploads the logo directly to S3/MinIO, then `Upsert` records the `logo_key`.

**Extend `JobService`** — add the new fields (location split, `remote_mode`, `employment_type`,
salary, `skills`) to `CreateJobRequest` / a new `UpdateJob` + `JobResponse` (additive proto fields;
existing field numbers preserved). The public `GetPublicJob` / `PublicJob` message gains the new
display fields.

**Employer sourcing** — `SearchCandidates` (on `DiscoveryService` or a small `SourcingService`):
keyword search over the **company's OWN applicants' skills/experience only** (the talent pool from
`resources/talent.py` is the universe — candidates who applied to this company's jobs). It is
**human-in-the-loop** (surfaces candidates for a recruiter to review, makes no automated decision)
and returns **no ID/background/biometric data** — staying clear of the excluded regimes and of
cross-tenant candidate harvesting.

**New transport-agnostic resources** (`src/admin/app/resources/`): `discovery.py`, `saved_jobs.py`,
`job_alerts.py`, `company_profile.py`, `sourcing.py`. **New repositories**
(`src/admin/app/infra/repositories/`): `job_search.py` (the `$text`/`$facet` aggregation + the v2.1
Qdrant rerank hook), `company_profiles.py`, `saved_jobs.py`, `job_alerts.py`. The matcher
(`src/ai-agents/`) gains the v2.1 `jobs:catalog` upsert on publish/edit.

### 3.5 Frontend routes

Next.js App Router, two apps (`frontend/apps/candidate`, `frontend/apps/company`), `@ip/ui` design
system, `@ip/api-client` for authed gRPC-web, **plain `fetch` against `/public/*` for SSR**. The
overview's FRONTEND note already records "SSR for public job pages/SEO" as the framework rationale.

**Candidate:**

- **`/jobs`** — **SSR search index**: a server component fetches `GET /public/jobs` (token-free, so
  the page is crawlable and renders for anonymous users) + a **filter sidebar**. A **client island**
  handles interactive filter/sort/paginate (re-querying `/public/jobs` client-side, or
  `DiscoveryService.SearchJobs` when authed). This is the new front door.
- **`/jobs/[id]`** — **convert today's client page to an SSR public detail** page. The current
  `app/jobs/[id]/page.tsx` is `"use client"` + `useRequireAuth` + `api.jobs.getPublicJob`; the new
  version SSR-fetches `GET /public/jobs/{id}` (crawlable), and the **Apply control stays a client
  island** reusing the existing auth + consent + `api.applications.apply` flow verbatim (the consent
  checkbox, the `localStorage` consent persistence, the recommendations/applications query
  invalidation — all preserved). Anonymous → click Apply → sign-in → consent → apply, unchanged.
- **`/companies/[id]`** — SSR public company page (`GET /public/companies/{id}` + its published jobs).
- **`/saved`** — the candidate's bookmarked jobs (`SavedJobsService.ListSaved`).
- **`/alerts`** — manage job alerts (`JobAlertsService`).
- **`sitemap.ts` / `robots.ts`** — enumerate public job + company URLs for crawlers (the SEO payoff
  of the public surface).

**Company:**

- **`/branding`** — the `company_profiles` editor (display name, logo upload via
  `PresignLogoUpload`, about, website, locations, industry, size).
- **Extended job create/edit forms** (`app/jobs/new`, `app/jobs/[id]`) — add the new structured
  fields (location, remote_mode, employment_type, salary, skills) to the existing forms.
- **`/talent`** — extend the existing talent page with the `SearchCandidates` keyword box over the
  company's own applicants.

**Wiring:** add the new clients (`discovery`, `savedJobs`, `jobAlerts`, `companyProfile`) to
`ApiClients` + `clientsFromTransport` in `frontend/packages/api-client/src/index.ts` after `pnpm gen`.

### 3.6 Discovery flow (end to end)

```
Anonymous visitor
  └─► /jobs (SSR, GET /public/jobs)  ── browse / type a query / tick filters
        └─► /jobs/[id] (SSR, GET /public/jobs/{id})   [or /companies/[id]]
              └─► click "Apply"  (client island)
                    └─► not signed in → sign-in / SSO  (existing /auth/oauth/*)
                          └─► consent checkbox  (existing, unchanged)
                                └─► api.applications.apply({ jobId, consent })  (existing funnel)
                                      └─► application.created → CAS state machine (unchanged)

Logged-in candidate (additional entry points, all converging on the same Apply):
  • Dashboard "recommended for you"  → DiscoveryService.GetRecommendedFeed (match_results ⋈ jobs)
  • Saved jobs                       → SavedJobsService.ListSaved
  • Job alert hit / shared link / invite (the old single door, now one of many)
```

The **invite/recommendation path is preserved and unchanged** — it simply stops being the *only* way
in. Apply, consent, and the funnel are byte-for-byte the existing path, so this pillar adds reach
without touching the regulated AI-decision machinery.

---

## 4. Key decisions & tradeoffs

| Decision | Rationale | Tradeoff / mitigation |
|---|---|---|
| **`$text` + `$facet`, not a search engine** | Mongo Community 7 (no Atlas Search); zero new infra; matches v2 "evolve, free/self-hostable" posture | Single text index, stem-based, no typo tolerance. Acceptable for demo; v2.1 Qdrant rerank covers fuzzy intent; resource layer is the swap point |
| **Qdrant rerank reuses the matcher's JD embeddings** | The matcher already embeds `jd_text` (cosine match); no new model, no new dependency | Embedding **freshness** — tie the `jobs:catalog` upsert to `job.published`/`job.edited` events so a stale vector can't outrank a fresh one |
| **`/public/*` Starlette app via `_oauth_dispatcher`** | Exact precedent already in `main.py`/`routes/oauth.py`; same process, same Mongo handle, no proxy, no new service | Two read surfaces (public REST + authed gRPC) — **both must call the same `resources/*`**; this is the load-bearing guardrail (no logic in adapters) |
| **Both surfaces share the resource layer** | Single source of truth for published-only + tenant scoping + DTO shaping | A reviewer must check: published-only lives in the resource, the public DTO is a strict subset, no adapter bypasses it |
| **`posted_at` set on publish, not `created_at`** | Discovery ranks/labels by visibility time, not draft-creation time | One more field on `publish_job`; drafts have no `posted_at` (naturally excluded from `recent`) |
| **`company_profiles` isolated from auth `companies`** | Public brand data must not commingle with billing/identity; editing brand never risks the auth record | A second doc + a 1:1 unique index; the join on a company page is one extra read |
| **`GetRecommendedFeed` wraps existing `match_results`** | Upgrades the recs widget into a job feed with **no matcher change** | The job join must be **batched** (`$in`), not per-row (avoids N+1 on list reads) |
| **Employer `SearchCandidates` = own applicants only, human-in-loop** | Avoids cross-tenant harvesting and the excluded ID/background/biometric regimes | No global candidate index; sourcing universe is the existing comp-scoped talent pool |
| **SSR + `/public/*` for crawlability** | SEO is the point of a marketplace; server components render token-free | Apply must be a **client island** inside the SSR page (auth lives client-side) |

---

## 5. Testing approach

TDD throughout (failing test watched fail → implement → green), per PRODUCTION_STANDARDS §2. The gate
is `bash scripts/check.sh` (format, lint+security S-rules line-88, pip-audit, pytest ×5); **baseline
423 tests** must stay green and grow. Frontend verified by `npx pnpm@9.15.0 --filter @ip/candidate
build` + `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck` (never `next
build` while `pnpm dev` is live).

- **Search repo/resource (the core logic):** unit-test `discovery.search_jobs` and the
  `job_search` repo against a fake/in-memory Mongo boundary — text-term vs no-term, each facet,
  sort=recent vs relevance, page-size clamp, **published-only** (a draft never appears), facet counts.
  This is where most coverage lands; the resource is the contract.
- **Public REST surface:** Starlette `TestClient` over `create_public_app` — 200 shape for each
  endpoint, **404 for an unpublished/unknown id**, page-size clamp, **429 when the IP rate-limit
  trips** (mirror `routes/oauth.py` refresh tests), `Cache-Control` header present, and the **public
  DTO is a strict subset** (assert no `comp_id`-as-handle / applicant / config field leaks).
- **Authed services:** gRPC servicer tests (mirror `test`s for job/recommendation servicers) — role
  scoping (candidate-only saved/alerts; manager-only branding/sourcing), tenant scoping,
  `GetRecommendedFeed` returns full cards and **batches** the join, `SearchCandidates` returns only
  own-company applicants.
- **Apply regression (critical):** the existing apply + consent + funnel tests stay untouched and
  green — discovery must not alter the apply path.
- **v2.1 rerank:** unit-test the rerank ordering with a fake Qdrant client (injected seam) + assert
  the `job.published`/`job.edited` handler upserts/deletes the JD vector; no network in tests.
- **Manual / local E2E (Chrome via preview):** the **anonymous-browse → public-page → sign-in →
  apply** flow end to end; an anonymous `curl /public/jobs` returns published-only with no token;
  `sitemap.ts` enumerates public URLs.

---

## 5.5 v2 differentiator — Marketplace trust & freshness (ghost-job killer)

67% of job seekers hit ghost/stale jobs. Because admin owns the funnel, v2 has **ground truth on
whether a job is real and an employer responsive** — something a pure job board cannot offer:

- **Job freshness / auto-expiry.** `posted_at` (set on publish) drives a "posted N days ago" label;
  a scheduler sweep (extend `main.py`'s existing `run_schedulers`) auto-pauses/expires jobs past a
  freshness window, so the catalog can't fill with stale roles. Discovery already filters to
  `status == published`, so expired roles drop out automatically.
- **"Actively reviewing" signal.** Derived from real funnel activity on the job (recent transitions /
  applicants in screening) — a live badge that a posting is genuinely being worked, not abandoned.
- **Employer responsiveness.** From funnel timestamps (see the notifications spec's no-ghosting
  guarantee): median time-to-first-outcome and % of applicants given an outcome, shown on the company
  profile / job page ("typically responds in ~X days"). Employers who ghost rank worse / are flagged.
- **Authenticity by construction.** Only published, non-expired jobs from verified companies surface;
  the public DTO already excludes internal handles. No "apply into the void."

These are **trust signals a unified product earns from its own funnel data** — the marketplace
differentiator a standalone board structurally lacks.

→ Attaches to this spec's plan (`2026-06-19-job-marketplace.md`): the freshness sweep joins
`run_schedulers`; responsiveness / "actively reviewing" reads derive from funnel + audit data and
surface on the public company/job DTOs.

---

## 6. Open questions / risks

- **Two read surfaces drifting.** Public REST + authed gRPC must never diverge in what they expose or
  filter. *Mitigation:* both are thin adapters over the same `resources/discovery.*`; published-only +
  DTO shaping live only in the resource. Guardrail to enforce in review: **no query/filter logic in
  `public_api.py` or any servicer.**
- **`$text` quality (no typos / no synonyms).** Single index, stem-based. *Mitigation:* documented as
  acceptable for demo; v2.1 semantic rerank covers fuzzy intent; the resource is the clean swap point
  if a real engine is ever justified.
- **Public surface = scrape surface.** Anonymous + crawlable invites scraping. *Mitigation:*
  published-only enforced in the resource, page-size cap, per-IP `RateLimiter` (+ `Retry-After`),
  `Cache-Control: public, max-age=60`, and a **public DTO that is a strict subset** of the internal
  docs (no internal handles, no applicant/PII, no config).
- **Rerank embedding freshness.** A stale `jobs:catalog` vector could outrank a fresh JD.
  *Mitigation:* tie the Qdrant upsert/delete to `job.published` / `job.edited` / unpublish events (the
  matcher already consumes job events), so the vector tracks the live JD.
- **N+1 on list joins.** Feed / saved / company-jobs all join jobs (and companies) to ids.
  *Mitigation:* batch every join with a single `$in` over the id set; never per-row reads.
- **Logo upload abuse (presigned PUT).** A presigned upload URL is a write capability. *Mitigation:*
  manager-scoped RPC, short TTL (clamped, like `presigned_get_url`), content-type/size constraints on
  the object key path (mirror the resume validation in `resources/profile.py`).
- **`job_alerts` execution.** Inc 1 ships the data + CRUD; the scheduled "run alerts + notify" pass
  (a new branch in `main.py`'s `run_schedulers`, fanning into the Pillar-D notifications) is an
  explicit **follow-up** — flagged so a reviewer doesn't expect delivery in Inc 1.
- **Open:** the exact facet vocabulary for `employment_type` (free string vs a fixed enum) — leaning
  fixed enum for clean facet counts; confirm at planning.
