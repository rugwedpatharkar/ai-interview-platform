# Platform Robustness & Observability — Design Spec

**Date:** 2026-06-21
**Branch:** `claude/elated-khayyam-135fcb` (worktree of `main`)
**Status:** Awaiting user review → handoff to `writing-plans`
**Scope:** Comprehensive backend hardening + frontend↔backend wiring closure + new
observability platform, across all 4 services (admin, ai-agents, mcp-data, mcp-capability),
shared `lib`, and both frontend apps (candidate + company).
**Goal in one sentence:** Raise the entire stack to the `PRODUCTION_STANDARDS.md` bar
uniformly — every external call timed-out, every business operation logged with
structured context, every boundary translated to typed errors, every funnel transition
audit-logged and instrumented — and add an end-to-end client error + analytics pipeline.

---

## 1. Why this spec exists

The audit (read-only, two parallel Explore agents, ~96k LOC) found the platform has a
mature baseline — Loguru with correlation IDs + PII redaction, `with_timeout`/`@retry`,
OTel + Prometheus wrappers, audit-log pipeline, gRPC-web transport — but the bar is not
evenly applied:

- `mcp-data` has ~18 MongoDB calls without `with_timeout` (vulnerable to indefinite hang).
- `mcp-capability` has 7 Redis calls without `with_timeout`.
- ~192 admin resource functions lack structured operation logging (entry/exit/error w/ duration).
- ~25 catch-and-reraise blocks across mcp-data/ai-agents do not log the caught exception.
- `ai-agents` Redis session-store has 4 raw operations without timeouts.
- Frontend transport has no timeout on the cookie-refresh fetch (SSO users can be stranded).
- Cross-tab token sync is missing (Tab B sees stale token after Tab A logs in).
- `IntegrityTimeline` is a frontend cast-seam mock — backend RPC not yet shipped.
- Hold/reject decision buttons are UI-only fakes — backend RPCs do not exist.
- `listApplicants` / `getCandidateRecommendations` / `listNotifications` fetch full lists
  with no server-side pagination cursor.
- Expected domain errors (`NotFoundError`, `ExpiredSignatureError`) log full tracebacks
  server-side, polluting logs.
- No client-side error pipeline; `console.error` is invisible in production.
- No funnel analytics events; dashboard KPIs derived client-side.

The user's stated requirements:
> robust backend · proper exception handling · detailed logging in all functionalities ·
> optimized · extreme flexibility · never fail at any level · list issues, fixes,
> optimizations, improvements · create implementation plan

Resolution: comprehensive 6-phase program (Approach A), behavior-preservation by default
with targeted bug fixes where the audit justifies them.

---

## 2. Cross-cutting standards (rules of the road for every phase)

These conventions consolidate `docs/superpowers/plans/PRODUCTION_STANDARDS.md` and the
user's global Python `CLAUDE.md` rules into per-call-site rules. Every phase enforces them.

### 2.1 Error hierarchy (introduced in Phase 0)

New file `lib/lib/errors.py`. A single typed exception tree. Boundary handlers translate
it to gRPC status uniformly; internals raise it without per-RPC `except` ladders.

```
AppError                    (base; .code, .public_message, .context)
├── ValidationError          → gRPC INVALID_ARGUMENT
├── NotFoundError            → gRPC NOT_FOUND            (log DEBUG, no traceback)
├── ConflictError            → gRPC ALREADY_EXISTS
├── PermissionError          → gRPC PERMISSION_DENIED
├── AuthError                → gRPC UNAUTHENTICATED      (log DEBUG, no traceback)
├── DependencyError          → gRPC UNAVAILABLE          (Mongo/Redis/Rabbit/LLM down)
├── TimeoutError (re-export) → gRPC DEADLINE_EXCEEDED
├── BusinessRuleError        → gRPC FAILED_PRECONDITION
└── InternalError            → gRPC INTERNAL             (only escape hatch)
```

Central translator in `lib/lib/grpcweb.py` replaces the per-resource `_STATUS` dicts
(e.g. `src/admin/app/resources/auth.py:36-46`). This generalizes the recently-fixed
register `ValidationError → INTERNAL` leak (commit `d4f0271`).

