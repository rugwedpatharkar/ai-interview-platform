# PROJECT HANDOFF — AI Agent-Driven Interview Platform

> Paste/continue from this in a fresh Claude session (e.g. desktop app after importing
> the project). This file is self-contained context; the master plan
> (`~/.claude/plans/virtual-baking-sedgewick.md`) lives outside the repo and may not
> import. **Read `docs/superpowers/plans/ARCHITECTURE.md` first**, then this file.

## CURRENT STATE (updated 2026-06-18 — read this first)

> **⚠️ 2026-06-19 — v2 architecture & design authored.** The unified job-portal + AI-interview
> **v2** (evolve-the-foundation; demo-first, compliance-ready; 4 pillars) is designed in
> `docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md` (canonical) + 8 per-pillar
> specs/plans. **v2 code build is a later, separately green-lit phase.** Everything below describes
> the current (pre-v2) build that v2 evolves.

**Working mode (latest user directives):** proceed **autonomously — no approval gates**;
**document everything** as you go (keep this file + docs current so a fresh session can
continue); **proper exception handling + structured logging at every step** in service
code; production-grade + security-first.

**LATEST — ✅ THIRD-PASS AUDIT REMEDIATION COMPLETE (2026-06-19) — gate-green, smoke PASS, both apps
build.** A 3-agent adversarial re-audit (backend / frontend / cross-cutting) of the post-AUDIT-#2
codebase caught a real regression in the A1 CORS fix plus a few genuine issues; all fixed (B1–B7).
Backend **413 tests** (lib 51 · admin 202 · ai-agents 107 · mcp-data 22 · mcp-capability 31).
- **B1 (regression in A1 — the headline): credentialed CORS wildcard.** The A1 middleware used
  `allow_origins=… or ["*"]` with `allow_credentials=True`; with the default `cors_allow_origin="*"`,
  Starlette/FastAPI *reflects ANY Origin* back with `Allow-Credentials: true` — a universal credentialed-
  CORS bypass (exactly what A1 meant to stop). Fixed: new `lib/lib/web.py` `cors_config()` refuses the
  combo (wildcard ⇒ no credentials; explicit list ⇒ credentials), used by both admin oauth + ai-agents;
  the `cors_allow_origin` default is now the explicit dev FE origins.
- **B2: MCP error swallow.** `ai-agents/app/infra/mcp_result.py` `unwrap` returned `None` on a tool's
  `isError` result — indistinguishable from "not found", defeating the handlers' idempotency guards.
  Now raises so the Consumer dead-letters it.
- **B3: interview `_finalize` ordering.** It flipped `session.status="completed"` BEFORE persist+publish,
  so a broker blip stranded the interview completed-but-unscored + un-retryable. Reordered: persist +
  publish FIRST, flip status LAST (mirrors `abandon_stale`; the retry is idempotent).
- **B4** dropped legacy `.doc` from the resume upload allow-list (the parser only handles `.pdf/.docx`,
  so a `.doc` dead-lettered unparsed). **B5** the candidate public-job apply now invalidates
  `["recommendations"]`/`["applications"]` (+ gate-override invalidates `["analytics"]`). **B6** gRPC-web
  CORS now sets `Vary: Origin`. **B7** compose/`.env.example`: explicit `CORS_ALLOW_ORIGIN` for admin +
  ai-agents, `OAUTH_ALLOWED_REDIRECTS` documented.

