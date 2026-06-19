# Platform Hardening — Implementation Plan (cross-cutting engineering standards)

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this task-by-task. Steps use
> `- [ ]` checkboxes. Spec: `docs/superpowers/v2/2026-06-19-platform-hardening-design.md`.
> This is a **cross-cutting** module — its tasks apply *across* the v2 pillars. Land the
> foundational pieces (rate-limit interceptor, logging convention, health, retention indexes)
> **alongside Inc 0–1** (per the audit's fold-in §4: "hardening + onboarding alongside Inc 0–1"),
> then the pillar-specific rows (messaging/video/practice limits, clip retention) as each pillar
> lands. **This is not a user-facing feature** — no product feature ships here, only standards +
> the wiring/tests that enforce them.

**Goal:** Make v2 production-grade across the board by wiring the existing `lib` primitives
(`redis.RateLimiter`, `logging` bind/correlation, `mongodb.IndexSpec`/`ensure_indexes`) uniformly
into the new surfaces, adding health + retention + tracing seams + a timezone guard, and naming the
cross-cutting tests (forged-`comp_id`, E2E funnel, concurrency/CAS, load targets). Resolves the
audit's **Part B "Cross-cutting / data-model / testing"** band + **Part A #4 (rate-limiting)** and
**#5 (observability)**.

**Architecture:** Reuse, don't rebuild. `RateLimiter.hit(key, limit, window)` →
`RateLimitResult{allowed, retry_after}` already powers login limits and gates `/refresh` in
`routes/oauth.py` (per-IP, opaque-429 + `Retry-After`, trusted-proxy `_client_ip`) — generalize that
one precedent to every new endpoint via **one gRPC interceptor** + the `/public/*` route gate.
`lib/lib/logging.py` already gives loguru + `correlation_id` + redaction — fix the *convention*
(bind `comp_id`/`user_id` at every entrypoint, propagate the id across the MCP/event hop).
`admin/infra/db.py` is the **single index authority** — new indexes + TTL specs land there, ensured
idempotently. New offline-unsafe deps (a real metrics/trace backend) stay behind injected seams with
no-op defaults so the gate stays offline.

## Global Constraints
- **LOCAL-ONLY — never run git/gh.** The skill's "commit" steps are replaced by **"run the gate"**:
  `bash scripts/check.sh` (ruff format + lint S-rules line-88, pip-audit, pytest) must stay green;
  **baseline today is 423 tests.** Markdown-only deliverable for this doc set — but the *tasks* below
  modify product code; each task ends gate-green.
- **Reuse the existing primitives — no new infra.** `RateLimiter`, `get_logger`/`bind_ids`,
  `IndexSpec`/`ensure_indexes` already exist and are tested. Do **not** add a new limiter, a new Redis
  pattern, a metrics/APM backend, a tracing vendor, or a load-test harness in v2.0 (spec §1 out-of-scope).
  The `Notifier`-contract widening is **already owned by the notifications-center plan** (its §3.7
  full-row signature) — do **not** re-do it here; this module only depends on it.
- **Opaque-429 convention is a STOP rule.** A throttled response leaks **no** quota intelligence:
  REST → `429 {"error":"rate_limited"}` + only `Retry-After`; gRPC → `RESOURCE_EXHAUSTED` + opaque
  message + `retry-after` trailing metadata. No remaining-count, no limit value, no per-endpoint
  detail. (spec §3.2)
- **Tenant isolation is non-negotiable.** Every new endpoint scopes by the authenticated `comp_id`;
  the forged-`comp_id` test (Task 16) proves no new surface trusts a client-supplied tenant id.
- **Robustness (every touched module):** validate untrusted input at the boundary; bound every
  Redis/Mongo/dependency call with `with_timeout`; structured `get_logger(...)` logs with
  `comp_id`/`user_id`/`correlation_id` bound; best-effort ops swallow-and-log (never `except: pass`);
  trust internal typed calls. Follow `~/.claude/CLAUDE.md` + `docs/superpowers/plans/PRODUCTION_STANDARDS.md`.
- **Offline gate stays offline.** All new tests use existing fakes (`LoggingNotifier`, fake
  Mongo/Redis repos, `FakeCodeRunner`, a `NoopTracer`). No real Mongo/Redis/Docker/LiveKit in
  `check.sh`; live health/index-build checks are manual/integration only.

---

## File structure (new + modified)

```
lib/lib/
  observability/                  (NEW package — cross-cutting seams)
    __init__.py                   (export Tracer, NoopTracer, health helpers)
    tracing.py                    (NEW — Tracer Protocol + NoopTracer span(name, **attrs))
    health.py                     (NEW — check_dependency(name, coro, timeout) → {name: ok|degraded|down})
  logging.py                      (no change — already has bind_ids/correlation/redaction; convention applied at call sites)
lib/tests/
  test_tracing.py                 (NEW — NoopTracer span is a no-op CM, records nothing, never raises)
  test_health_helpers.py          (NEW — check_dependency ok/degraded/down + timeout)

src/admin/app/
  infra/db.py                     (+ new pillar indexes + TTL IndexSpecs; the single index authority)
  infra/ratelimit_policy.py       (NEW — Settings-backed {method/route → (per_ip, per_user, per_comp, fail_mode)} map)
  interceptors/ratelimit.py       (NEW — grpc.aio ServerInterceptor: key off method+ip+user+comp, opaque RESOURCE_EXHAUSTED)
  routes/public.py                (+ per-IP RateLimiter.hit gate on each /public/* handler — rows 1–2)
  routes/health.py                (NEW — /health (liveness) + /health/detailed (readiness) HTTP routes)
  resources/retention.py          (NEW — aged/TTL sweep functions for messages/threads + clip/audit aged sweeps)
  service/scheduler.py            (+ register retention sweeps + alert sweep on the existing loop)
  config.py                       (+ rate-limit numbers, retention days, health-detail toggle — all Settings)
src/admin/tests/
  test_ratelimit_interceptor.py   (NEW — allowed passes; blocked → opaque RESOURCE_EXHAUSTED + retry trailer; fail-open/closed)
  test_ratelimit_policy_complete.py(NEW — every new gRPC method + /public/* route has a policy entry)
  test_health.py                  (+ /health 200; /health/detailed ok-map / 503 down-map with fakes)
  test_retention_sweeps.py        (NEW — aged rows removed, live kept, idempotent, per-row failure logged-continues)
  test_forged_comp_id.py          (NEW — comp-A token + forged comp-B id → 403/empty, never cross-tenant, audited)
  test_e2e_funnel.py              (NEW — apply→aptitude→interview→report→decision→notification, fakes)
  test_concurrent_decision.py     (NEW — two racing decisions → one wins, one conflict, single audit+notification)
  test_timezone_discipline.py     (NEW — representative timestamps round-trip tz-aware UTC)

src/ai-agents/app/  · src/mcp-data/app/  · src/mcp-capability/app/
  (+ /health[/detailed] route per service; + Tracer seam injected into practice/run_code/video agents)

ruff config (pyproject/ruff.toml at repo root)
  (+ enable DTZ flake8-datetimez rule → naive datetime fails the gate)
```

**Responsibilities (one job each):** `lib/observability/tracing.py` = the `Tracer` seam + no-op (no
backend). `lib/observability/health.py` = the bounded per-dependency check helper. `admin/interceptors/
ratelimit.py` = the single gRPC gate (the one place the opaque convention lives for RPC). `routes/
public.py` = the REST gate (mirrors `routes/oauth.py`). `resources/retention.py` = the aged sweeps
(TTL indexes need no code). `routes/health.py` = liveness/readiness. The `INDEXES` list in `db.py`
stays the single index + TTL authority.

---

## RATE-LIMITS  (audit Part A #4 + Part B "consolidated rate-limit table" — spec §3)

### Task 1 — rate-limit policy map + Settings numbers (TDD)
**Files:** Create `src/admin/app/infra/ratelimit_policy.py`; Modify `config.py`; Test
`tests/test_ratelimit_policy_complete.py`.
**Produces:** a `Settings`-backed map `{method_or_route → RatePolicy(per_ip, per_user, per_comp, window_s, fail_mode)}`
encoding spec §3.3 (rows 1–13).
- [ ] **Step 1 — config:** add the rate numbers as `Settings` fields (tunable, no magic constants):
  `rl_public_search_per_ip=60`, `rl_public_read_per_ip=120`, `rl_search_jobs_per_ip=120` /
  `…_per_user=300`, `rl_search_candidates_per_user=120` / `…_per_comp_hr=600`,
  `rl_send_message_per_ip=30` / `…_per_user=30` / `…_per_comp_hr=300`, `rl_list_poll_per_user=240`,
  `rl_security_op_per_15min=5`, `rl_settings_write_per_user=60`, `rl_video_presign_per_hr=20`,
  `rl_practice_per_hr=10` (window seconds alongside each).
- [ ] **Step 2 — failing test:** assert the policy map exposes a `RatePolicy` for each of the spec
  §3.3 rows with the right `fail_mode` (rows 10 + 12 are `closed`, the rest `open`). Run → FAIL.
- [ ] **Step 3 — implement** the map keyed by gRPC method name / `/public/*` route, built from
  `Settings`. `fail_mode` is `"open"|"closed"` per row.
- [ ] **Step 4 — gate green.** (Pure data + config; import-only.)

### Task 2 — `/public/*` per-IP gate (TDD)
**Files:** Modify `src/admin/app/routes/public.py`; Test (extend the marketplace public-route test).
**Produces:** rows 1–2 enforced exactly like `routes/oauth.py::/refresh`.
- [ ] **Step 1 — failing test:** with a fake `RateLimiter` returning `not allowed`, a `GET
  /public/jobs` returns **429** with body `{"error":"rate_limited"}` and a `Retry-After` header ==
  `retry_after`, and **no other detail** (assert the body has no count/limit keys). An allowed call
  passes through. Run → FAIL.
- [ ] **Step 2 — implement:** at the top of each public handler, `await limiter.hit(f"public_search:ip:{ip}", limit, window)`
  (ip via the **same** trusted-proxy `_client_ip` as oauth); on `not allowed` return the opaque 429.
  Reuse oauth's helper — don't duplicate the ip logic.
- [ ] **Step 3 — gate green.**

### Task 3 — gRPC rate-limit interceptor (TDD)
**Files:** Create `src/admin/app/interceptors/ratelimit.py`; wire into the gRPC server bootstrap;
Test `tests/test_ratelimit_interceptor.py`.
**Produces:** one `grpc.aio.ServerInterceptor` enforcing rows 3–13.
- [ ] **Step 1 — failing tests** (fake limiter + fake handler context with `user_id`/`comp_id` from
  the auth context): an **allowed** call invokes the handler; a **blocked** call aborts with
  `grpc.StatusCode.RESOURCE_EXHAUSTED`, an **opaque** message (`"rate_limited"`, no quota detail), and
  `retry-after` in **trailing metadata**; a method **with no policy entry** is rejected at startup
  (handled by Task 4, asserted there); **fail-open** (limiter raises → call passes + WARNING logged)
  for an `open` row; **fail-closed** (limiter raises → abort) for a `closed` row (row 10). Run → FAIL.
- [ ] **Step 2 — implement:** look up the method's `RatePolicy`; build the keys
  (`{method}:ip:{ip}`, `{method}:user:{user_id}`, `{method}:comp:{comp_id}` as the policy dictates);
  `hit` each applicable limit; **all must pass**. On any block → opaque `RESOURCE_EXHAUSTED` + retry
  trailer. On limiter exception → branch on `fail_mode`. Bind `comp_id`/`user_id` on the log line.
- [ ] **Step 3 — gate green.**

### Task 4 — rate-limit completeness self-check (TDD)
**Files:** Modify `src/admin/app/interceptors/ratelimit.py` (startup assert) + `routes/public.py`;
Test `tests/test_ratelimit_policy_complete.py`.
**Produces:** no endpoint can ship un-limited (spec §3.5).
- [ ] **Step 1 — failing test:** assert the set of registered new gRPC methods (messaging, discovery
  `SearchCandidates`, saved/alerts, notifications, settings security ops, video presign, practice) and
  the `/public/*` route set are **each** present as keys in the policy map; a deliberately-removed
  entry makes the test fail. Run → FAIL.
- [ ] **Step 2 — implement:** a `assert_policy_complete(method_names, route_names)` run at startup that
  raises if any method/route lacks a policy; the test calls it with the real registered set.
- [ ] **Step 3 — gate green.** (A future endpoint added without a limit now **fails the gate**.)

---

## OBSERVABILITY  (audit Part A #5 + Part B "observability/alerting for best-effort ops" — spec §4)

### Task 5 — structured-logging convention at entrypoints (TDD)
**Files:** Modify the new gRPC handlers + `/public/*` routes to bind ids; Test (assert bound context).
**Produces:** every new request logs with `comp_id`/`user_id`/`correlation_id` bound (spec §4.1).
- [ ] **Step 1 — failing test:** invoke a new handler with a known `comp_id`/`user_id` and a captured
  logger; assert the emitted record's `extra` carries `comp_id`, `user_id`, and a `correlation_id`
  (via `bind_ids`). A `/public/*` route (no user) carries `correlation_id` (+ no `user_id`). Run → FAIL.
- [ ] **Step 2 — implement:** at each new entrypoint, `log = get_logger(**bind_ids(comp_id=…, user_id=…))`
  once at the top; pass `log` down. Extend `_SENSITIVE` (lib/logging) for any new sensitive field name
  a pillar introduces. **Never** log PII bodies (résumé/message/transcript text) — ids + counts only.
- [ ] **Step 3 — gate green.**

### Task 6 — correlation-id propagation across the MCP/event hop (TDD)
**Files:** Modify admin → ai-agents call sites + the ai-agents/mcp ingress to read/continue the id;
Test passthrough.
**Produces:** one request's logs are stitchable across services by a single correlation id (spec §4.1).
- [ ] **Step 1 — failing test:** admin sets a correlation id, makes an MCP/HTTP/event call carrying it;
  the receiving side `set_correlation_id`s the **same** value (not a fresh one) so its logs share the
  id. Assert the forwarded field == the source id and the downstream `current_correlation_id()` matches.
  Run → FAIL.
- [ ] **Step 2 — implement:** carry the id in the existing header/metadata/event-envelope slot (where
  the auth context already rides); the ingress middleware/interceptor sets it and `reset`s on exit
  (the `set_correlation_id` → Token → `reset` pattern already in lib/logging).
- [ ] **Step 3 — gate green.**

### Task 7 — Tracer seam + no-op default (TDD)
**Files:** Create `lib/lib/observability/tracing.py`, `__init__.py`; Test `lib/tests/test_tracing.py`.
**Produces:** `Tracer` Protocol + `NoopTracer` (spec §4.2).
- [ ] **Step 1 — failing test:** `NoopTracer().span("x", k=1)` is an (async) context manager that
  enters/exits cleanly, records nothing, and never raises; nesting works. Run → FAIL.
- [ ] **Step 2 — implement:** `class Tracer(Protocol): def span(self, name, **attrs) -> AbstractAsyncContextManager` ;
  `NoopTracer` whose `span` is a no-op CM. (A real OTel impl later slots behind the same Protocol —
  zero change to callers.)
- [ ] **Step 3 — gate green.**

### Task 8 — inject the Tracer into the new agents (practice, run_code, video) (TDD)
**Files:** Modify the practice agent, the `run_code` grader path, the video STT path to take a
`tracer=` seam and wrap key phases; Test (fake tracer records spans).
**Produces:** the new compute paths are instrumentable (spec §4.2).
- [ ] **Step 1 — failing test:** with a recording fake tracer, running a practice turn / `run_code`
  case / video STT opens the expected `span("practice.turn")` / `span("run_code.case")` /
  `span("video.stt")` with `duration_ms` + attrs. Default (`NoopTracer`) changes nothing. Run → FAIL.
- [ ] **Step 2 — implement:** inject `tracer` like the other seams (default `NoopTracer`); wrap the
  phase in `async with tracer.span(...)`. Today the span emits a `log_operation`-style line; the
  backend is deferred.
- [ ] **Step 3 — gate green.**

### Task 9 — health-check helper (TDD)
**Files:** Create `lib/lib/observability/health.py`; Test `lib/tests/test_health_helpers.py`.
**Produces:** `check_dependency(name, probe_coro, timeout_s) → (name, "ok"|"degraded"|"down")` (spec §4.3).
- [ ] **Step 1 — failing test:** a probe that returns → `ok`; one that raises → `down`; one that times
  out (via `with_timeout`) → `down` (or `degraded` on slow-but-ok per the threshold); never raises out.
  Run → FAIL.
- [ ] **Step 2 — implement** the helper using `with_timeout`; catch + classify, return the tuple, log
  a structured line. No dependency import here (callers pass the probe coro).
- [ ] **Step 3 — gate green.**

### Task 10 — `/health` + `/health/detailed` per service (TDD)
**Files:** Create `src/admin/app/routes/health.py`; add the routes to ai-agents/mcp-data/mcp-capability;
Test `src/admin/tests/test_health.py` (+ per-service).
**Produces:** liveness + readiness per service incl. new infra (spec §4.3 table).
- [ ] **Step 1 — failing test:** `/health` → `200 {"status":"ok"}` always (no deps touched);
  `/health/detailed` with **healthy fakes** → `200` + a per-dependency all-`ok` map; with a fake
  dependency **down** → `503` + the map showing that dep `down` (never an unhandled 500). Run → FAIL.
- [ ] **Step 2 — implement:** `/health` returns static ok. `/health/detailed` runs each owned
  dependency's probe via Task 9's helper and rolls up: admin → Mongo/Redis/RabbitMQ/MinIO; ai-agents →
  mcp-data/mcp-capability/RabbitMQ/**LiveKit**; mcp-data → Mongo; mcp-capability → Qdrant/Redis/**Docker
  daemon ping**. Mount on the same HTTP surface (admin: alongside `/public/*` via the dispatcher).
  **`/health/detailed` is bound to the internal/ops surface** (or returns only coarse status publicly) —
  don't leak topology (spec §11).
- [ ] **Step 3 — gate green** (fakes report healthy; no real infra in the gate). **Live check (manual,
  NOT the gate):** hit `/health/detailed` against real Mongo/Redis/Docker/LiveKit and confirm a stopped
  dependency flips that entry to `down` + a `503`.

### Task 11 — best-effort-op observability + alert definitions (TDD)
**Files:** Modify the erasure cascade, notification send, alert sweep, clip-retention sweep to log the
§4.4 success metric + failure line; Test (assert the structured lines).
**Produces:** every best-effort async op is observable + has a named alert condition (spec §4.4).
- [ ] **Step 1 — failing test:** each op emits `op.done <name> …=<count>` on success and a
  `WARNING`/`ERROR` with actionable context on a (faked) failure, **continuing** the best-effort flow
  (erasure: a per-repo failure is `ERROR`-logged and the cascade proceeds; alert/clip sweep: a per-row
  failure is logged and the sweep finishes). Run → FAIL.
- [ ] **Step 2 — implement** the structured success/failure logs (reuse `log_operation`/`log_context`
  for `duration_ms` + count). Record the **alert conditions** from the §4.4 table as comments/docstrings
  next to each op (the definitions a later alert backend points at; not a wired alertmanager).
- [ ] **Step 3 — gate green.**

---

## RETENTION  (audit Part B "retention/TTL … unbounded growth" — spec §5)

### Task 12 — TTL indexes for self-expiring collections (TDD)
**Files:** Modify `src/admin/app/infra/db.py` (the single index authority); Test (assert the specs).
**Produces:** TTL on `notifications` + `practice_sessions` (spec §5 table).
- [ ] **Step 1 — failing test:** assert `INDEXES` contains
  `IndexSpec("notifications", "created_at", {"expireAfterSeconds": <180d>})` and
  `IndexSpec("practice_sessions", "created_at", {"expireAfterSeconds": <90d>})`, with the seconds
  sourced from `Settings` (e.g. `notifications_retention_days`, `practice_retention_days`). Run → FAIL.
- [ ] **Step 2 — implement:** add the TTL `IndexSpec`s (on the **tz-aware UTC** `created_at` field so
  Mongo's reaper computes expiry correctly — ties to §8). These need **no sweep code** — Mongo reaps in
  the background.
- [ ] **Step 3 — gate green** (`ensure_indexes` is idempotent; the index list is import-only here).

### Task 13 — aged sweeps for application-lifecycle collections (TDD)
**Files:** Create `src/admin/app/resources/retention.py`; register on `service/scheduler.py`; Test
`tests/test_retention_sweeps.py`.
**Produces:** aged sweep for `messages`/`message_threads` (post-decision 365d) + clip-row + `audit_logs`
long-retention (spec §5 — the cases a flat TTL can't express).
- [ ] **Step 1 — failing test** (fake repos): a sweep removes rows whose **parent application is
  terminal AND older than the retention window**, **keeps** rows on a live (non-terminal) application
  regardless of age, is **idempotent** (second run removes nothing), and **logs-and-continues** on a
  per-row delete failure (best-effort). `audit_logs` sweep uses the **long** clock and is **NOT**
  subject to candidate-erasure (assert an erasure run leaves audit rows). Run → FAIL.
- [ ] **Step 2 — implement** the sweep functions (query terminal+aged, delete in batches, structured
  log per §4.4) and register them on the **existing** scheduler loop (the same loop the alert sweep
  bolts onto — no new service). Idempotent + best-effort.
- [ ] **Step 3 — gate green.**

### Task 14 — retention ↔ erasure-cascade consistency (TDD)
**Files:** Modify `CandidateEraser` cascade targets (Inc 0 stubs) to confirm every §5 collection is a
target **except** `audit_logs`; Test.
**Produces:** retention (passive TTL) and erasure (active obligation) are orthogonal + complete (spec §5).
- [ ] **Step 1 — failing test:** an erasure run for a user deletes their `notifications`, `messages`,
  `message_threads`, `practice_sessions`, and `delete_raw`s their `video_answers` clips; and
  **leaves `audit_logs`** (the accountability record survives erasure — it stores ids/actions, not
  erasable PII bodies). Run → FAIL.
- [ ] **Step 2 — implement:** ensure each collection is wired into the cascade (joining the Inc-0
  stub points); explicitly **exclude `audit_logs`** with a comment citing the spec §5 rationale.
- [ ] **Step 3 — gate green.** (Pairs with the erasure spec's own "skips an absent/None repo
  gracefully" test — the cascade tolerates a not-yet-built repo.)

---

## INDEX-MIGRATION  (audit Part B "index migration … online builds block writes" — spec §7)

### Task 15 — safe index deployment (idempotent ensure + online-build discipline) (TDD + manual)
**Files:** Modify `src/admin/app/infra/db.py` (new pillar indexes); add a dup-scan guard for new unique
indexes on populated collections; Test idempotency.
**Produces:** new indexes deploy without blocking writes (spec §7).
- [ ] **Step 1 — failing test (idempotency):** running `ensure_indexes(db, INDEXES)` **twice** against
  a fake/real Mongo raises nothing and creates no duplicate index (Mongo no-ops existing indexes —
  re-ensure is the deploy model). Add the new pillar indexes the specs require, incl. the audit's
  required `IndexSpec("messages", [("thread_id", 1), ("created_at", 1)])`. Run → FAIL (until added).
- [ ] **Step 2 — implement:** declare all new indexes in `INDEXES`; for any **new unique index on a
  collection that may already hold data**, add a **dup-scan pre-check** step (a unique build *fails* on
  existing duplicates) — documented in the safe-deploy checklist (spec §7.4). Boot-time `ensure_indexes`
  runs **before** the service accepts traffic (startup hook) so a build never races this process's writes.
- [ ] **Step 3 — gate green.** **Manual/integration (NOT the gate):** on a *populated* collection, run
  the ensure and confirm the build is **online** (writes proceed during the build — Mongo 4.2+ optimized
  build, no exclusive lock); flag `applications`/`jobs`/post-launch `messages` for a **low-traffic
  window** ensure per spec §7.2/§7.4.

---

## TIMEZONE  (audit Part B "UTC timezone discipline" — spec §8)

### Task 16 — UTC discipline: ruff DTZ guard + round-trip test (TDD)
**Files:** Modify the repo ruff config (enable `DTZ`); fix any naive-datetime call sites surfaced;
Test `src/admin/tests/test_timezone_discipline.py`.
**Produces:** naive datetimes **fail the gate**; timestamps round-trip tz-aware UTC (spec §8).
- [ ] **Step 1 — enable the guard:** add `DTZ` (flake8-datetimez) to the ruff `select` set (bans
  `DTZ003` `datetime.utcnow()` + `DTZ005` `datetime.now()` without tz). Run `bash scripts/check.sh` →
  it now **FAILS** on any existing naive call.
- [ ] **Step 2 — fix call sites:** replace `datetime.utcnow()` / naive `now()` with `datetime.now(UTC)`
  (tz-aware); apply the **one-`now`-per-function** rule. A deliberate naive call (if any third-party
  glue needs it) gets a scoped `# noqa: DTZ` **with a reason** — no silent exceptions.
- [ ] **Step 3 — round-trip test:** assert representative model timestamps (notification `created_at`,
  message `created_at`, an audit row) come back **tz-aware UTC** (`tzinfo is not None`, offset 0) —
  belt-and-braces over the lint, covering values read back from Mongo. Run → PASS.
- [ ] **Step 4 — gate green** (DTZ now part of the permanent gate).

---

## TESTS  (audit Part B "E2E, legacy-migration, concurrency, load tests named" — spec §9)

### Task 17 — forged-`comp_id` rejection (tenant-isolation integration) (TDD)
**Files:** Test `src/admin/tests/test_forged_comp_id.py`.
**Produces:** no new endpoint trusts a client-supplied tenant id (spec §9.1).
- [ ] **Step 1 — failing test:** drive each new gRPC surface (messaging, discovery
  `SearchCandidates`, notifications, saved/alerts) with a token for **comp A** and a **forged comp B**
  `comp_id` (in a body field / path id / filter); assert **403 or empty**, **never** a comp-B row
  returned, and an **audit/log** line for the rejected attempt. Run → FAIL (or pass once scoping is
  correct — this test is the *proof* the scoping holds at every endpoint).
- [ ] **Step 2 — confirm scoping:** if any endpoint reads the client `comp_id` instead of the
  authenticated one, fix it to derive `comp_id` from the auth context (the architecture invariant).
- [ ] **Step 3 — gate green.** (The platform-wide twin of the sandbox's `test_sandbox_no_cross_tenant_leak`.)

### Task 18 — end-to-end funnel test (TDD)
**Files:** Test `src/admin/tests/test_e2e_funnel.py`.
**Produces:** the new pillars compose into the existing funnel (spec §9.2).
- [ ] **Step 1 — failing test:** walk one candidate **apply → aptitude (graded via fake) → interview
  (fake brain) → report → recruiter decision → notification**; assert each transition is CAS-guarded,
  each artifact row is written, and the `TransitionNotifier` writes a notification row **and** calls the
  (`Logging`)`Notifier` at the end. Use the existing fakes throughout. Run → FAIL/PASS.
- [ ] **Step 2 — implement** any missing wiring the walk reveals (it's the regression net that a
  hardening change didn't break the golden path).
- [ ] **Step 3 — gate green.**

### Task 19 — concurrency / CAS test: two recruiters decide at once (TDD)
**Files:** Test `src/admin/tests/test_concurrent_decision.py`.
**Produces:** the CAS guard holds under contention (spec §9.3).
- [ ] **Step 1 — failing test:** fire **two** `advance_application` decisions racing on the **same
  application**; assert **exactly one** succeeds (single state change), the other gets a clean
  **conflict** (no second transition), and there is **exactly one** audit row + **one** notification
  (no torn/double writes). Run → FAIL/PASS.
- [ ] **Step 2 — confirm** the funnel's compare-and-set + the unique-index backstop produce the
  single-winner outcome (fix if a race slips through).
- [ ] **Step 3 — gate green.**

### Task 20 — load/perf targets recorded (explicit "not load-tested in v2.0")
**Files:** (doc-anchored) a marker test or a `tests/LOAD_TARGETS.md` cross-link; no harness.
**Produces:** the named SLOs + the explicit not-load-tested statement (spec §9.4).
- [ ] **Step 1 — record** the spec §9.4 target table (search < 300 ms p95, writes < 200 ms p95, sweeps
  within their interval, etc.) and the explicit **"v2.0 is NOT load-tested; these are the deferred
  acceptance criteria"** statement where the test suite references it. No load harness is built or run
  in v2.0 (demo-first posture).
- [ ] **Step 2 — gate green** (documentation/marker only — nothing executes).

---

## Verification (end-to-end)
1. **Per task:** `bash scripts/check.sh` GREEN (grows from **423**). The gate stays **offline +
   container-free** — no real Mongo/Redis/Docker/LiveKit; live health + online-index-build are
   manual/integration only.
2. **Rate-limits:** every new gRPC method + `/public/*` route has a policy entry (Task 4 self-check —
   an un-limited endpoint **fails the gate**); blocked → opaque `429` / `RESOURCE_EXHAUSTED` + retry
   hint with **no quota leak**; fail-open vs fail-closed asserted (Task 3).
3. **Observability:** every new request binds `comp_id`/`user_id`/`correlation_id` (Task 5); the id
   propagates across the MCP/event hop (Task 6); `/health` + `/health/detailed` per service incl. the
   new infra (Task 10); best-effort ops log success metrics + failure lines with named alert conditions
   (Task 11).
4. **Retention:** `notifications` + `practice_sessions` have TTL indexes (Task 12); `messages`/threads/
   clips/audit have the right aged sweeps (Task 13, idempotent + best-effort); every collection except
   `audit_logs` is an erasure-cascade target (Task 14).
5. **Index-migration:** re-ensure is a no-op (Task 15 idempotency test); the audit's required
   `messages (thread_id, created_at)` index exists; new unique indexes on populated collections get a
   dup-scan; large-collection builds flagged for a low-traffic online ensure.
6. **Timezone:** `DTZ` ruff rule is in the permanent gate (naive datetime → fail); timestamps
   round-trip tz-aware UTC (Task 16).
7. **Cross-cutting tests:** forged-`comp_id` rejected at every new endpoint (Task 17); E2E funnel green
   (Task 18); concurrent-decision single-winner CAS (Task 19); load targets recorded with the explicit
   not-load-tested statement (Task 20).

## Resolved gaps (completeness audit 2026-06-19)

Resolving `2026-06-19-v2-completeness-audit.md` — **Part B "Cross-cutting / data-model / testing"** +
**Part A #4 / #5**. Each is now a concrete `- [ ]` task above:

- **Consolidated rate-limit policy table** (Part B + Part A #4) → Tasks 1–4: the §3.3 table as a
  `Settings`-backed map, the `/public/*` per-IP gate + the gRPC interceptor (opaque-429 + `Retry-After`,
  trusted-proxy `_client_ip`, reusing `lib.redis.RateLimiter`), and the completeness self-check so no
  endpoint ships un-limited.
- **Observability/alerting for best-effort async ops** (Part B + Part A #5) → Tasks 5, 11: bind
  `comp_id`/`user_id`/`correlation_id` at entrypoints; structured success-metric + failure line + named
  alert condition for erasure, notification send, alert sweep, clip-retention sweep.
- **Tracing seams + health for the new infra** (Part A #5) → Tasks 7–10: a `Tracer` seam (no-op default)
  on practice/run_code/video, and `/health` + `/health/detailed` per service incl. sandbox/Docker,
  LiveKit, Qdrant.
- **Retention/TTL for notifications + practice + video** (Part B "unbounded growth") → Tasks 12–14: TTL
  indexes for self-expiring collections, aged sweeps for application-lifecycle ones, tied to the erasure
  cascade (audit excluded from erasure, with rationale).
- **Index-migration strategy** (Part B "online builds block writes") → Task 15: idempotent
  re-ensure as the deploy model, online builds, dup-scan for new unique indexes, low-traffic-window
  flag for large collections; includes the audit's required `messages (thread_id, created_at)` index.
- **UTC timezone discipline** (Part B) → Task 16: the `DTZ` ruff guard (naive datetime fails the gate)
  + a round-trip tz-aware assertion test.
- **Forged-`comp_id` rejection + E2E + concurrency + load tests named** (Part B) → Tasks 17–20.
- **Capacity/growth estimates** (Part B) → spec §6 (order-of-magnitude at 1M-candidate / 10K-company;
  video clips identified as the one large store, kept bounded by §5 post-decision expiry).
- **`Notifier` contract too narrow** (Part B) → **owned by the notifications-center plan** (its §3.7
  full-row widening); this module depends on it and does not duplicate it (single source of truth).

## Risks / re-verify at execution
- **Fail-open vs fail-closed (rate-limit).** Confirm the abuse-control limits fail **open** (a Redis
  blip must not down the marketplace) and the security ops (password/email/2FA/session-revoke, row 10;
  video presign, row 12) fail **closed** (a limiter outage must not open a brute-force/storage-exhaust
  window). This split is per-row in the policy map — re-check each row's `fail_mode`.
- **Opaque-429 leak.** Re-grep the throttled responses to confirm **no** quota count / limit value /
  per-endpoint detail leaks in the body or gRPC message — only `Retry-After`/`retry-after` carries the
  hint. A helpful-but-leaky error is the easy mistake here.
- **Online index build on a big collection.** The "online build doesn't block writes" guarantee is
  Mongo-version dependent (4.2+ optimized build); **re-verify on the target engine** that a build on a
  populated `applications`/`jobs` lets writes proceed, and run the largest builds in a low-traffic
  window. A unique-index build **fails on existing duplicates** — the dup-scan pre-check is mandatory.
- **TTL field must be tz-aware UTC.** Mongo's TTL reaper computes expiry from the stored datetime; a
  naive/local timestamp expires at the wrong instant. The §8 DTZ guard + the tz-aware round-trip test
  are what keep TTL correct — verify the TTL fields specifically.
- **`audit_logs` erasure exclusion.** Confirm the cascade **deliberately skips** `audit_logs` (the
  accountability record must survive erasure) — and that audit rows store ids/actions, **not** erasable
  PII bodies, so the exclusion is sound. A jurisdiction needing audit-PII erasure is a targeted-redaction
  follow-up, not a blanket cascade (spec §5 + §11).
- **Correlation-id propagation.** Verify the downstream services **continue** the same id (not mint a
  fresh one) so a single request is stitchable end-to-end; the `set_correlation_id` → Token → `reset`
  lifecycle must fire on every ingress, including the event-consumer path.