### 2.2 Logging convention

| Layer | Standard | Tool |
|---|---|---|
| RPC handler (route) | entry, exit w/ duration_ms, error w/ correlation_id | `log_context` (exists) |
| Resource (business logic) | entry, exit w/ duration_ms, error w/ context bind | `log_context` (gap: 192 funcs in admin) |
| Repository / external seam | entry+timeout+error context | `log_context` + `with_timeout` |
| Domain error caught at boundary | `log.debug(...)` — no traceback | new helper `log_domain_error()` |
| Unexpected exception | `log.exception(...)` then re-raise | enforced via `log_context` |
| Best-effort soft-fail (telemetry/notif) | `log.warning(...)` and continue | existing pattern |

Drop principle: every log line crossing a service boundary carries `correlation_id`,
`comp_id`, `user_id` if known. PII redaction stays automatic via the existing
`_redact_extra` patcher.

### 2.3 Timeout/retry knob model (extreme flexibility)

All timeouts move to settings (env-driven) via `lib/lib/config.py`:

```
MONGO_OP_TIMEOUT_SECONDS=10
REDIS_OP_TIMEOUT_SECONDS=5
RABBITMQ_PUBLISH_TIMEOUT_SECONDS=5
LLM_CALL_TIMEOUT_SECONDS=30
LLM_CALL_RETRY_ATTEMPTS=3
MCP_CALL_TIMEOUT_SECONDS=20
STORAGE_OP_TIMEOUT_SECONDS=35
HTTP_CLIENT_TIMEOUT_SECONDS=15
FE_TRANSPORT_REFRESH_TIMEOUT_MS=10000
```

Each `with_timeout(..., op="...")` reads via a tiny helper module
(`timeouts.mongo()`, `timeouts.redis()`, etc.). No magic numbers in code, per-environment
tuning via env. This is the "extreme flexibility" surface.

### 2.4 Idempotency + audit contract

Mutating resource functions declare idempotency stance via a one-line decorator-comment
pair, naming the natural key the operation is safe to re-run against. Concrete examples:

- `@idempotent_by("application_id + target_state")` for `decisions.holdApplication` —
  re-running with the same `application_id` and `target_state="on_hold"` is a no-op that
  returns the original response.
- `@idempotent_by("event_id")` for `recordClientError` / `recordClientEvent` — dedup via
  Redis SET, 24h TTL (per §3.2).
- `@idempotent_by("application_id + stage_name")` for funnel transitions — re-emit of
  the same stage transition writes once.

Audit-log write happens **after** the durable mutation, in the same handler. Soft-fail
allowed on the audit write iff a replay is queued via `audit.enqueue_replay`, which
durably stores the unwritten audit row in a dedicated retry collection that a background
consumer drains. Audit data is correctness-critical (compliance) — a fail-and-forget
swallow is never allowed.

### 2.5 What we explicitly do NOT add