**PRIOR — ✅ FULL-STACK CROSS-CHECK AUDIT #2 REMEDIATION COMPLETE (2026-06-18) — gate-green, smoke
PASS, both apps build + all packages typecheck.** A 3-agent adversarial re-audit of the now-complete
backend + frontend (incl. the R1–R4 hardening, previously unreviewed) raised ~40 findings; most were
false positives or self-corrected (see the plan's "Dismissed" list). The genuine ones (A1–A14) are now
all fixed. Backend **406 tests** (lib 48 · admin 200 · ai-agents 105 · mcp-data 22 · mcp-capability 31).
Plan: `~/.claude/plans/cryptic-humming-kahan.md` § "FULL-STACK CROSS-CHECK AUDIT #2".
- **A1 (keystone — deployment-blocking): CORS** on the cross-origin REST/SSO endpoints. The admin
  `/auth/oauth/*` Starlette app (dispatched *around* the gRPC-web CORS layer) and ai-agents `create_app`
  had **no CORS** — so every cross-origin browser call (cookie-refresh `credentials:'include'`, provider
  discovery, `/chat/turn`, `/jd/improve`, `/interview/*`) would break in deployment. Added credentialed,
  allow-listed `CORSMiddleware` to both (origins from `cors_allow_origin`). The in-process smoke + the
  deferred browser E2E had hidden it — none of the prior gates could catch it.
- **A2** `/auth/oauth/refresh` per-IP rate-limit (it was the only un-limited auth endpoint).
- **A3** chat mid-stream failure now emits an SSE `error` frame (FE `handleFrame` throws → ChatWindow
  rolls back + restores the message); no more silent truncated answer.
- **A4** email case-normalization at register/login/invite/forgot (no dup accounts via `User@x`↔`user@x`).
- **A5** malformed funnel event is logged (not silently acked). **A6** score-distribution N+1 → one
  `$in` batch read (`ReportRepository.list_by_applications`). **A7** `Referrer-Policy: no-referrer` on
  *all* oauth callback paths (was success-only).
- **A8** FE flushes the trailing SSE frame. **A9** decision also invalidates `["analytics"]` (funnel tab).
- **A10** `revoke_user` is now atomic (Lua `EVAL` — read+delete can't interleave; revoke-all is airtight
  for breach response). **A11** `parse_document` raises on empty extracted text. **A12** aptitude grading
  validates `0 ≤ answer < len(options)`. **A13** dead `use-require-auth.ts` wrapper removed (the 4 pages
  call the shared `@ip/shared` hook directly). **A14** score-distribution shows "more samples needed" for
  count==1 / zero-range (degenerate box plot).

**PRIOR (2026-06-18):** the 12-slice **backend audit remediation is COMPLETE and gate-green**
(was 390 tests; smoke PASS). See "✅ BACKEND AUDIT REMEDIATION COMPLETE" below for the slice-by-slice
resolution + the consciously-deferred/accepted items.

**✅ FRONTEND HARDENING COMPLETE (2026-06-18) — post-FE-audit, all tracks shipped, backend gate +
smoke green, both apps build.** A two-agent audit of the shipped F1–F9 found the plan over-promised in
three areas + a FE bug backlog; all resolved (plan: `docs/superpowers/plans/2026-06-18-phase-2-frontend.md`
§ POST-IMPLEMENTATION REVISION). **The earlier FE follow-ups below are now mostly DONE.**
- **Bucket C** (FE bugs): recommendations invalidate-on-apply; decision invalidates ranked/reports/
  score-dist tabs; ChatCitation duplication documented; rubric weight no longer silent-0; analytics
  zero-total EmptyState; composite reason keys; chat error rolls back + restores the message.
- **R3** score percentiles: `ScoreDistribution` proto gains `p25/p50/p75` (type-7) + the FE renders a
  box-plot (min·p25·median·p75·max) — supersedes F9's mean-only "quartiles" gap.
- **R2** chat token-streaming: the LLM seam gained `stream()`; `assistant_turn` split into
  `prepare_answer` (planner+scoped fetch, still 502s cleanly) + a streamed answer; `/chat/turn` emits
  incremental `text` deltas; the FE `ChatWindow` already renders them.
- **R1** SSO production-grade: per-app `authorize?redirect=` bound to the CSRF state (allow-listed);
  `GET /auth/oauth/providers` discovery (FE gates buttons — no dead 404s); unknown/failed → friendly
  `#error=` redirect (not raw JSON); **`POST /auth/oauth/refresh` reads the HttpOnly refresh cookie**
  so SSO sessions silently refresh (the FE transport calls it with `credentials:'include'` when there's
  no localStorage refresh) — **the zombie session is gone**.
- **R4** public candidate job view: `JobService.GetPublicJob` (published-only, title+JD, any
  authenticated user) + a candidate `/jobs/[id]` page; recommendations now link to it (title + apply)
  instead of an opaque id.
- Gate after R1: **smoke PASS**; backend grew past 390 (admin +percentiles/oauth/public-job tests,
  ai-agents +streaming test). FE: both apps build + all packages typecheck green.

**✅ PHASE 2 FRONTEND PLANE COMPLETE (2026-06-18) — F1–F9 shipped, both apps build + all packages
typecheck green** (`npx pnpm@9.15.0 --filter @ip/{candidate,company} build` + `--filter
@ip/{ui,shared,api-client} typecheck`). Reuses the established `@ip/{ui,shared,api-client}` patterns
(no second data-fetch/error approach). **Phase 2 is now end-to-end complete.**
- **F1** api-client regen + wired 4 new services (`recommendations`, `analytics`, `rubrics`, `talent`).
- **F2** candidate "Recommended for you" on the dashboard (score + reasons; prefills the apply box —
  no public candidate job view yet, a documented follow-up).
- **F3** company "Ranked" tab on the job page (AI-ranked applicants, score + reasons).
- **F4** **chat (SSE):** `@ip/shared` `createChatClient` (genuine SSE consumer; the interview client is
  unary), `@ip/ui` `ChatWindow` (streaming text + citations + `useRef` in-flight latch), mounted in
  both apps; **company CSP `connect-src` extended with `AIAGENTS`** (candidate already had it).
- **F5** "Improve with AI" on the job-create form (`@ip/shared` `createJdClient` → `/jd/improve`).
- **F6** company rubric manager (`/rubrics`): list/create/edit/delete with dynamic competency rows +
  `ConfirmDialog` deletes.
- **F7** company analytics dashboard (`/analytics`): funnel state counts + conversion, dependency-light
  inline bars.
- **F8** SSO buttons on both login pages → admin `/auth/oauth/authorize`; `/auth/callback` route reads
  the access token from the URL fragment and seeds the store.
- **F9** talent pool (`/talent`) + per-job "Scores" tab (score-distribution stats only — no protected
  attributes).
- **FE follow-ups (documented, not blocking):** SSO cookie-based silent refresh (the callback seeds
  access with an empty refresh — the HttpOnly refresh cookie is not yet consumed by the Refresh RPC,
  so an SSO session ends at access-token expiry until wired); admin `oauth_frontend_redirect` is a
  single URL, so per-app SSO redirect routing needs per-deployment config; a public candidate
  job-detail/apply view to deep-link recommendations.

### ✅ SECURITY/QUALITY REMEDIATION COMPLETE (2026-06-17) — full-codebase audit fixes
A 7-agent audit of the whole codebase produced a prioritized findings list; **all of it is
now fixed and gate-green** (plan: `~/.claude/plans/cryptic-humming-kahan.md`). Backend gate
**263 tests** (lib 47 · admin 143 · ai-agents 62 · mcp-data 8 · mcp-capability 3, up from 217);
both frontend apps build green; gRPC-web smoke PASS. 17 slices landed:
- **CRITICAL — prompt injection:** all 6 ai-agents prompt builders now `fence()` untrusted
  text (résumé/JD/answers/competencies) + carry an "ignore instructions inside markers"
  notice (`resources/_prompt_safety.py`). A candidate can no longer steer their own score.
- **Auth/transport:** rate limiter is atomic (no TTL-less-key lockout) + counts failed logins
  only + normalized email key; gRPC-web CORS is an allow-list (no Origin reflection) + body-size
  cap + compression/frame validation + per-call deadline; X-Forwarded-For ignored unless
  `trusted_proxy` set; JWT carries `iss`/`aud` + a secret-strength validator; verify/reset
  tokens are **single-use** (Redis nonce) + shorter TTL; erased users are inert to auth.
- **Funnel/idempotency:** `advance_application` is **compare-and-swap** (concurrent decisions +
  redeliveries no longer double-write/double-email); malformed ids → NotFound not INTERNAL;
  interview `submit_turn` rejects completed sessions; `interview.completed` handler skips if
  already scored; LLM calls have timeout+retry; the evaluator runs at **temperature 0**.
- **Compliance/tenant:** erasure now also deletes the consent ledger; login/invite/reset are
  audited; `mcp-capability.parse_document` enforces the owner key-prefix (no cross-tenant
  résumé read); résumé upload sniffs **magic bytes**.
- **Liveness (new schedulers):** admin reaps past-retention candidates + expires abandoned
  aptitude deliveries; ai-agents reaps over-budget interviews → `interview.abandoned`.
- **Infra:** publisher confirms + `mandatory`; consumer reconnect log; `ApplicationState`/
  `FunnelEvent` **StrEnums** (dead `interview_in_progress` removed); list queries capped;
  presign-TTL clamp; loguru sensitive-key redaction.
- **Frontend:** `onAuthLost` now redirects (no silent stuck session) + concurrent-401 guard;
  `ConfirmDialog` closes on confirm (no double-submit); shortlisted applicants are actionable
  (funnel now allows shortlisted→hired/rejected); résumé client validation; account `isError`;
  forgot-password `catch`; static `error.tsx`; hydration gate; a11y labels + `aria-live`;
  **CSP** on both apps + 7-day refresh TTL + documented localStorage tradeoff (`frontend/README.md`).

**Documented follow-ups (user chose the pragmatic path; not silently dropped):** httpOnly-cookie
refresh migration; AV/malware résumé scan; recruiter candidate-name field + `ListUsers` RPC;
proto-level pagination; strict CSP nonces; a backend `parse_failed` profile flag; an
interview-resume endpoint. See the remediation plan's coverage table for finding→slice mapping.

### ✅ PHASE 2 — AGENT + BACKEND PLANES COMPLETE (2026-06-18) — the intelligence layer
Phase 2's **Agent side** (`ai-agents` + `mcp-data` + `mcp-capability`) and **Backend side**
(`admin` + `lib`) are built, TDD'd, and **gate-green**: backend gate **346 tests** (lib 47 ·
admin 167 · ai-agents 92 · mcp-data 18 · mcp-capability 22, up from 263); gRPC-web smoke PASS;
both `admin` + `ai-agents` import clean. Plans: `2026-06-18-phase-2-{agent,backend,frontend}.md`
(split from umbrella `2026-06-18-phase-2.md`; the Phase-1↔Phase-2 fit-analysis + the 3-way split
live in `~/.claude/plans/cryptic-humming-kahan.md`). **Only the Frontend (F1–F9) plane remains.**

**Agent side (A1–A13):**
- **RAG foundation (mcp-capability):** injected seams `Embedder`/`VectorStore`/`Fetcher`
  (`app/seams/`) — Gemini/Qdrant/httpx real impls + `Fake*`; `chunking.py` (sentence-aware
  1024/128 + sha256 content-hash); `retrieval.py` hybrid dense + **in-house Okapi BM25** + RRF;
  `embed`/`kb_search`/`ingest` tools (Redis-cached, content-hash dedup, citations on the Qdrant
  payload). ai-agents `McpCapability` gateway gains embed/kb_search/ingest.
- **Matcher (A6–A8):** `resources/matcher.py` (cosine on cached embeddings — **deterministic** —
  + temp-0 LLM reasons, fenced); mcp-data `save/get_match_result` (idempotent upsert per
  job+candidate); `handle_match_run` (skip-if-scored) bound on `match.run`.
- **Two-tier cited questions (A9):** `build_job_question_plan` on `job.published` (per-topic
  `kb_search` → cited `job_question_plans`); `build_blueprint` **loads + adapts** the cached plan
  at interview start — the interview hot path takes no capability gateway → structurally can't crawl.
- **Chat (A10–A12, the §10.3 privacy boundary):** mcp-data `list_applicants(scope)` /
  `get_application_status(scope)` re-check tenant+role+relationship; `resources/assistant.py`
  planner routes to kb_search/status/ranking with scope threaded + fenced; ai-agents `POST
  /chat/turn` SSE, scope `{user_id,role,comp_id}` read from the signed JWT (`_caller_identity`).
- **JD assistant (A13):** `resources/jd_assistant.py` + ai-agents `POST /jd/improve` (recruiter-only).

**Backend side (B1–B7):**
- **Matching control (B1/B2):** `apply` emits `match.run`; a capped `profile.parsed` fan-out
  (`resources/recommend.py`) pre-populates discovery; **RecommendationService** — candidate's own
  matches + a job's ranked applicants (comp-scoped).
