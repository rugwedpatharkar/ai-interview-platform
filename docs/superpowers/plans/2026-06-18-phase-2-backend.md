# Phase 2 — BACKEND-side Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or
> superpowers:executing-plans. Every task is **TDD** — failing test → minimal code →
> `bash scripts/check.sh` green (baseline **263 tests**). Regenerate gRPC stubs after any `.proto`
> change and run `python scripts/smoke_login.py --selftest` after transport-touching tasks.
> **Project is LOCAL-ONLY — never run git/gh.** Autonomous mode: proceed task-by-task.

**Goal:** Build the Phase 2 control plane on `admin` — the matching-trigger emission + the
recommendation reads, SSO (Google/Microsoft) over the admin ASGI app, funnel analytics, and the
recruiter polish surfaces (rubric library, talent pool, bias dashboard) — all multi-tenant,
audited, and offline-testable behind seams.

**Scope (this plan owns these):** `src/admin/`, `lib/`. **Reads** agent-written collections; does
**not** author mcp-data tools (that's the agent plan).

**Architecture:** admin = gRPC servicers served as **gRPC-web over uvicorn** via the in-house
`GrpcWebASGI` translator. Every service uses `app/model` + `app/resources` (all logic) +
`app/routes` (thin RPC). Persistence via `app/infra/repositories/*` with indexes in
`app/infra/db.py` `INDEXES`. The `mcp-data writes / admin reads the same collection` pattern from P1
(reports) is reused for `match_results`.

**Tech-stack adds:** an `OAuthClient` seam (real provider client + `FakeOAuthClient`); no new lib
deps expected (`lib/security/tokens.py` already fits SSO).

## Global Constraints
- **No git/gh.** Gate after each task: `bash scripts/check.sh` must stay green. After a `.proto`
  change: regen stubs, then gate. After B2/B3 (transport): `scripts/smoke_login.py --selftest`.
- **TDD**, reusing `src/admin/tests/conftest.py` fakes (in-memory `Fake*Repo`, `FakeRedis`,
  `fake_publisher`, token service). Add `FakeOAuthClient`.
- **Tenant isolation is non-negotiable:** every read/write is `comp_id`-scoped via the existing
  `_require_manager` + `jobs.get_scoped(job_id, comp_id)` idioms; cross-tenant access → `NotFound`.
- Python style per `~/.claude/CLAUDE.md`.

## Where this fits
Sibling plans: `2026-06-18-phase-2-agent.md` (AI/data plane — **produces the data this plan reads**),
`2026-06-18-phase-2-frontend.md` (consumes this plane's protos). Umbrella + Phase-1↔Phase-2
reconciliations: `2026-06-18-phase-2.md` (Part A); cross-side build order in its Part F. **B2
depends on Agent A7/A8 having written `match_results`; the proto + repo + tests can be built first
against seeded rows.**

## Decisions that bind this plane (from umbrella Part B)
2. **Matching = dual-trigger, discovery isolated.** Emit `match.run` on `application.created`
   (per-job ranking — **B1a, core**) and a **capped fan-out** on `profile.parsed` (discovery — **B1b,
   droppable**). `match_results` stays tenant-scoped `(comp_id, job_id, candidate_user_id)`.
4. **SSO = REST on admin's ASGI app.** A path-prefix dispatcher routes `/auth/oauth/*` to Starlette
   handlers, everything else to the gRPC-web app. `oauth_login` **mirrors `login`** exactly:
   `access_token(sub, role, comp_id, jti)` + `refresh_token(sub, jti)` + `sessions.allow(...)`
   ([auth.py:154-167](src/admin/app/resources/auth.py)). Behind a `FakeOAuthClient` offline.
5. **admin reads its own collections.** `match_results` (written by the agent plane) is read here via
   a new admin `match_results` repository — do **not** route admin through mcp-data.

---

## WORKSTREAM B-I — Matching control plane

### B1a — Emit `match.run` on application
**Files:** `src/admin/app/resources/application.py` (`apply` publishes a second event
`match.run {comp_id, job_id, candidate_user_id}` right after the existing
`application.created` publish at [application.py:43](src/admin/app/resources/application.py));
`src/admin/tests/test_resources_application.py`.
- **Change:** one added `publisher.publish("match.run", {...})`. `apply` already has `publisher`.
- **Test:** `apply` publishes **both** `application.created` and `match.run` with correct payloads.
- **Verify:** gate green.
> **Produces:** `match.run {comp_id, job_id, candidate_user_id}` — **consumed by Agent A8**.

### B1b — Discovery fan-out on `profile.parsed` (droppable; reconciles fit-Mismatch 3)
**Files:** `src/admin/app/main.py` (bind `profile.parsed` — extend `_FUNNEL_EVENTS`/the consumer or
add a small dedicated handler) → list the **N most-recent published jobs** (capped) via the jobs
repo → emit `match.run` per job for this candidate; `src/admin/app/config.py`
(+`recommend_fanout_limit: int = 20`); `src/admin/app/infra/repositories/jobs.py` (+a capped
`list_recent_published(limit)` if absent); tests.
- **Change:** populates `match_results` for a candidate **before** they apply, so the candidate
  recommendations page isn't empty.
- **Test:** a parsed profile fans out ≤ `recommend_fanout_limit` `match.run` events; the cap is
  respected and logged on truncation.
- **Verify:** gate green.
> *If discovery is deferred on cost/product grounds, skip B1b — B1a + B2 still ship recruiter
> ranking. This is the one isolated, droppable task.*

### B2 — RecommendationService (admin reads `match_results`)
**Files:** new `src/admin/app/routes/pb/recommendation.proto`; `resources/recommendations.py`;
`routes/recommendation.py`; `infra/repositories/match_results.py`; `infra/db.py` (+indexes on
`(candidate_user_id)` and `(job_id, score)`); register the servicer in `routes/web.py`; regen stubs;
`tests/test_resources_recommendations.py` + `tests/test_routes_recommendation.py`; add a
`FakeMatchResultRepo` to conftest.
- **Change:** two RPCs:
  - `GetCandidateRecommendations` → the caller's own `match_results`, capped + sorted by score
    (caller id from the access token, candidate role).
  - `GetJobRankedCandidates` → a job's applicants ranked by score, **comp_id-scoped** via
    `jobs.get_scoped(job_id, comp_id)`.
- **Test:** a candidate sees only their own results; a recruiter sees only an own-comp job; a
  cross-tenant job → `NotFound`; reads are capped.
- **Verify:** gate green + `smoke_login.py --selftest`.
> **Consumes:** `match_results` rows (Agent A7/A8). **Produces:** the recommendation proto/stubs —
> **consumed by Frontend F1/F2/F3**.

---

## WORKSTREAM B-II — SSO (reconciles fit-Mismatch 4)

### B3 — OAuth login (Google/Microsoft) over admin ASGI
**Files:**
- `src/admin/app/main.py` — wrap the `create_web_app(...)` ASGI app
  ([main.py:75](src/admin/app/main.py)) in a tiny path-prefix dispatcher:
  `scope["path"].startswith("/auth/oauth/")` → Starlette OAuth handlers, else → the gRPC-web app.
  Note uvicorn runs `lifespan="off"`, so pass deps to the handlers explicitly (closure/state).
- new `src/admin/app/routes/oauth.py` — `GET /auth/oauth/authorize` (redirect to the provider with a
  CSRF `state` persisted to `oauth_states`) + `GET /auth/oauth/callback`.
- `src/admin/app/resources/auth.py` — `oauth_login(provider, code, state, *, oauth_client, users,
  companies, tokens, sessions, oauth_states, refresh_ttl_seconds)`: verify `state`, exchange `code`
  via the injected `OAuthClient` → verified email, find/link/create the user by email, then **mirror
  `login`**: `access_token(sub, role, comp_id, jti)` + `refresh_token(sub, jti)` +
  `sessions.allow(user_id, refresh_jti, ttl)`.
- new `src/admin/app/infra/oauth.py` — the real provider client + `FakeOAuthClient` returning a
  canned **verified** email.
- `oauth_states` collection (+TTL index in `infra/db.py`); `src/admin/app/config.py` (client
  ids/secrets, redirect uri, enabled providers); register in `routes/web.py`/main wiring.
- `src/admin/tests/test_oauth.py`.
- **Change:** OAuth callback is offline-testable behind `FakeOAuthClient`; auto-provision a candidate
  (or link by email) → standard JWT + refresh session.
- **Test (offline):** `state` mismatch → rejected; known email → links to the existing user + mints a
  JWT; new email → creates a candidate + mints a JWT; **the gRPC-web path is unaffected** by the
  dispatcher (existing transport tests still pass).
- **Verify:** gate green + smoke. *(Live provider token exchange deferred until OAuth creds exist.)*
> **Produces:** `GET /auth/oauth/authorize`, `GET /auth/oauth/callback` — **consumed by Frontend F8**.

---

## WORKSTREAM B-III — Analytics + polish control plane

### B4 — Funnel analytics
**Files:** new `src/admin/app/routes/pb/analytics.proto`; `resources/analytics.py`;
`routes/analytics.py`; register in `routes/web.py`; regen; `infra/db.py` indexes if needed;
`tests/test_resources_analytics.py`.
- **Change:** `GetFunnelAnalytics` aggregates per-funnel-state counts + conversion for a comp's jobs,
  **comp-scoped**, capped reads (reuse the bounded-read cap from the P1 audit work).
- **Test:** seeded applications across states → correct per-state counts + conversion; tenant-scoped.
- **Verify:** gate green + FE build (Frontend F7).

### B5 — Editable rubric / competency library
**Files:** new `pb/rubric.proto` + servicer + `resources/rubric.py` +
`infra/repositories/rubrics.py` (`rubrics` collection, **comp-scoped CRUD**) + indexes; register;
regen; `tests/test_resources_rubric.py`.
- **Change:** CRUD rubrics. (Optional future hook: the agent Blueprint may seed from a saved rubric —
  **no agent change required for v1**; document the hook only.)
- **Test:** CRUD is comp-scoped; a cross-tenant rubric → denied/NotFound.
- **Verify:** gate green + FE (Frontend F6).

### B6 — Talent pool
**Files:** admin RPC to list/shortlist tenant candidates within scope (reuse `applications`, or a
`talent_pool` collection), comp-scoped; `resources/talent_pool.py` + repo + tests.
- **Change:** membership rule (v1) = **candidates who applied to this comp's jobs** — the minimal,
  non-cross-tenant interpretation. An explicit "add to pool" action is a **documented extension**
  (avoid a cross-tenant candidate directory, consistent with the candidate-data-scope memory).
- **Test:** returns only own-comp candidates; cross-tenant excluded.
- **Verify:** gate green + FE (Frontend F9).

### B7 — Bias dashboard (read)
**Files:** admin analytics-style read aggregating **score distributions** across a job's scored
candidates (spread, quartiles, outliers); `resources/bias.py` (or fold into `analytics.py`) + test.
- **Change:** PII/fairness-sensitive — v1 reports **score-distribution statistics only**. P1 does
  **not** collect protected attributes (candidate-data-scope memory), so there is no protected-class
  comparison to make; surfacing score spread is the honest, available signal. Document this scope.
- **Test:** distribution stats correct + comp-scoped.
- **Verify:** gate green + FE (Frontend F9).

---

## WORKSTREAM B-IV — lib touchpoints
Most of `lib/` is reused unchanged. Expect only:
- **No `lib/security/tokens.py` change** — `access_token`/`refresh_token` already fit SSO.
- The `OAuthClient` seam interface + `FakeOAuthClient` live in **admin `infra/`** (service-specific),
  not in lib.
- Config fields added in `src/admin/app/config.py` (OAuth creds, `recommend_fanout_limit`).
- All new indexes go in `src/admin/app/infra/db.py` `INDEXES`.

---

## Build order (within this plane)
```
B1a  (emit match.run)        ─┐
B1b  (discovery fan-out, opt) ─┤→  B2 (RecommendationService)   [B2 proto/repo testable before A-data lands]
B3   (SSO)                    independent
B4 · B5 · B6 · B7            parallelizable polish/analytics
```

## Cross-side handoffs (contracts other plans rely on)
| This plan produces / consumes | Other side |
|---|---|
| **emits** `match.run {comp_id, job_id, candidate_user_id}` (B1a) | Agent A8 consumes |
| **reads** `match_results` rows | Agent A7/A8 produce |
| recommendation proto + stubs (B2) | Frontend F1/F2/F3 |
| analytics proto (B4), rubric proto (B5) | Frontend F1/F6/F7 |
| `/auth/oauth/authorize` + `/callback` (B3) | Frontend F8 |
| talent-pool + bias RPCs (B6/B7) | Frontend F9 |

## Verification
1. Per task: `bash scripts/check.sh` → GATE PASSED (count grows from 263).
2. After any `.proto` change: regen stubs, then gate.
3. After B2 + B3 (transport): `python scripts/smoke_login.py --selftest` → PASS (gRPC path intact).
4. Tenant isolation: cross-tenant reads return `NotFound` in every new service's tests.
5. §10.5 P1 regression green throughout.
6. Deferred to live: real-provider OAuth token exchange (needs creds).