(Per the user's global Python `CLAUDE.md` rules.)

- No defensive `isinstance` / `int()` casts on typed params.
- No nested `try/except`.
- No `except: pass`.
- No per-call magic-number timeouts.
- No comments explaining WHAT code does — only WHY when non-obvious.
- No backwards-compatibility shims for code we own end-to-end.

---

## 3. Phase-by-phase scope (the 6-phase program)

Each phase is independently shippable. Within a phase, parallel workstreams are tagged
`[BE]` / `[FE]` / `[INFRA]`. Each phase closes only when the Section 4 Definition of Done
is met.

### Phase 0 — Shared infrastructure (foundation)

Everything later phases consume.

- `[lib]` `lib/lib/errors.py` — error hierarchy from §2.1 with `to_grpc_status()` mapper.
- `[lib]` `lib/lib/config.py` — timeout/retry knobs from §2.3; expose `timeouts.mongo()` etc.
- `[lib]` `lib/lib/grpcweb.py` — central `AppError` translator.
- `[lib]` `lib/lib/logging.py` — add `log_domain_error()` helper (debug-no-traceback).
- `[lib]` `lib/lib/audit.py` — extract scattered audit-write pattern into one helper with
  retryable queue (`audit.enqueue_replay`).
- `[lib]` Tests: TDD failing-tests-first for each new lib piece.
- **Gate:** `scripts/check.sh` green; services unchanged.

### Phase 1 — Stop the bleeding (deploy-blocking P0)

- `[BE/mcp-data]` Wrap all 18 Mongo calls in `src/mcp-data/app/tools.py` with
  `with_timeout(timeouts.mongo(), op=...)`.
- `[BE/mcp-capability]` Wrap 7 Redis calls in `src/mcp-capability/app/tools.py`
  (lines 133, 135, 152, 183, 203-204, 207) with `with_timeout(timeouts.redis(), op=...)`.
- `[BE/ai-agents]` Wrap 4 Redis session-store sites in `src/ai-agents/app/infra/sessions.py`
  (lines 65, 70, 75 + get/list_in_progress).
- `[BE]` Demote expected-domain-error tracebacks at gRPC boundary via Phase-0
  `log_domain_error` — addresses the observability finding documented in `24e117b`.
- `[FE]` `packages/shared/src/transport.ts` cookie-refresh — `AbortController` with 10s timeout.
- `[FE]` `packages/shared/src/tokens.ts` — `storage` event listener for cross-tab token sync.
- **Gate:** `scripts/check.sh` + FE typecheck/build + live login→refresh→logout smoke
  under induced 500ms Mongo latency.

### Phase 2 — Backend robustness sweep (P1)

- `[BE/admin]` **Resource-layer op-logging coverage** — add
  `async with log_context("resource.<file>.<func>", **bind)` wrapper to ~192 resource
  functions across 29 files. Commit-per-file (per CLAUDE.md "one commit per pattern
  category"). Lint rule (§4.3) enforces 100% coverage so it can't be half-done.
- `[BE/admin]` Replace per-resource `_STATUS` dicts with the Phase-0 central translator.
- `[BE]` Add error logs to ~25 catch-and-reraise blocks (mcp-data ~18, mcp-capability 2,
  ai-agents 5).
- `[BE/admin]` Fix presigned-URL silent failure
  (`src/admin/app/resources/company_profile.py:68-69`) → return error instead of `""`.
- `[BE/admin]` Audit-log gap sweep — add missing audit writes on automated decisions
  found by audit (specific sites to be enumerated in implementation plan).
- `[BE]` Move all magic-number timeouts to Phase-0 settings knobs.
- **Gate:** `scripts/check.sh` + 100% of admin resources covered by `log_context`
  (lint check from §4.3).

### Phase 3 — Frontend robustness sweep (P1/P2)

- `[FE]` Settings page — remove `USE_MOCK_SETTINGS` env gate; all `settings.*` RPCs live.
- `[FE]` Resume-parse polling — jittered exponential backoff (0.5s → 2s → 5s),
  "still parsing" toast after 10s.
- `[FE]` Report polling (`applicants/[appId]`) — max-poll cap, manual-refresh fallback.
- `[FE]` Dashboard application polling — backoff + cap.
- `[FE]` Defensive field access on cast-seam reports (`toReportDTO`) — explicit `?.`/`??`.
- `[FE]` Friendly error-message mapping — gRPC code → user message lookup.
- `[FE]` Submit-button `disabled` when form invalid OR pending.
- `[FE]` ICS RPC error surfacing via toast.
- **Gate:** FE typecheck + build green, live user flows tested per page.

### Phase 4 — Missing wirings (close FE↔BE gaps)

New RPC contracts pinned in §3.1 below.

- `[BE/admin]` `decisions.holdApplication` + `decisions.rejectApplication` RPCs end-to-end.
- `[BE/admin]` `reports.getIntegrityTimeline` RPC end-to-end.
- `[BE/admin]` Server-side cursor pagination on `listApplicants`,
  `getCandidateRecommendations`, `listNotifications`, `talent.getTalentPool`.
- `[BE/admin]` Unified `mark_read` resource (sequence-numbered, idempotent) — keeps
  separate messaging/notification RPCs but routes both through one backend resource.
- `[FE]` Wire the above; replace UI-only toasts and cast-seam mocks.
- **Gate:** new RPCs covered by unit + integration tests; FE pages re-tested.

### Phase 5 — Observability platform (the new layer)

Contracts pinned in §3.2-3.5.

- `[BE/admin]` `ObservabilityService` with `recordClientError` + `recordClientEvent` RPCs.
- `[BE/admin]` `client_errors` (30d TTL) + `client_events` (90d TTL) collections, tenant-scoped.
- `[BE]` Request-id (`X-Correlation-ID`) reflected in every RPC response header.
- `[FE]` `packages/shared/src/observability.ts` — global error boundary + `track()` + `recordError()`.
- `[FE]` Wire pages to emit 12 funnel events + 4 quality events (§3.3).
- `[INFRA]` Prometheus scrape config + OTLP exporter env wiring in `docker-compose.yml` + `deploy/`.
- `[INFRA]` `docs/superpowers/plans/OBSERVABILITY.md` — SLOs, alert rules, dashboard list.
- **Gate:** error+event flow E2E tested, dashboards render.

### Phase 6 — Polish + final verification

- `[FE]` Messaging SSE (replace 30s long-poll) — gRPC server-streaming with reconnect+backoff.
- `[BE/voice]` `voice_worker` graceful-shutdown audit — SIGTERM drains in-flight sessions
  + redis-checkpoints, then exits.
- `[BE]` Soft-fail vs hard-fail classifier doc — every `except` in the codebase tagged
  correct-by-design.
- `[BE/FE]` Full E2E smoke under chaos profiles (§4.4).
- `[INFRA]` Final SLO sign-off — error budget targets per SLO.
- **Gate:** chaos smoke green + all earlier gates re-run.

### Cross-phase artifacts

- Each phase opens a HANDOFF doc at
  `docs/superpowers/plans/<YYYY-MM-DD>-robustness-phase-N.md`
  per the user's "document-everything for continuation" memory.
- Each phase ends with `git commit chore(robustness-phase-N): close` + a
  verified-against-gate checklist.
- Memory updated after each phase with a pointer to the HANDOFF doc.

---

## 3.1 Phase 4 — New RPC contracts (admin-service proto + `app/resources/*`)

### decisions.holdApplication / decisions.rejectApplication

```
HoldApplicationRequest    { application_id, reason_code, free_text? }
HoldApplicationResponse   { application_id, new_state = "on_hold", audited_at }
RejectApplicationRequest  { application_id, reason_code, free_text? }
RejectApplicationResponse { application_id, new_state = "rejected", audited_at }
```

- Recruiter-scoped, requires `comp_id` match on the application's `job_id`.
- Idempotent by `(application_id, target_state)` — re-call returns same response.
- Writes `audit_logs` row; publishes `application.held` / `application.rejected` event
  so candidate notification fires.
- gRPC status: `FAILED_PRECONDITION` if state already terminal.
- FE site to wire: `apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:166-177`
  (replaces UI-only toasts).

### reports.getIntegrityTimeline

```
GetIntegrityTimelineRequest  { application_id }
GetIntegrityTimelineResponse {
  events: [{ event_id, type, severity (LOW|MED|HIGH|CRITICAL),
             at_ms, detector, payload_json, auto_terminated_at_ms? }],
  summary: { count_by_severity, score (0-100), auto_terminated: bool }
}
```

- Reads from existing `proctoring_events` collection (event-stream from interview).
- Tenant-scoped via job → comp_id.
- Empty events list returns `events: []` (not `NOT_FOUND`).
- FE site: replace cast-seam mock at
  `apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:131-136`.

### Cursor pagination

```
ListApplicantsRequest               { job_id, page_size <= 200, page_token?, filters? }
ListApplicantsResponse              { applicants, next_page_token, total_count? }
GetCandidateRecommendationsRequest  { page_size, page_token? }
ListNotificationsRequest            { page_size, page_token?, unread_only? }
GetTalentPoolRequest                { comp_id, page_size, page_token?, filters? }
```

- Opaque base64 cursor (Mongo `_id` + tie-breaker); stateless; no offset/limit pattern.
- `page_size` capped at 200 server-side regardless of client value.
- `total_count` returned only on first page (uses `estimatedDocumentCount` to avoid scan).

### Unified mark-read

- Keep `messaging.markRead` and `notification.markRead` as separate RPCs (different
  domains).
- Add shared backend resource `mark_read.mark_thread_read(comp_id, user_id, kind, id,
  seq_no)` that both delegate to.
- Server enforces a monotonic `seq_no` per `(user_id, kind, id)` so concurrent mutations
  can't desync the unread count.

---

## 3.2 Phase 5 — ObservabilityService contracts

```
RecordClientErrorRequest  {
  events: [{
    correlation_id, event_id (client-uuid),
    occurred_at_ms,
    component, route, build_sha, user_agent_hash,
    error: { name, message, stack_truncated_8k },
    context: { user_id?, comp_id?, session_id?, role? }
  }] (max 50 per call)
}
RecordClientErrorResponse { accepted_event_ids }

RecordClientEventRequest  {
  events: [{
    correlation_id, event_id,
    occurred_at_ms,
    name (enum, see §3.3),
    route,
    properties_json (capped 4KB),
    context: { user_id?, comp_id?, session_id?, role? }
  }] (max 100 per call)
}
RecordClientEventResponse { accepted_event_ids }
```

- Both RPCs idempotent on `event_id` (dedupe via Redis SET 24h TTL).
- Anonymous calls allowed (events from unauth pages like landing, register-error).
- **Server-side identity enforcement:** the `context` object in the request is
  **descriptive, not authoritative**. The server discards every field in `context` and
  re-derives `user_id`, `comp_id`, `role` from the access token (if present). For
  anonymous calls, all three are null. Clients cannot self-attribute events to other
  users or tenants.
- Stack traces redacted at the boundary (PII regex; emails/UUIDs scrubbed) — same list
  as `lib/lib/logging.py:_SENSITIVE`.
- Storage: `client_errors` (30d TTL), `client_events` (90d TTL).

### FE SDK `packages/shared/src/observability.ts`

```ts
initObservability({ buildSha, transport })
track(name: ClientEventName, properties?: Record<string, JsonValue>): void
recordError(err: unknown, ctx?: { component?: string }): void
withTraceId<T>(fn: () => Promise<T>): Promise<T>   // surfaces correlation_id
```

- Buffered (1s flush or 50 events), backed by `navigator.sendBeacon` on page-unload.
- React error boundary integration (catches render errors).
- `window.onerror` + `window.onunhandledrejection` registered globally.
- Strips secrets/PII before send using the same redaction list as the backend.

---

## 3.3 Funnel event vocabulary

12 funnel events from the closed-loop in `ARCHITECTURE.md §7.1`, plus 4 quality events.

| Event | Fires at | Required props |
|---|---|---|
| `auth.registered` | post-register success | `role` (candidate/recruiter) |
| `auth.logged_in` | post-login success | `role`, `method` (password/oauth) |
| `job.viewed` | `/jobs/[id]` mount | `job_id` |
| `application.started` | apply CTA click | `job_id` |
| `application.submitted` | submit success | `job_id`, `application_id` |
| `aptitude.started` | aptitude page mount | `application_id` |
| `aptitude.submitted` | aptitude submit success | `application_id`, `duration_ms` |
| `interview.started` | interview RTC connected | `application_id` |
| `interview.completed` | interview end (any reason) | `application_id`, `end_reason` |
| `report.viewed` | recruiter opens applicant report | `application_id` |
| `decision.made` | hold/reject/advance | `application_id`, `decision` |
| `notification.opened` | inbox item click | `notification_id`, `kind` |
| `client.error` | global error handler | `component`, `route` |
| `client.slow_render` | render > 3s | `route`, `duration_ms` |
| `api.timeout` | RPC timeout | `service`, `rpc` |
| `api.unauthorized_refresh` | 401 → refresh attempt | `service`, `rpc` |

---

## 3.4 Request-id propagation

- Backend already emits `X-Correlation-ID` per request
  (`lib/lib/web.py:CorrelationIdMiddleware`).
- Phase 5: FE transport (`packages/shared/src/transport.ts`) captures the response
  header, stores it on the call result, exposes via `withTraceId()`.
- Error boundary attaches the id to every `recordError` call so an FE error and a BE
  log line share an id end-to-end.

---

## 3.5 Storage + retention

- `client_errors`: TTL 30 days on `occurred_at`. Index `(comp_id, occurred_at)`.
- `client_events`: TTL 90 days on `occurred_at`. Index `(comp_id, name, occurred_at)`.
- Existing `audit_logs`: keep current retention (compliance-driven, untouched).
- All Phase-5 collections respect `comp_id` tenant scoping (defense in depth at
  `mcp-data` per `PRODUCTION_STANDARDS.md §4`).

---

## 4. Testing, verification, sequencing

### 4.1 TDD discipline

Every code change: failing test → watched fail → minimal code → green → commit.

| Layer | Test type | Boundary |
|---|---|---|
| `lib/lib/errors.py`, `lib/lib/grpcweb.py` | Unit, no infra | `pytest` |
| Admin resource layer (logging coverage) | Unit, mocked repos | `pytest`, `FakeCollection` |
| Mongo/Redis timeout wraps | Unit, fake clients | `FakeRedis`, repo fakes |
| New RPCs (Phase 4) | Unit + integration | mock + docker-compose Mongo |
| Observability RPCs (Phase 5) | Unit + integration | FakeRedis dedupe + Mongo TTL |
| FE robustness (timeouts, backoff, cross-tab) | Vitest unit + Playwright E2E | `pnpm test`, `pnpm e2e` |
| FE observability SDK | Vitest + mock server | flush, redaction, beacon |
| Chaos (Phase 6) | Integration | docker-compose chaos profile |

### 4.2 Per-phase gates (Definition of Done)

A phase closes only when ALL of:

1. `bash scripts/check.sh` exit 0 (ruff format/lint+security, pip-audit, pytest).
2. `pnpm -r typecheck` exit 0.
3. `pnpm -r build` exit 0 for `apps/candidate` + `apps/company` + `packages/*`.
4. New unit + integration tests cover every new file.
5. No new `except: pass`, no bare `except`, no magic-number timeouts (§4.3).
6. HANDOFF doc written + committed:
   `docs/superpowers/plans/<YYYY-MM-DD>-robustness-phase-N.md`.
7. Phase-specific live smoke green.

### 4.3 Lint reinforcement

Phase 0 adds the gate enforcement so the bar doesn't decay:

- `BLE001` (blind-except) — verify on.
- `S110` (try-except-pass) — verify on.
- `ASYNC100` (no blocking in async) — verify on.
- **New** `scripts/check_timeouts.py` — greps `await self._collection.*\(`,
  `await redis.*\(`, `await rabbit.*\(`, `httpx`, `requests` outside `with_timeout()`
  contexts; fails the gate on any new uninstrumented site.
- **New** `scripts/check_log_coverage.py` — admin resource functions missing
  `log_context` block at body-entry → fails the gate.

### 4.4 Chaos verification (Phase 6)

`docker-compose.chaos.yml` overlay that:

- Adds `toxiproxy` between services and Mongo/Redis/RabbitMQ.
- Defines profiles: `mongo-slow-500ms`, `redis-pause-2s`, `rabbitmq-restart`,
  `mcp-data-unavailable`.
- Runs the full E2E smoke (register → apply → aptitude → interview → report → decision
  → notify) under each profile; all must complete without 5xx leak to client and with
  audit-log integrity intact.

### 4.5 Rollout & risk

| Phase | Risk | Mitigation |
|---|---|---|
| 0 | Lib touches every service | Services keep old paths until they consume new helpers; per-helper unit tests gate. |
| 1 | Timeouts may surface latent slow queries | Generous defaults (10s Mongo, 5s Redis); tune via env later. |
| 2 | 192 resource functions = large diff | Commit-per-file; lint check forces 100% coverage. |
| 3 | FE changes touch many pages | Per-page Playwright snapshot test + visual diff on staging. |
| 4 | New RPCs — schema design risk | Contracts locked in §3.1; FE typed stubs regenerate from proto. |
| 5 | Observability = new surface area | Idempotent on `event_id`, Redis dedupe; per-event rate-limit via `lib/lib/redis/ratelimit.py`. |
| 6 | Chaos may surface pre-existing bugs | Bugs found tagged as separate fixes, NOT folded into Phase 6. |

### 4.6 Sequencing rules

- **No phase skipping** — Phase N+1 depends on Phase N's helpers.
- **Phase 3 / Phase 4 partial parallelism after Phase 2 ships:**
  - Phase 3 (FE robustness sweep) is fully independent of Phase 4 and can start
    immediately after Phase 2.
  - Phase 4 has two sub-tracks: Phase 4-BE (proto, resource, audit-log, tests for the
    new RPCs) is fully independent and can start immediately after Phase 2.
  - Phase 4-FE (wire the new RPCs into pages, replace cast-seam mocks) depends on the
    matching Phase 4-BE RPC being merged. Run Phase 4-FE strictly after Phase 4-BE per
    RPC, not as one big bang.
- **One worktree per phase** — keep this branch + similar isolated branches per phase
  (existing pattern).
- **Per-phase commit on this branch** — per the user's git-workflow memory:
  never change branch, commit at each step, stage explicit paths only.
- **Memory hygiene** — after each phase closes, update `memory/MEMORY.md` with a
  one-liner pointer to that phase's HANDOFF doc.

### 4.7 Explicitly out of scope

- Voice/video product features (Phase 6 only touches voice-worker graceful-shutdown).
- New product surfaces (compliance dashboard, billing, audit page live wiring — kept as
  backlog).
- ATS integrations (P5 of the original product roadmap).
- Multi-region / autoscaling (handled by separate deploy program).
- The legacy `apps/company` deprecation (separate effort; touched only to avoid regressions).

### 4.8 Effort estimate (not committed, for sequencing only)

| Phase | Effort | Critical path |
|---|---|---|
| 0 | S | lib changes + tests |
| 1 | M | wraps + 2 FE fixes |
| 2 | L | 192 funcs (parallelisable) |
| 3 | M | FE polish + UX |
| 4 | M-L | proto + FE wiring per RPC |
| 5 | L | new service + FE SDK + infra |
| 6 | M | chaos profile + final smoke |

---

## 5. Acceptance — what "extreme robustness, never fail at any level" means at the end

When the program closes, the platform meets these objective checks:

1. **No unbounded external waits.** `scripts/check_timeouts.py` exits 0; every Mongo,
   Redis, RabbitMQ, HTTP, LLM, MCP, and storage call wrapped with `with_timeout(...)`.
2. **No uninstrumented business operation.** `scripts/check_log_coverage.py` exits 0;
   every admin resource function emits entry/exit/error with structured context.
3. **No leak of internal errors.** Every gRPC handler translates `AppError` to typed
   status; only `InternalError` produces `INTERNAL`. Expected domain errors log at DEBUG
   with no traceback.
4. **Every funnel transition observable.** 12 funnel events + 4 quality events landing
   in `client_events` with `comp_id` scope; matching backend audit_logs.
5. **Every client-side error captured.** Global error boundary + `window.onerror` route
   to `client_errors` with stack + correlation_id; recoverable end-to-end via the id.
6. **Chaos-tested.** Full E2E smoke completes under mongo-slow / redis-pause /
   rabbitmq-restart / mcp-data-unavailable profiles.
7. **Knob-driven.** Every timeout/retry tunable via env; no magic numbers in code.
8. **Idempotent mutations.** Every mutating RPC documented and tested for double-call
   safety. RabbitMQ consumers re-deliver-safe.
9. **Audit trail intact.** Every automated decision + override has a corresponding
   `audit_logs` row with `comp_id`, `user_id`, `correlation_id`, and decision evidence.
10. **No regression.** All prior tests + gates green; chaos run produces zero 5xx leaks
    to the client.

---

## 6. Handoff to writing-plans

This spec captures the WHAT and WHY. The implementation plan (next step, via
`writing-plans`) will decompose each phase into ordered tasks with file-level
granularity, failing-test-first sketches, and verification commands.

The plan should:

- Honor the per-phase Definition of Done from §4.2.
- Sequence Phase 3 and Phase 4 in parallel after Phase 2 (per §4.6).
- Produce a HANDOFF doc template for each phase to keep continuation possible.
- Stage commits per the user's git-workflow memory: this branch, explicit paths only,
  commit at each step.

End of spec.