- **SSO (B3):** OAuth over the admin ASGI app — `main.py` `_oauth_dispatcher` routes `/auth/oauth/*`
  to Starlette (`routes/oauth.py`), else gRPC-web; `oauth_login` clones `login`; `infra/oauth.py`
  `HttpOAuthClient`+`FakeOAuthClient`; CSRF state via Redis `SingleUseTokenStore("oauth_state")`.
- **Analytics (B4/B7):** `AnalyticsService` GetFunnelAnalytics (per-state counts + hired/total
  conversion) + GetJobScoreDistribution (bias view — score spread only).
- **Rubric (B5):** `RubricService` comp-scoped CRUD. **Talent (B6):** `TalentService` (comp's
  applicants + counts). admin now serves **12 gRPC services** (was 8) + the SSO REST routes.

**New events:** `match.run` (admin → ai-agents), `match.completed` (ai-agents). **New endpoints:**
ai-agents `POST /chat/turn` (SSE), `POST /jd/improve`. **New collections:** `match_results`,
`job_question_plans`, `rubrics` (Mongo); `oauth_states` (Redis); KB vectors in Qdrant (provenance
on payload). **New deps:** mcp-capability `qdrant-client`/`httpx`/`beautifulsoup4`; admin
`starlette`/`httpx`; a Qdrant service in `docker-compose.yml`.

**Deliberate deviations (flagged):** in-house Okapi BM25 (dropped `rank-bm25` → avoids numpy +
stays offline-testable); KB provenance on the Qdrant payload + Redis dedup (no `kb_sources` Mongo);
**topic-scoped** KB collections (tech KB is non-sensitive); Qdrant compose service has **no
healthcheck** (distroless) → `service_started`; chat scope from JWT claims; SSO tokens handed back
via URL fragment.

**Phase-2 documented follow-ups (some confirmed by the running backend audit):** live
Gemini/Qdrant/OAuth wiring (deferred behind fakes); **reject null-`comp_id` manager scope** in the
mcp-data chat guard (audit High — cross-tenant leak if a manager token has `comp_id=None`); a
**unique `(job_id,candidate_user_id)` index** on `match_results` (the idempotent upsert can race-dup
without it); **sort-then-cap** for the recommendation/ranked/match reads (currently cap-then-sort →
can miss top scores past the 200 cap); `/chat/turn` input validation + exception handler;
httpOnly-cookie SSO handoff (vs URL fragment); index modules for the mcp-data/mcp-capability-written
collections. See the audit register below.

### ✅ BACKEND AUDIT REMEDIATION COMPLETE (2026-06-18) — all findings resolved, gate green
The 12-slice remediation plan (`~/.claude/plans/cryptic-humming-kahan.md`) is **fully executed,
TDD, every slice gate-green**. Gate now **390 tests** (lib 47 · admin 189 · ai-agents 102 ·
mcp-data 22 · mcp-capability 30), up from 346; `smoke_login.py --selftest` PASS.

**Slice → finding resolution (all Critical + High + the actioned Mediums/Lows):**
- **S1 C1 cross-tenant KB** — `kb_search`/`ingest` namespaced by `owner`; collection `kb:{owner}:{topic}`,
  per-(owner,topic) cache + seen-set. Candidate chat (`comp_id=None`) → empty `kb:None:*` (ungrounded-safe);
  candidate job→comp KB resolution is a documented follow-up.
- **S2 C2 OAuth takeover** — provider `email_verified` required; link only by verified, normalized email.
- **S3 H1** — unique `(job_id,candidate_user_id)` index on match_results; `save_match_result`→bool first-write;
  `match.completed` emitted exactly once (DuplicateKeyError→False).
- **S4 H2** — `job.published` idempotent via `get_aptitude_bank` guard (no bank rebuild on redelivery).
- **S5 H8 + chat input** — null-comp manager deny in `list_applicants`/`get_application_status`;
  `/chat/turn` `messages: list[ChatMessage]`, empty→400, count cap, assistant failure→502 (no stacktrace).
- **S6 H4/H5/M** — SSO refresh token → HttpOnly+Secure+SameSite=Lax cookie (off the URL fragment),
  `Cache-Control: no-store` + `Referrer-Policy: no-referrer`; per-IP callback rate-limit + audit row;
  empty-`password_hash` login fails closed as invalid creds (no bcrypt ValueError, counts the attempt).
- **S7 H3/H10** — match reads sort-by-score in the query then cap (true top-N); `list_by_job` comp-scoped.
- **S8 H6** — added unique `job_question_plans.job_id`, unique `interviews.application_id`, `interviews.user_id`;
  admin documented as the single index authority for agent-written collections.
- **S9 H7/L** — fan-out no longer swallows publish failures (nack→DLX; re-fan safe via match dedup);
  `fan_out_match` raises on missing `user_id`; `handle_profile_parse` skips if already `parsed`.
- **S10 H9** — `kb_search` k clamped to 50; cache key = sha256(JSON tuple) (collision-proof) + version int;
  `ingest` bumps the version to invalidate stale cache.
- **S11 M** — BM25 avgdl `or 1.0` guard; RRF ties broken by stable point id; in-page chunk dedup;
  `kb:seen` TTL (30d); matcher raises on empty profile/JD (no fake 0.0).
- **S12 M/L** — rubric weight `ge=0` + empty-competencies `ValidationError` + repo `matched_count` (no-op
  update isn't a 404); `abandon_stale` flips status last (publish-fail re-picks); `HttpOAuthClient` validates
  provider + `.get()` json → `InvalidTokenError`; `oauth_providers` startup validator; `aptitude.ready` noted informational.

**Consciously deferred / accepted (documented, not silently dropped):**
- **FE follow-ups (Frontend plane, not yet built):** F8 reads access token from the OAuth fragment and
  the Refresh RPC reads the new HttpOnly `refresh_token` cookie; candidate-chat KB job→comp resolution;
  `aptitude.ready` → recruiter "job ready" notification.
- **CSRF state↔provider binding (L):** deferred — single-use state already gates CSRF; provider-binding
  adds test churn for niche value. Namespace the state key by provider when SSO providers go live.
- **`embed` content_hash cache (L):** deferred — `ingest` already dedups by content_hash before embedding,
  so the marginal win doesn't justify threading redis into the pure `embed` tool.
- **`claims.get("sub")` (L):** declined (trust-the-system) — every token we mint carries `sub` and `decode`
  validates signature+type; `claims["sub"]` is the correct contract assertion.
- **match/applicant reads via `find_capped` (L):** already bounded (`.to_list(length=200)` + score-sort).
- **analytics conversion denominator + N+1 (note):** accepted — the proto returns `total` + per-state counts,
  so the FE recomputes any denominator; per-job report reads are bounded by the applicant cap.
- **servicer error `str(exc)` (note):** accepted — domain errors carry safe messages; internals aren't leaked.

### 🔎 BACKEND CROSS-CHECK AUDIT (2026-06-18) — 6-agent review, consolidated [RESOLVED — see above]
A 6-agent audit (RAG/matcher · chat-privacy · admin control plane · SSO/auth · event topology ·
lib+data-model) of the whole backend, P2-weighted. The Phase-2 build is **functionally sound and
its core invariants verified intact** (funnel CAS, consumer DLX, publisher confirms+mandatory,
prompt-fencing, the chat-privacy happy path, the Qdrant `content_hash→uuid5` id mapping, the ASGI
dispatcher can't shadow gRPC, refresh-rotation applies to SSO). Findings below — **ALL now fixed
(see the REMEDIATION COMPLETE block immediately above for the slice-by-slice resolution):**

**Critical**
- **Cross-tenant KB leak** — `kb:{topic}` Qdrant collections + Redis caches/seen-sets are NOT
  tenant-scoped; `ingest(owner,…)` stamps owner on the payload but `kb_search` never filters it.
  Scope keys by owner (or lock ingest to a global shared KB + document it). [mcp-capability/tools.py:58,66,92]
- **OAuth account-takeover** — `oauth_login` links to any account by email (incl. company_admin/
  recruiter) and `HttpOAuthClient` never checks the provider `email_verified`. Require email_verified,
  refuse SSO-link to password accounts, normalize email. [auth.py:323; infra/oauth.py:39]

**High**
- **match_results: no unique `(job_id,candidate_user_id)` index** → concurrent `match.run` (apply +
  fan-out) TOCTOU-inserts duplicate rows, breaks skip-if-scored, double-emits `match.completed`
  (corroborated by 4 agents). Add the unique index + gate publish on first-write. [db.py:29]
- **`handle_job_published` non-idempotent — REPLACES the aptitude bank** on redelivery with a fresh
  question set; an in-flight candidate's stored answer-order then indexes the wrong bank → wrong
  grades / IndexError. Guard "already built" or version the bank. [handlers.py:36]
- **cap-then-sort** in `match_results.list_by_job/list_by_candidate` — `find().limit(200)` with NO
  sort drops true top scorers past 200. Add `.sort("score",-1)`.
- **SSO refresh token (7d) in the redirect URL fragment** → HttpOnly cookie + short access token.
- **OAuth callback unrate-limited** (state brute-force + provisioning abuse) — inject RateLimiter.
- **`job_question_plans` + `interviews` unindexed** — full scans + dup-row races; add indexes.
- **profile.parsed fan-out swallows publish failures** in the funnel consumer → silent partial loss
  / re-fan amplification; let it redeliver. [main.py:128]
- **chat guard null-comp_id wildcard** — a manager token with comp_id=None matches all null-comp
  applications; reject null comp for managers. [mcp-data/tools.py:140]
- **kb_search** unbounded `k` (clamp ~50) + injectable/uninvalidated cache key (hash + invalidate);
  **match_results.list_by_job not comp-scoped** (safe today only via the job gate — add the filter).

**Medium (~14):** re-ingest dedup not crash-safe + in-page dup chunks; `kb:seen` set never TTL'd;
`/chat/turn` no input validation / exception handler; empty-`password_hash` login raises ValueError
→ INTERNAL + skips lockout (also hits GDPR-anonymized users); oauth_login no audit log; BM25
div-by-zero on all-empty corpus; matcher 0.0 for empty profile/JD; conversion denom includes
withdrawn/expired (product call); analytics N+1; rubric empty-competencies/unvalidated weights;
rubric no-op update → spurious NotFound (use matched_count); abandon publish-before-save liveness
gap; orphan `aptitude.ready` (possible missing transition) + dead `match.completed`; mcp services own
no index module; `oauth_providers` env-parse gap.

**Low (~11):** non-idempotent `profile.parse`; `profile.parsed` missing-user_id swallowed (no DLX);
find_capped bypass (silent truncation); CSRF state not bound to session/provider; HttpOAuthClient
provider-fault → 500; no embed cache; chunk-overlap inflation; servicer error mapping leaks str(exc);
ratelimit 3 RTTs; `claims["sub"]`/`AssistantPlan.intent` hardening.

**REPO LAYOUT (2026-06-17 structure refactor — current; supersedes older paths below):**
```
Project/
  lib/                     # shared library, editable-installed; import `from lib.X import …`
    lib/{config,logging,mongodb,rabbitmq,redis,security,storage,schemas}/   tests/
  src/admin/               # gRPC servicers served as gRPC-web over HTTP (uvicorn :8080)
  src/ai-agents/           # LangGraph/Gemini service (MCP client of the two below)
  src/mcp-data/            # MCP server — data tools over Mongo (FastMCP, SSE :8100)
  src/mcp-capability/      # MCP server — parse_document (FastMCP, SSE :8101)
  scripts/check.sh  ruff.toml  docs/
```
MCP servers use a simpler shape: `app/{tools.py (logic, tested), server.py (FastMCP
entrypoint), config.py}`. ai-agents connects via `infra/mcp_data.py` + `infra/mcp_capability.py`
(SSE `ClientSession`s, `unwrap` reads `CallToolResult.structured_content["result"]`).
Each service `app/` is **FLAT** — one file per domain per layer, **no per-domain subdirs and
no re-export `__init__`s** (consumers import the module directly):
- `app/model/<domain>.py` — Pydantic models. admin: `auth`(User+Company), `job`, `application`,
  `aptitude`, `profile`, `audit`. ai-agents: `aptitude`, `interview`(blueprint+transcript+session),
  `scoring`(evaluation+report), `profile`.
- `app/resources/<domain>.py` — business logic only (pure-ish, takes collaborators as args).
- `app/routes/<domain>.py` — thin servicers; generated protobuf under `app/routes/pb/`. admin
  also has `routes/grpcweb.py` (in-house unary gRPC-web→gRPC ASGI translator, no proxy/sonora)
  + `routes/web.py` (`create_web_app` registers all 8 servicers onto it).
- `app/infra/` — **adapters** (everything faked in tests): admin `repositories/`, `db.py`,
  `notifier.py`; ai-agents `mcp_data.py`, `mcp_capability.py`, `mcp_result.py`, `sessions.py`,
  `gemini.py`, `factory.py`.
- `app/{main,config,errors}.py` at the root.
Imports: `from app.model.auth import User`, `from app.resources.auth import login`,
`from app.infra.repositories.users import UserRepository`. Proto codegen (admin, from
`src/admin/`): `python -m grpc_tools.protoc -I . --python_out=. --grpc_python_out=. --pyi_out=.
app/routes/pb/X.proto`.

**`lib` — DONE and GREEN (35 tests, full gate passing).** Modules: `config`
(Mongo/Redis/RabbitMQ/JWT + **S3** + **auth TTLs** access 15m/refresh 14d), `logging`,
`mongodb` (`MongoManager`, `BaseRepository[M]` PEP695, `IndexSpec`/`ensure_indexes`),
`redis` (`create_redis`, `Cache`, **`RateLimiter`** fixed-window), `rabbitmq` (`Publisher`,
`Consumer` **with DLX + bounded retry**), `security` (`hash_password`/`verify_password`,
**`TokenService`** access+refresh w/ `type`/`jti`, **`RefreshSessionStore`**), **`storage`**
(`ObjectStorage` — S3/R2/MinIO, tenant-keyed `{comp_id}/{cat}/{key}`, SSE-AES256,
**`get_raw`** fetch-by-exact-key), `schemas` (`Role` StrEnum, `Response`).

**Runnable as a system (2026-06-17):** `docker-compose.yml` (+ `docker/Dockerfile`, `.env.example`,
`docker/README.md`) brings up infra (Mongo/Redis/RabbitMQ/MinIO) + all 4 services;
`scripts/smoke_login.py` does a RegisterCompany→Login→Me round-trip over gRPC-web. `--selftest`
boots admin under real uvicorn with in-memory fakes (no Docker/Mongo) and is **verified green** —
proves the server + transport boot and serve over a real socket. (Docker isn't installed in the
dev sandbox, so the full compose stack is authored + config-validated but run by the user.)

**Production gate:** `bash scripts/check.sh` = ruff (incl. security `S` + `ASYNC`) +
pip-audit + pytest (lib, admin, ai-agents, **mcp-data, mcp-capability**); config `ruff.toml`;
standard in `PRODUCTION_STANDARDS.md`. All five services are **fully under the gate** (**214
tests total**: lib 35 + admin 120 + ai-agents 49 + mcp-data 8 + mcp-capability 2).

**P1 acceptance gaps closed (2026-06-17, after a completeness audit vs PHASE_1.md §10).** All
PHASE_1-mandated behaviors that were missing are now built + tested: funnel **withdrawn/
abandoned/expired** transitions + a candidate **WithdrawApplication** RPC (`application.expired`/
`interview.abandoned` are event-driven; the consumer subscribes); interview **time-budget stop**
(`InterviewSession.started_at` + injected clock); **Transport seam** (`ai-agents
resources/transport.py` `Transport` Protocol + `conduct_interview` + offline `FakeTransport`
harness — live `/turn` is the text adapter); aptitude **timed + randomized** (per-candidate
`AptitudeDelivery` = stored permutation + `delivered_at`; grading maps positional answers back +
enforces `time_limit_min`; `DuplicateKeyError`→`ConflictError`); compliance **erasure cascade**
into reports/transcripts/aptitude_attempts (was a documented hole). Remaining (not P1-acceptance):
job lifecycle pause/close/archive; an interview resume endpoint; scheduling the retention sweep;
real SMTP/Gemini wiring.

**New docs this session:** `PRODUCTION_STANDARDS.md`; `AUTH.md` (JWT auth design; locked:
access+refresh **15m/14d**, password reset in P1, lockout **5→15m**, fixed-window limiting,
`jti` caller-generated, `type` claim); specs in `specs/` and plans in `plans/` for the
storage client and auth foundations (both built + green).

**admin is gRPC (2026-06-17 pivot) — DONE + GREEN (16 tests; in the gate).** Every
service uses the structure **`app/model`** (base models) + **`app/resources`** (ALL logic) +
**`app/routes`** (thin RPC, no processing) — see [[interview-platform-service-structure]].
**Frontend talks gRPC-web to admin** (no REST gateway, no Envoy): admin serves gRPC-web
**in-process over HTTP** (`uvicorn`, `routes/grpcweb.py`) so the browser reaches it directly;
the native `grpc.aio` server was dropped (no non-browser gRPC caller). Built in-house because
`sonora` pins `urllib3<2` (CVEs). Transport rationale + free-deploy plan: see
[[DEPLOYMENT.md]] / `docs/superpowers/plans/DEPLOYMENT.md`. Admin layout:
- `app/pb/auth.proto` + generated stubs (`auth_pb2`/`auth_pb2_grpc`; `app/pb` is gate-excluded).
- `app/resources/auth.py` — ALL auth logic (register company/candidate, verify, login w/
  access+refresh+jti+IP rate-limit **5→15m**, identity-from-token); raises `app/errors` domain
  errors; structured logging + boundary exception handling. **8 unit tests.**
- `app/routes/auth.py` — thin gRPC `AuthServicer` (RegisterCompany/RegisterCandidate/Verify/
  Login/Me); maps results→proto + domain errors→gRPC status, reads `authorization` metadata
  for Me. No logic. **4 servicer tests** (FakeContext).
- `app/model/{user,company}.py` (old `app/models/` shimmed); `app/main.py` = `grpc.aio` server
  (Mongo/Redis wired); `grpc_host`/`grpc_port` (50051). Deps: grpcio/grpcio-tools/protobuf.
- Retired as emptied stubs (local-only, no deletes): `app/api/*` (FastAPI), httpx tests.

**Slice 2 DONE + GREEN — full auth surface complete (admin 28 tests; lib 33).** Added
RPCs: `Refresh` (rotate + reuse-detection → revoke family), `Logout` (idempotent revoke),
`InviteRecruiter` (company_admin-only, inherits caller `comp_id`), `ForgotPassword` /
`ResetPassword` (uniform response, revokes all sessions on reset); login now rate-limits
**per-IP and per-account**; lib gained `TokenService.reset_token`. The browser's gRPC-web
transport remains a frontend-stage concern.

**admin gRPC services (all green, 100 tests) — the human-driven funnel + aptitude + reports:**
- `AuthService` (full: register/verify/login/refresh/logout/invite/forgot+reset/Me).
- `ProfileService` (candidate self: resume → `ObjectStorage` + emit `profile.parse`; `GetProfile`;
  `UpdateProfile` sets general fields — full_name/age/location/willing_to_relocate/job_preference
  [hybrid|remote|onsite], validated). **DATA SCOPE: general recruiting info only — NO official /
  sensitive documents** (passport/ID/certificates); see [[interview-platform-data-scope]].
- `JobService` (create/get/list/publish; publish → `job.published`; comp_id-scoped, manager-only).
- `ApplicationService` (candidate applies+consent, one-per-job → `application.created`; list-mine;
  list-applicants comp_id-scoped).
- **Funnel** (`app/resources/funnel.py` `next_state` + `advance_application`; consumer in `main.py`
  subscribes funnel events → advances application state, **audit-logged**). States: applied →
  aptitude_pending → [gate] → interview_pending / gated_out → interviewed → scored →
  {shortlisted|rejected|hired}; plus gate.override.
- `DecisionService` (recruiter `DecideApplication` scored→outcome; `OverrideGate`
  gated_out→interview_pending; both via the funnel authority, audit-logged).
- `AptitudeService` (candidate `GetAptitudeTest` serves the ai-built bank **stripped of the
  answer key**, `SubmitAptitude` grades server-side vs the job's `pass_threshold`, persists an
  `AptitudeAttempt`, emits `aptitude.graded {passed}` → funnel gate; ownership-scoped). Reads the
  `aptitude_banks` collection ai-agents writes; new `AptitudeBank`/`AptitudeAttempt` repos +
  indexes (`aptitude_banks.job_id` unique, `aptitude_attempts.application_id` unique).
- `ReportService` (recruiter `GetReport` + `ListReports` + `ExportReports` (xlsx via openpyxl) — reads the
  `reports` collection ai-agents writes on `scoring.completed`, **enriched + comp_id-scoped via
  the application** for candidate/state/tenant; manager-only, read-only). New `ReportRepository`
  in `infra/`; index `reports.application_id` unique. Completes the recruiter loop: read report →
  `DecisionService`.
- **Notifications** (`resources/notification.py` `TransitionNotifier`): `advance_application`
  calls it **best-effort / soft-fail** after every transition → emails the candidate per to_state
  (aptitude ready · interview invite · gated-out · shortlisted/hired/rejected; `applied`/
  `interviewed`/`scored` have no candidate message). Sending via the injected `infra/notifier.py`
  `Notifier` (LoggingNotifier now; real SMTP later). Threaded through the funnel consumer +
  `DecisionService` (notifier param is optional → existing tests unaffected).
- `ComplianceService` (candidate self-service data-rights): `RecordConsent` + `GetMyConsent`
  (auditable append-only consent ledger — `data_processing` / `automated_evaluation`); `EraseMe`
  (right-to-erasure via `CandidateEraser`: anonymize user + delete profile + resume + audit;
  resume delete best-effort). Retention `CandidateEraser.sweep(cutoff)` purges candidates past the
  cutoff (job entrypoint, not yet scheduled). New `ConsentRecord` model + `ConsentRepository`;
  `UserRepository.anonymize`/`list_candidates_before`; `profiles.delete_by_user`; lib
  `ObjectStorage.delete_raw`. **Follow-up:** cascade erasure into AI artifacts
  (reports/transcripts/attempts) + wire the retention sweep to a scheduler.
Pattern proven: each = proto + `model` + `resources` (logic) + `routes` (thin gRPC), tested at
both layers with `conftest.py` fakes, wired in `app/main.py`.

**`ai-agents` — service COMPLETE + GREEN (44 tests). The whole AI middle of the funnel.**
LangGraph/Gemini service, same `app/model` + `app/resources` + `app/routes` structure.
- **LLM seam:** agents depend only on a duck-typed `llm.structured(prompt, schema)`; real
  `app/infra/gemini.py` (`GeminiLLM`, langchain import call-local) + `app/infra/factory.py`
  (`get_llm(settings)` provider switch) + `app/config.py`. Offline tests inject a fake LLM
  (`tests/conftest.py` `fake_llm`, and `fake_llm_by_schema` for multi-call handlers).
- **6 agents (`resources/`, pure LLM logic, each validates a domain invariant):**
  `aptitude_setter` (JD+topics → auto-gradable MCQ bank), `profile_parser` (resume →
  `CandidateProfile`), `evaluator` (transcript → scored `Evaluation`, 0..1 enforced),
  `report_writer` (→ `InterviewReport`; score+recommendation **copied authoritatively** from the
  Evaluation), `blueprint` (JD+profile → `InterviewBlueprint` plan), `interviewer` (STATELESS turn
  fn: blueprint+transcript → next question/done, hard `max_questions` cap).
- **Live interview engine** (`resources/interview_host.py` + `infra/sessions.py`): `start_interview`
  builds the plan + first question; `submit_turn` records the answer, asks next or finalizes
  (save_interview + emit `interview.completed`). State = `InterviewSession` in Redis
  (`RedisInterviewStore`, TTL); **ownership enforced** (caller_user_id == candidate) — IDOR-safe.
- **FastAPI candidate API** (`routes/interview_api.py`): `POST /interview/{id}/start` + `/turn`;
  verifies the candidate access token (`lib.TokenService`), maps domain errors
  (`app/errors.py` NotFound/Forbidden) → 404/403/401. `create_app(deps)` + `app.state` =
  offline-testable (TestClient + real JWT + fakes).
- **Workers** (`routes/worker.py` + `resources/handlers.py`): Consumer dispatch over `EVENTS =
  [profile.parse, job.published, interview.completed]`. `profile.parse` → save profile → emit
  `profile.parsed`. `job.published` → build bank → emit `aptitude.ready`. `interview.completed` →
  Evaluator → Report-Writer → save report → emit `scoring.completed`.
- **MCP client (2026-06-17 — ai-agents no longer touches Mongo/storage directly):** `infra/mcp_data.py`
  `McpDataGateway` + `infra/mcp_capability.py` `McpCapability` wrap SSE `ClientSession`s to the
  standalone **mcp-data** (profiles/jobs/banks/interviews/reports + interview setup/context joins)
  and **mcp-capability** (`parse_document`) servers; `infra/mcp_result.py` `unwrap` reads
  `CallToolResult.structured_content["result"]`. Same duck-typed interface the handlers already
  used, so swapping the in-process gateways for MCP needed **no handler changes**. `main.py` opens
  both `ClientSession`s (`sse_client` → `initialize`) and injects them into `make_dispatch`. Redis
  interview state stays in-process (`RedisInterviewStore`). The old logic now lives verbatim in the
  servers: `mcp-data/app/tools.py` `DataStore` (was `MongoDataGateway`) and `mcp-capability/app/tools.py`
  `parse_document` (was `StorageCapability`).
- **Entrypoint** `app/main.py`: runs uvicorn (interview API) **and** the RabbitMQ consumer
  concurrently on one loop, sharing one LLM. Runtime deps: langchain-google-genai, langgraph, pypdf,
  python-docx, fastapi, uvicorn (declared; install to run).

**STATUS UPDATE (2026-06-17, late):** P1 backend is now complete **against PHASE_1.md §10
acceptance** (the 5 audit gaps closed — see the "P1 acceptance gaps closed" block above) **and
runnable** (compose + `scripts/smoke_login.py --selftest` verified green). **Frontend foundation
STARTED:** `frontend/` monorepo skeleton scaffolded (pnpm workspace + Turborepo + `tsconfig.base.json`);
`pnpm install` green. **`packages/api-client` DONE + VALIDATED:** `buf` (protobuf-es v2) codegen
from `src/admin/app/routes/pb/*.proto` → 8 typed service descriptors (`src/gen/*_pb.ts`, regen via
`pnpm --filter @ip/api-client gen`); `createApiClients(baseUrl, getToken?)` over
`@connectrpc/connect-web` with a JWT bearer interceptor (`src/index.ts`); `tsc --noEmit` green.
**Proven end-to-end:** `packages/api-client/smoke.ts` runs the real connect-web client against a
live admin (`scripts/smoke_login.py --serve` boots admin+fakes on :8099) → RegisterCompany→Login→Me
PASS — **connect-web's gRPC-web wire is compatible with our in-house translator** (the key Option-2
risk, now retired). **`packages/ui` DONE:** React/shadcn-style components (Button/Input/Label/Card +
`cn`), cva + tailwind-merge. **`apps/candidate` DONE (auth slice) + BUILD-GREEN:** Next.js 15 (App
Router) + React 19 + TanStack Query + Tailwind v4; `lib/auth.tsx` AuthProvider (localStorage access
token; bearer interceptor rebinds on token change), `lib/api.ts` (NEXT_PUBLIC_ADMIN_URL→:8080),
register/login screens (`components/credentials-form.tsx`) calling `@ip/api-client`. `next build`
prerenders `/`, `/login`, `/register`. **Gotcha fixed:** `next.config.ts` sets webpack
`resolve.extensionAlias {".js":[".ts",".tsx",".js"]}` so the TS workspace packages' `.js` specifiers
resolve. **FRONTEND COMPLETE — BOTH apps build-green** (plan: `~/.claude/plans/cryptic-humming-kahan.md`;
run guide: `frontend/README.md`). Monorepo `packages/`: **api-client** (typed gRPC-web, regen via
`pnpm --filter @ip/api-client gen`), **shared** `@ip/shared` (refresh-token transport, `ConnectError`→msg,
QueryClient + `refetchUntil` polling, `makeAuth`, role guards, interview REST, `downloadBytes`), **ui**
`@ip/ui` (hand-rolled primitives + Radix Select/Dialog/Tabs/RadioGroup/Checkbox + `sonner` toasts +
status tokens + layout + Table). **apps/candidate** (:3000, 13 routes): auth (register/login/verify/
forgot/reset), profile (resume upload → poll `parsed` → review/edit experience/education/skills + general),
apply+consent, aptitude (poll-not-ready + RadioGroup), interview chat (ai-agents REST, start-once guard +
beforeunload), tracker (polling + per-state CTAs + withdraw confirm), account (consent + erase), error/
not-found. **apps/company** (:3001, 13 routes): auth + role-gated `CompanyShell`, jobs (list/create/
detail-tabs/publish), applicants table (polling) + gate-override, report view (poll-not-ready) + decide,
reports + **xlsx export** (`downloadBytes`), team invite (admin-gated), account. Refresh-token renewal +
toasts + loading/empty/error states throughout. **VERIFIED (2026-06-17, full re-run):** backend gate green —
`bash scripts/check.sh` = ruff format + lint (S-rules) + pip-audit clean + **217 tests** (lib 35 ·
admin 123 · ai-agents 49 · mcp-data 8 · mcp-capability 2); candidate `next build` green (11 routes),
company green (13 routes); all 3 packages typecheck; connect-web↔admin gRPC-web smoke `PASS`
(RegisterCompany→Login→Me). **Frontend gaps (small future backend RPCs, noted):**
`JobResponse` lacks `jdText`; recruiters see `candidateUserId` not names; no public candidate job view;
aptitude has no client countdown; no interview-resume endpoint; no `ListUsers`. **Live funnel E2E** needs
the compose stack (no Docker in sandbox). Run: `cd frontend && npx pnpm@9.15.0 --filter @ip/candidate dev`
(+ `--filter @ip/company dev`).

**STATUS — P1 backend AND both frontend apps are COMPLETE and verified (2026-06-17, see VERIFIED above). Remaining work is OPTIONAL/deferred:** live funnel E2E on the compose stack (needs Docker — not in this sandbox); the small frontend-surfaced backend RPCs (`jdText` on `JobResponse`, a `GetApplicantProfile` name lookup, a public candidate job view, aptitude countdown fields, an interview-resume endpoint, `ListUsers`); and the documented backend follow-ups below.**
The whole P1 funnel runs end-to-end via events: admin (auth · jobs · applications · funnel ·
aptitude · decision · report · notification · compliance — all gRPC) + ai-agents (6 agents + live
interview, now an MCP client) + mcp-data + mcp-capability. Event contracts: ai-agents emits
`profile.parsed`, `aptitude.ready`, `scoring.completed`, `interview.completed`; admin funnel consumes
`application.created`, `aptitude.graded`, `interview.completed`, `scoring.completed`,
`recruiter.decision`. **Frontend** = Next.js (App Router) + TS + Tailwind + shadcn/ui, two apps
(company, candidate), talking **gRPC-web to admin** (no REST gateway). Documented backend follow-ups
(not blocking the frontend): cascade erasure into AI artifacts (reports/transcripts/attempts);
schedule the retention sweep; real SMTP (`Notifier`) + real Gemini wiring; Pants/uv workspace.

## 0. How to work (standing rules)
- **OFFLINE, PERSONAL PROJECT — NOT ON GITHUB.** Do **NOT** run any `git` or GitHub
  commands: no `git init`/branch/commit/push, no `gh`, no PRs, no remotes, no GitHub
  MCP/API. Everything stays as local files only. Never suggest pushing or publishing.
- **Production-grade code only:** robust, optimized, **minimal, low-complexity**. No
  over-engineering, no defensive code for impossible states. Shorter correct wins.
- **Library-first:** shared infra lives in `lib`, reused by every service.
  Build/extend the shared lib before service code.
- **Build in small components, one at a time**, keeping the whole-system picture.
  Independent modules may be built in parallel via subagents.
- **Multi-tenancy mandatory:** every tenant document + query carries `comp_id`.
- **TDD:** failing test → pass → keep green. Unit tests mock the repository boundary
  (no DB); integration tests hit a local MongoDB.
- Python 3.12+, FastAPI (async), Pydantic v2. Mirror "andromeda" conventions (§6).
- Docs live in `docs/superpowers/plans/`. Keep them updated.

## 1. Product vision
A **two-sided, multi-tenant SaaS hiring platform** with an AI screening funnel.
Companies post software/IT jobs; candidates build profiles and apply; an AI
multi-agent pipeline runs **aptitude test → gate → adaptive interview → scored
report**; the company reviews ranked candidates, decides, and the candidate is
notified — a closed loop for both sides. Target scale: 1000s of companies, 100k+
candidates. Free/open-source tooling in dev; architect for scale. Hiring AI is
legally high-risk (NYC LL144, EU AI Act, GDPR) → audit logging, consent, human
override, explainable scoring are first-class.

## 2. Locked decisions
- Two-sided marketplace; **company = tenant** (multi-recruiter org from day one;
  roles: `company_admin`, `recruiter`, `candidate`).
- Domain: software/IT; company supplies the JD; serves freshers AND experienced.
- Operating model: **async self-serve** — agents run the funnel solo.
- Funnel: apply → **auto-graded MCQ aptitude** (JD-tailored, timed, single attempt,
  randomized) → **gate** (company sets pass threshold per job; **recruiter can
  override, logged**) → **adaptive interview** (adaptive within a plan + time budget)
  → **scored report** → recruiter decision → candidate notified.
- Candidate profile: **resume upload → AI parses → candidate reviews/edits**;
  completeness gate.
- Job matching: rule-based filter in P1; **AI match-score + recommendations in P2**.
- Notifications: **email + in-app** at every funnel transition.
- AI core: **multi-agent pipeline** (planner → specialists → summary); **interviewer
  and evaluator are distinct agents** (objectivity).
- Primary output: **per-job Excel** (one row per candidate: scores + expected
  CTC/notice/experience) + recruiter dashboard + decision loop.
- Interview modality end goal: **video + voice**, but build **brain-first in TEXT**
  first, behind a `Transport` interface so voice/video swap in later.

## 3. Architecture (microservices + multi-agent + MCP)
Repo layout (top level):
- `lib/` — shared library package (installable, `pip install -e`).
- `src/admin/` — FastAPI: API gateway + **source of truth (owns MongoDB)**;
  auth/tenancy; company/candidate/job/application CRUD; funnel state machine;
  aptitude delivery/grade/gate; holds the interview WebSocket; scoring persistence +
  Excel export; compliance (audit/consent/retention); notifications; publishes agent
  jobs.
- `ai-agents/` — separate Python service; **LangGraph + Google Gemini**; Planner →
  specialists (Profile, Blueprint, Aptitude-Setter, Interviewer, Evaluator,
  Matcher[P2]) → Summary/Responder. Consumes async jobs from RabbitMQ; exposes fast
  HTTP RPC for live interview turns; **stateless** (no direct DB — uses MCP tools).
  Interview = a **single stateful LangGraph agent** with a Redis checkpointer
  (resumable), NOT a fan-out.
- `mcp-data/` — MCP server: platform-data tools (`get_candidate_profile`,
  `get_job_rubric`, `save_score`, `save_aptitude_result`, …). **Agents' ONLY path to
  Mongo**, scoped by `comp_id`+role+relationship; auditable.
- `mcp-capability/` — MCP server: `web_search`, `web_fetch`, `kb_search` (Qdrant
  hybrid RAG), `parse_document` (resume/cert), `embed`. (Code-exec sandbox later.)
- `frontend/` — pnpm + Turborepo monorepo: `apps/company`, `apps/candidate`,
  `packages/ui`, `packages/api-client`. Next.js (App Router) + TypeScript + Tailwind
  + shadcn/ui + TanStack Query + react-hook-form/zod.

Interconnection:
- Frontend ↔ Admin: REST/JSON + JWT bearer; WebSocket `/interview/ws`; notifications
  via WS/poll; typed `packages/api-client` from OpenAPI.
- Admin ↔ AI (async): Admin publishes `{domain}.{action}` events to RabbitMQ; AI
  workers run the graph, persist results **via `mcp-data` tools**, emit `*.completed`;
  Admin's funnel consumer advances state + notifies.
- Admin ↔ AI (live interview): browser ↔ Admin WS; per turn Admin calls AI
  `POST /interview/turn` (HTTP RPC); LangGraph state checkpointed in Redis. Auth/
  tenancy stay at Admin.
- Agents ↔ tools: **MCP** only.
- Funnel events: `job.published`, `application.created`, `aptitude.submitted`,
  `aptitude.graded`, `interview.completed`, `scoring.completed`, `recruiter.decision`.
  Every automated transition writes an `audit_log`.

## 4. Tech stack (all free/open-source; locked)
- Backend: FastAPI, **PyMongo `AsyncMongoClient`** (Motor is deprecated — do NOT use
  Motor), Redis (`redis.asyncio`), RabbitMQ via **aio-pika** (thin hand-written
  publisher/consumer; chosen over faststream for minimal, explicit lib code), object
  storage S3-compatible (Cloudflare R2 / MinIO) via aioboto3.
- Auth: JWT (`python-jose`) + **bcrypt with SHA-256 pre-hash** (handles >72-byte
  passwords).
- AI: LangGraph; **Google Gemini Flash** default behind a provider-agnostic
  `LLMClient` (`langchain-google-genai`); fast model for routing; **model routing +
  Redis multi-tier (exact + semantic) cache**; budget caps; streaming.
- RAG (P2): **Qdrant** hybrid — dense **Gemini embeddings** + sparse **BM25
  (FastEmbed)** fused with **RRF**; semantic chunking (1024/128); Redis-cached.
  Mirrors andromeda's `lib/rag`/`lib/qdrant`.
- Crawl (P2): tiered fetch `httpx`+BeautifulSoup → Playwright; LLM (Gemini)
  extraction; **at job-publish time + cached, NEVER live in the interview hot path**;
  web-search API + official docs; cite sources.
- Doc parsing (P1): pdfplumber + pypdf (+ Gemini Vision OCR fallback), python-docx.
- MCP client: `langchain_mcp_adapters`. Tests: pytest + pytest-asyncio.

## 5. Phasing roadmap & epics
- **P1 — Robust closed-loop funnel (TEXT).** Epics A,B,C,D,E,F(text),G,J + I-skeleton.
- **P2 — Intelligence & polish.** Matcher (H), RAG tech KB + crawl (K), conversational
  assistant chat (L), JD-Assistant, editable rubric/competency library, talent-pool
  CRM, bias dashboard, practice mode, post-interview feedback, funnel analytics, SSO.
- **P3 — Voice interview** (STT+TTS+LiveKit behind `Transport`).
- **P4 — Video + recording.**
- **P5 — Scale & robust integrity** (autoscaling, observability, ID verification,
  proctoring, AI-answer detection, ATS, billing, multi-region).

Epics: A Identity & tenancy · B Company app · C Candidate app + profile · D Funnel
engine · E Aptitude engine · F Interview agent · G Scoring & reporting · H AI matching
(P2) · I Scale & infra · J Trust & compliance · K RAG & knowledge ingestion (P2) ·
L Conversational assistant (P2/3).

Conversational assistant (L): chat for both personas — candidates ask "which jobs fit
me?" + skill-gap/rejection feedback; recruiters ask "who matches this job?",
summarize/compare candidates, draft JDs/messages, funnel analytics. **Recruiter chat
is scoped to applicants-to-their-jobs only**; candidate sees only own data; every
fetch enforced at the `mcp-data` layer; answers RAG-grounded + cited.

## 6. Andromeda conventions to mirror (team's existing platform, reference only)
`comp_id` on every tenant doc + query; provider-agnostic LLM model factory
(config-driven model ids `"provider:model"`); LangGraph supervisor + tool-wrapped
specialists; prompts in a registry (DB + cached, not inlined); Pydantic env-envelope
config + singleton `get_settings()`; RabbitMQ topic exchanges with `{domain}.{action}`
routing keys; standard response envelope (`status`/`message`/`data`) under `/api/v1`;
loguru structured logging with `comp_id`/`user_id`; LangSmith tracing on AI service;
`conftest.py` env-stubbing. (We use plain uv/venv + HTTP RPC instead of their Pants +
gRPC — alignment is on patterns, not tooling.)

## 7. CURRENT IMPLEMENTATION STATE

### `lib` — DONE and GREEN (12 unit tests passing)
Installable package `lib`:
- `lib/config.py` — `BaseServiceSettings` (Mongo/Redis/RabbitMQ/JWT env, pools).
- `lib/logging.py` — `configure_logging`, `get_logger` (loguru, context binding).
- `lib/mongodb/` — `MongoManager` (AsyncMongoClient lifecycle; `db`/`ping`/`close`),
  `BaseRepository[M]` (insert/get/find_one/find/update/delete/count; subclasses add
  `comp_id`-scoped queries), `IndexSpec` + `ensure_indexes`.
- `lib/redis/` — `create_redis`, `Cache` (namespaced JSON get/set/delete + TTL).
- `lib/rabbitmq/` — `Publisher` (robust topic publisher) + `Consumer` (durable
  queue, routing-key bind, manual ack/requeue, prefetch QoS) via aio-pika.
- `lib/security/` — `hash_password`/`verify_password` (bcrypt + SHA-256 pre-hash),
  `TokenService` (configured-with-secret: `access_token`/`verification_token`/`decode`).
- `lib/schemas/` — `Role` enum (company_admin/recruiter/candidate), `Response`.
- Tests in `lib/tests/` cover security (incl. long-password no-collision),
  cache, BaseRepository CRUD/tenant-filter (fake collection), schemas.

### `admin` — MIGRATION IN PROGRESS (NOT yet green — FINISH FIRST)
Already migrated to lib + Company/`comp_id`:
- `pyproject.toml` (depends on `lib`), `app/config.py` (`Settings(BaseServiceSettings)`),
  `app/models/company.py` (`Company`), `app/models/user.py` (`User` with `comp_id`,
  `Role` from lib), `app/repositories/companies.py`
  (`CompanyRepository(BaseRepository[Company])`), `app/repositories/users.py`
  (`UserRepository(BaseRepository[User])` + `get_by_email`, `set_email_verified`),
  `app/db.py` (`INDEXES` via `IndexSpec`: unique `users.email`, `users.comp_id`,
  `companies.created_at`; `get_db` placeholder).
- REMOVED: `app/security/`, `app/models/enums.py`, `app/models/organization.py`,
  `app/repositories/organizations.py`, tests `test_security.py`/`test_config.py`/
  `test_repositories.py`.

STILL BROKEN / TO FINISH (still reference Motor, `org_id`, `app.security`,
`OrganizationRepository`, `create()`; `require_role` unimplemented):
- `app/api/deps.py` — rewrite: `get_db`; `get_company_repo`/`get_user_repo` (from
  `Depends(get_db)`); `get_token_service` (build `lib.security.TokenService` from
  `get_settings().jwt_secret`); `get_notifier`; `CurrentUser` dataclass with `comp_id`;
  `get_current_user` (uses `TokenService.decode`); **IMPLEMENT `require_role(*allowed)`**
  (closure → dep depending on `get_current_user`; return user if `role in allowed`,
  else 403; deny by default).
- `app/api/auth.py` — use `lib.security` (`hash_password`/`verify_password`,
  `TokenService` via dep), repos' `insert(...)` (not `create`), `comp_id`/
  `company_admin`, `Company`/`company_name`, keep DuplicateKeyError → 409 backstop.
- `app/main.py` — replace Motor with lib `MongoManager`; lifespan builds
  `MongoManager` from settings, overrides `get_db` → `manager.db`, calls
  `ensure_indexes(db, INDEXES)`, closes on shutdown; keep "skip real DB when get_db
  already overridden" guard for tests.
- `app/api/protected_demo.py` — `/me`, `/recruiter-only`; rename `org_id`→`comp_id`.
- `tests/conftest.py` — DROP `mongomock-motor`; inject **fake in-memory repositories**
  via `dependency_overrides` for `get_company_repo`/`get_user_repo` (no DB); keep
  `JWT_SECRET` env default; keep `notifier` fixture.
- `tests/*` — update terminology (`org_id`→`comp_id`, `org_admin`→`company_admin`,
  `org_name`→`company_name`); pass against fake repos.
- `app/notifications/notifier.py` — keep (`Notifier` + `LoggingNotifier`).

### Environment
Root `.venv` has `lib` editable-installed + fastapi, uvicorn, httpx, pymongo>=4.13,
redis, aio-pika, loguru, pydantic, pydantic-settings, python-jose, bcrypt, pytest,
pytest-asyncio. Run lib tests: `cd lib && ../../.venv/bin/python -m pytest -q`.
Run admin tests: `cd admin && ../.venv/bin/python -m pytest -q` (conftest sets
a default `JWT_SECRET`).

### Docs
`docs/superpowers/plans/ARCHITECTURE.md` written. **Still to write:** `ADMIN_SERVICE.md`,
`AI_AGENTS.md`, `MCP_SERVERS.md`, `FRONTEND.md`, `DATA_MODELS.md`, and per-phase docs
`phases/PHASE_1.md … PHASE_5.md`.

## 8. Primary data models to finalize → write `docs/superpowers/plans/DATA_MODELS.md`
Finalize field-level schemas (types, required/optional, indexes, relationships) for:
**companies**, **users**, **candidate_profiles** (education[], experience[], skills[],
location, experience_level, resume_url, parsed/confirmed, completeness), **jobs**
(jd_text, requirements, experience_level, openings, location, deadline,
aptitude_config{topics,num_q,time_limit,pass_threshold}, rubric, required_topics,
time_budget_min, status; lifecycle draft→published→paused→closed→archived),
**aptitude_banks**, **aptitude_attempts**, **applications** (state machine:
applied→aptitude_pending→aptitude_done→[GATE]→{gated_out|interview_pending}→
interview_in_progress→interviewed→scored→{shortlisted|rejected|hired} + expired/
withdrawn/abandoned; gate_decision{auto,overridden_by,reason}; decision{outcome,by,
notes,at}), **interviews** (plan, transcript[], structured_data{expected_ctc,
notice_period,experience_years,…}, status, timestamps), **scores** (per_competency
[{name,score,evidence_quotes}], overall_score, recommendation, summary), **consents**,
**audit_logs**, **notifications**, **candidate_notes**. All tenant docs carry
`comp_id`. Get user review of `DATA_MODELS.md` before mass-building dependent modules.

## 9. IMMEDIATE NEXT STEPS (in order)
1. **Finish the `admin` auth migration → all tests green** (rewrite deps/auth/
   main/protected_demo/conftest/tests per §7; implement `require_role`). Completes
   Phase 1 "Identity & Auth" on top of lib.
2. **Write `DATA_MODELS.md`** finalizing every primary model (§8); pause for review.
3. **Write per-phase docs** `phases/PHASE_1.md … PHASE_5.md` (goal, components,
   data-model additions, module layout, work breakdown, events/interfaces, ordered
   tasks, prereqs, acceptance criteria) and per-service docs (`ADMIN_SERVICE.md`,
   `AI_AGENTS.md`, `MCP_SERVERS.md`, `FRONTEND.md`).
4. **Build Phase 1 in small components**, one by one: (1) lib [done], (2) admin
   auth/tenancy [finish], (3) data models, (4) companies+jobs CRUD + lifecycle,
   (5) candidate profile + resume parse (mcp-capability `parse_document`),
   (6) applications + funnel state machine (RabbitMQ workers), (7) aptitude engine
   (mcp-data + AI Aptitude-Setter + grader + gate/override), (8) interview agent
   (text, `Transport`, WS, Redis checkpoint), (9) scoring + Excel + report,
   (10) compliance (audit/consent/retention), (11) notifications, (12) both frontend
   apps.
5. **Parallelize with subagents** for independent modules once data models are locked
   (e.g. companies/jobs, candidate profile, notifications, compliance concurrently).
   Shared contracts (Pydantic models + event names) are the integration seam. Keep the
   foundation (lib, auth, data models) sequential and locked before fanning out.

## 10. Latest user directives
- Add the **base library work explicitly into Phase 1** (it is component 1).
- **Develop in smaller parts**, proceed one by one, keeping the big picture.
- **Use subagents** for independent modules simultaneously where it helps.
- **Finalize the data structure of each primary data model** before dependent features.
- **No GitHub / no git — offline, personal project only.**

Begin by confirming you've read `ARCHITECTURE.md`, then resume at §9 step 1.
