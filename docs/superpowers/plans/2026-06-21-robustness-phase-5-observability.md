# Robustness Phase 5 — Observability Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the end-to-end observability layer the program spec §3.2-3.5 calls for: a new `ObservabilityService` BE that ingests client errors + analytics events, a `@ip/shared` FE SDK that auto-captures unhandled errors and exposes a `track(name, props)` helper, FE-side wiring of 12 funnel events + 4 quality events covering the closed-loop hire path, X-Correlation-ID round-trip from BE through FE so an error in the browser links to a server-side log line via a shared id, and infra wiring for Prometheus scrape + OTLP exporter env in `docker-compose.yml` so the existing `lib.observability` traces/metrics actually leave the process. Result: every user-visible failure produces a row a developer can read; every funnel transition produces a metric a PM can read; every server log line links to a client correlation id.

**Architecture:** Backend ships one new gRPC service (`admin.observability.v1`) with two RPCs that write to two TTL'd Mongo collections (`client_errors` 30d, `client_events` 90d). Both RPCs are idempotent on `event_id` via Redis SET dedup (24h TTL). Server-side identity enforcement: client-supplied `context` is DISCARDED; `user_id`, `comp_id`, `role` are re-derived from the access token (if present). Anonymous calls allowed for unauth pages. The Phase 0 `lib.observability` Prometheus + OTel wrappers are already in place — Phase 5 just wires the deployment env so collectors actually receive data. FE side: a new `packages/shared/src/observability.ts` initializes a buffered queue (1s flush or 50 events), backs onto `navigator.sendBeacon` for unload, attaches `window.onerror` + `window.onunhandledrejection`, and a React error boundary catches render errors. PII redaction at both ends (same allowlist as `lib/lib/logging.py:_SENSITIVE`). Request-id round-trip: BE already emits `X-Correlation-ID` per ASGI request (Phase 0 `lib/lib/web.py`); Phase 5 makes the FE transport capture it from response headers and attach it to every `recordError` call. Funnel events follow the spec's 12-event taxonomy + 4 quality events.

**Tech Stack:** Python 3.12, grpcio, motor/pymongo with TTL indexes, Redis SET for dedup, Prometheus client + OTel SDK (already in `lib.observability`). TypeScript 5.x, React 19, `@connectrpc/connect`, `navigator.sendBeacon`. Verification: `bash scripts/check.sh` for BE; `pnpm -r typecheck` + `pnpm build` for FE; manual smoke (open candidate app, trigger an error, confirm a row lands in `client_errors`).

## Global Constraints

- Spec source: `docs/superpowers/specs/2026-06-21-platform-robustness-and-observability-design.md` (§3.2-3.5).
- Behavior preservation: no change to existing RPC contracts. All Phase 5 work is additive.
- TDD mandatory.
- Per-task commit on `main`; stage explicit paths only.
- Working directory for every command: `/Users/rugwedpatharkar/Projects/Project`.
- pnpm pinned at `9.15.0`.
- Pre-commit gate per touched-file: `ruff format --check` + `ruff check` + pytest (BE) OR `pnpm typecheck` + `pnpm build` (FE) — all exit 0 before commit. Full `bash scripts/check.sh` exit 0 after every BE commit.
- No new `except: pass`, no nested `try/except`, no magic-number timeouts.
- Every new RPC writes follows Phase 2 conventions (`log_context`, `bind_ids`, `with_timeout` on external calls).
- Server-side identity enforcement: client-supplied `context` is DISCARDED. `user_id`/`comp_id`/`role` come from the access token (if present); anonymous calls leave them null.
- PII redaction uses the same allowlist as `lib/lib/logging.py:_SENSITIVE` (extend if needed).
- No `console.log` left in production FE code.
- The pre-existing macOS `os.killpg` flake — re-run gate if it fires.

## Pre-Phase Audit Findings (scouted)

- BE already has `X-Correlation-ID` middleware (`lib/lib/web.py:CorrelationIdMiddleware`) that reads/echoes the header per ASGI request. Phase 5 adds FE capture + propagation.
- `lib/lib/observability.py` (Phase 0) provides `counter()`, `histogram()`, `span()`, `traced()`, `init_tracing()`, `start_metrics_server()`. Currently called from a few service `main.py`s; no collector wired in `docker-compose.yml`. Phase 5 adds the OTLP env + Prometheus scrape config.
- No FE-side error tracking — `console.error` only.
- No FE-side analytics events — Dashboard KPIs derived client-side, not server-side.

## File Structure (lock-in)

**New BE proto:**
- `src/admin/app/routes/pb/observability.proto` — `ObservabilityService` with `RecordClientError` + `RecordClientEvent` RPCs + message shapes.

**New BE resource:**
- `src/admin/app/resources/observability.py` — `record_client_error(events, *, errors_repo, dedup_store, identity)` + `record_client_event(events, *, events_repo, dedup_store, identity)`.

**New BE repos:**
- `src/admin/app/infra/repositories/client_errors.py` — `ClientErrorRepository` with `insert_many_dedup`, `count_since`.
- `src/admin/app/infra/repositories/client_events.py` — `ClientEventRepository` with same shape.
- Both register a TTL index on `occurred_at` (30d / 90d). Inherit `BaseRepository` so Phase 1 timeout wraps apply.

**New BE servicer:**
- `src/admin/app/routes/observability.py` — thin RPC translation.

**Modified BE:**
- `src/admin/app/web.py` (or main.py — wherever the gRPC web app is composed) — register the new servicer + inject the new repos.
- `src/admin/app/main.py` — call `init_tracing(service="admin")` + `start_metrics_server(port=settings.metrics_port)` at startup. Same for the other 3 services (ai-agents, mcp-data, mcp-capability).
- `lib/lib/config.py` — add `metrics_port: int = 0` (0 = disabled) + `otlp_endpoint: str | None = None`.
- `docker-compose.yml` — add `OTEL_EXPORTER_OTLP_ENDPOINT` env var + open Prometheus scrape port on each service. Optionally add a `prometheus` service + `tempo`/`jaeger` for traces (commented out by default; ops decides).

**New FE files:**
- `frontend/packages/shared/src/observability.ts` — `initObservability`, `track`, `recordError`, `withTraceId`. PII redaction.
- `frontend/packages/shared/src/observability.test.ts` — Vitest unit tests for buffer flush, beacon on unload, PII redaction, anonymous-call path.

**Modified FE:**
- `frontend/packages/shared/src/transport.ts` — capture `X-Correlation-ID` response header into the call result; expose via `getLastCorrelationId()`.
- `frontend/packages/shared/src/index.ts` — export `initObservability`, `track`, `recordError`, `withTraceId`, `ClientEventName`.
- `frontend/apps/candidate/app/layout.tsx` — call `initObservability` at app boot.
- `frontend/apps/candidate/app/error.tsx` + `global-error.tsx` — call `recordError` on render errors.
- ~12 FE pages where funnel events fire (login, register, jobs/[id], apply CTA, aptitude, interview, applicants/[appId] report view, decision buttons, notification inbox).

**New tests:**
- `src/admin/tests/test_observability.py` — RPC happy path, identity scrub, dedup, PII redaction, anonymous call.
- `lib/tests/test_observability_init.py` — `start_metrics_server` is a no-op at port 0; OTLP exporter is no-op when endpoint is None.

**New deploy/infra:**
- `deploy/prometheus.yml` — scrape config (skeleton).
- `docs/superpowers/plans/OBSERVABILITY.md` — SLO + alert rules + on-call doc.

---

## Task 1 — `ObservabilityService` BE end-to-end

**Files:**
- Create: `src/admin/app/routes/pb/observability.proto`
- Regen: `observability_pb2.py`, `_pb2.pyi`, `_pb2_grpc.py`
- Create: `src/admin/app/resources/observability.py`
- Create: `src/admin/app/infra/repositories/client_errors.py`
- Create: `src/admin/app/infra/repositories/client_events.py`
- Create: `src/admin/app/routes/observability.py`
- Modify: `src/admin/app/web.py` (servicer registration + dep injection)
- Create: `src/admin/tests/test_observability.py`

**Interfaces:**
- Produces: 2 new RPCs.
  - `RecordClientError(events) → accepted_event_ids`
  - `RecordClientEvent(events) → accepted_event_ids`

### Step 1.1 — Write the proto

```proto
syntax = "proto3";

package admin.observability.v1;

// ObservabilityService — FE → BE pipe for unhandled client errors + analytics events.
// Both RPCs idempotent on event_id (24h Redis SET dedup). Server-side identity
// enforcement: the request's context is DISCARDED; user_id/comp_id/role come from
// the access token (anonymous calls leave them null).
service ObservabilityService {
  rpc RecordClientError(RecordClientErrorRequest) returns (RecordClientErrorResponse);
  rpc RecordClientEvent(RecordClientEventRequest) returns (RecordClientEventResponse);
}

message ClientErrorEvent {
  string correlation_id = 1;
  string event_id = 2;
  int64 occurred_at_ms = 3;
  string component = 4;
  string route = 5;
  string build_sha = 6;
  string user_agent_hash = 7;
  ClientErrorPayload error = 8;
}

message ClientErrorPayload {
  string name = 1;
  string message = 2;
  string stack_truncated_8k = 3;
}

message RecordClientErrorRequest {
  repeated ClientErrorEvent events = 1;  // max 50
}

message RecordClientErrorResponse {
  repeated string accepted_event_ids = 1;
}

message ClientEvent {
  string correlation_id = 1;
  string event_id = 2;
  int64 occurred_at_ms = 3;
  string name = 4;            // see spec §3.3
  string route = 5;
  string properties_json = 6; // capped 4KB
}

message RecordClientEventRequest {
  repeated ClientEvent events = 1;  // max 100
}

message RecordClientEventResponse {
  repeated string accepted_event_ids = 1;
}
```

### Step 1.2 — Regen stubs

```
cd /Users/rugwedpatharkar/Projects/Project && \
  ./.venv/bin/python -m grpc_tools.protoc -I src/admin \
  --python_out=src/admin --grpc_python_out=src/admin --pyi_out=src/admin \
  src/admin/app/routes/pb/observability.proto
```

Ruff format the generated files.

### Step 1.3 — Repo: `client_errors.py`

```python
"""Client-side error sink (30d TTL).

A row per browser-side unhandled error or React error boundary catch. Tenant-scoped
via the access token's comp_id; anonymous calls store with comp_id="". TTL is
enforced by a Mongo index on occurred_at_ms.
"""

from lib.mongodb.repository import BaseRepository


class ClientErrorRepository(BaseRepository):
    collection_name = "client_errors"
    ttl_index = ("occurred_at_ms", 30 * 24 * 3600)  # 30 days

    async def insert_dedup(self, doc, *, dedup_check) -> bool:
        """Insert if dedup_check (Redis SET on event_id) says it's new. Returns True
        if inserted, False if dedupe hit.
        """
        if not await dedup_check(doc["event_id"]):
            return False
        await self.col.insert_one(doc)
        return True
```

Same shape for `ClientEventRepository` with `collection_name = "client_events"` and `ttl_index = ("occurred_at_ms", 90 * 24 * 3600)`.

### Step 1.4 — Resource

```python
"""ObservabilityService resource layer.

Server-side identity enforcement: client-supplied context is discarded; user_id and
comp_id come from the access token. Anonymous calls leave them null. Dedup via
Redis SET (24h TTL) keyed on event_id — sendBeacon retries are idempotent.
"""

import json
from lib.logging import bind_ids, get_logger, log_context

log = get_logger(component="observability.resources")

_MAX_ERRORS_PER_CALL = 50
_MAX_EVENTS_PER_CALL = 100
_MAX_STACK_BYTES = 8192
_MAX_PROPS_BYTES = 4096
_DEDUP_TTL_SECONDS = 24 * 3600

# Same as lib/lib/logging.py:_SENSITIVE — copy here for redaction at the boundary.
_REDACT_PATTERNS = [r"password", r"token", r"secret", r"api_key", r"authorization"]


def _redact(s: str) -> str:
    # Tiny inline redactor — replaces likely-PII tokens with "***".
    # Phase 6 polish: move to lib.redaction for shared use.
    ...


async def record_client_error(events, *, errors_repo, dedup, identity):
    async with log_context(
        log, "resource.observability.record_client_error",
        **bind_ids(comp_id=identity.get("comp_id"), user_id=identity.get("user_id")),
    ):
        if not events:
            return []
        if len(events) > _MAX_ERRORS_PER_CALL:
            raise ValidationError(f"max {_MAX_ERRORS_PER_CALL} events per call")
        accepted = []
        for e in events:
            doc = {
                "event_id": e.event_id,
                "correlation_id": e.correlation_id,
                "occurred_at_ms": e.occurred_at_ms,
                "component": e.component,
                "route": e.route,
                "build_sha": e.build_sha,
                "user_agent_hash": e.user_agent_hash,
                "error": {
                    "name": e.error.name,
                    "message": _redact(e.error.message),
                    "stack_truncated_8k": _redact(e.error.stack_truncated_8k[:_MAX_STACK_BYTES]),
                },
                "user_id": identity.get("user_id"),
                "comp_id": identity.get("comp_id"),
                "role": identity.get("role"),
            }
            if await errors_repo.insert_dedup(doc, dedup_check=dedup):
                accepted.append(e.event_id)
        return accepted
```

Same shape for `record_client_event`. Cap `properties_json` at 4KB and parse-validate JSON before insert.

### Step 1.5 — Dedup helper

A small closure that wraps Redis `SET key NX EX 86400`. Returns True if newly set (= "not a dupe"). Lives next to the resource or in `src/admin/app/infra/dedup.py`.

### Step 1.6 — Tests

`src/admin/tests/test_observability.py`:
- happy path: insert N events, all returned in accepted_event_ids
- dedup: re-call with same event_id returns empty accepted list, no new row
- max-per-call exceeded: ValidationError
- anonymous call: identity = None, comp_id stored as ""
- identity scrub: client tried to claim comp_id="other"; server overwrites with token-derived value
- PII redaction: stack containing "Bearer ABC123" stored with "***" in place
- empty events list: returns [] with no Redis or Mongo writes

Use existing `fakes` fixture or extend with `client_errors_repo` + `client_events_repo` + `dedup`.

### Step 1.7 — Servicer

`src/admin/app/routes/observability.py` — thin pattern (see existing routes/decision.py). Use the central translator for AppError. Anonymous calls (no Authorization header) → identity = `{"user_id": None, "comp_id": "", "role": None}`.

### Step 1.8 — Wire in `web.py`

Register `ObservabilityServicer` next to existing servicers. Inject repos + dedup helper.

### Step 1.9 — Gate

```
./.venv/bin/ruff format --check <touched files>
./.venv/bin/ruff check <touched files>
(cd src/admin && ../../.venv/bin/python -m pytest -q)
bash scripts/check.sh
```

All exit 0.

### Step 1.10 — Commits

```
git add src/admin/app/routes/pb/observability.proto src/admin/app/routes/pb/observability_pb2*.py src/admin/app/routes/pb/observability_pb2_grpc.py
git commit -m "feat(admin/observability.proto): ObservabilityService — RecordClientError + RecordClientEvent"

git add src/admin/app/infra/repositories/client_errors.py src/admin/app/infra/repositories/client_events.py
git commit -m "feat(admin/infra): client_errors + client_events repositories with TTL indexes"

git add src/admin/app/resources/observability.py src/admin/tests/test_observability.py [optional: infra/dedup.py]
git commit -m "feat(admin/observability): record_client_error + record_client_event with identity scrub + dedup"

git add src/admin/app/routes/observability.py src/admin/app/web.py
git commit -m "feat(admin/routes/observability): wire ObservabilityServicer + DI"
```

---

## Task 2 — Request-id round-trip through FE transport

**Files:**
- Modify: `frontend/packages/shared/src/transport.ts`
- Modify: `frontend/packages/shared/src/index.ts`

**Interfaces:**
- Produces: `getLastCorrelationId(): string | null` — returns the most recent X-Correlation-ID captured from any RPC response. `withTraceId<T>(fn: () => Promise<T>): Promise<{result: T, correlationId: string | null}>` for explicit per-call capture.

### Step 2.1

Add a response interceptor that reads `X-Correlation-ID` from response headers and stores it in a module-local variable (last-write-wins). Export `getLastCorrelationId()` from index.ts.

### Step 2.2

Verify typecheck + build:
```
cd frontend && npx pnpm@9.15.0 -r typecheck
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate build
```

### Step 2.3 — Commit

```
git add frontend/packages/shared/src/transport.ts frontend/packages/shared/src/index.ts
git commit -m "feat(@ip/shared): capture X-Correlation-ID from RPC response headers"
```

---

## Task 3 — `@ip/shared` observability SDK

**Files:**
- Create: `frontend/packages/shared/src/observability.ts`
- Create: `frontend/packages/shared/src/observability.test.ts`
- Modify: `frontend/packages/shared/src/index.ts`

**Interfaces:**
- `initObservability({ buildSha, client }): void` — registers `window.onerror` + `window.onunhandledrejection` + a beacon-on-unload, starts a 1s flush timer.
- `track(name: ClientEventName, properties?: Record<string, unknown>): void` — buffer + flush.
- `recordError(err: unknown, ctx?: { component?: string }): void` — buffer + flush.
- `ClientEventName` union of the 12 funnel events + 4 quality events.

### Step 3.1 — Write the test

`observability.test.ts`:
- `track` buffers up to 50 events then flushes via the injected client.
- `track` flushes after 1s timer regardless of count.
- `recordError` buffers errors separately from events.
- `flush on visibility=hidden` uses `navigator.sendBeacon` (mock it).
- PII redaction: `track("auth.logged_in", { email: "x@y.com" })` redacts email to `***@y.com` (or however your redaction works).
- Empty buffer flush is a no-op (doesn't call the client).
- ClientEventName union type (compile-time check).

### Step 3.2 — Write the SDK

```typescript
import type { ApiClients } from "@ip/api-client";

export type ClientEventName =
  | "auth.registered" | "auth.logged_in"
  | "job.viewed"
  | "application.started" | "application.submitted"
  | "aptitude.started" | "aptitude.submitted"
  | "interview.started" | "interview.completed"
  | "report.viewed"
  | "decision.made"
  | "notification.opened"
  | "client.error" | "client.slow_render"
  | "api.timeout" | "api.unauthorized_refresh";

interface InitOptions {
  buildSha: string;
  client: { observability: ApiClients["admin"]["observability"] };
}

const _eventBuffer: Array<{...}> = [];
const _errorBuffer: Array<{...}> = [];
let _buildSha = "";
let _client: InitOptions["client"] | null = null;
let _flushTimer: ReturnType<typeof setInterval> | null = null;

const _FLUSH_INTERVAL_MS = 1000;
const _EVENT_BUFFER_MAX = 50;
const _ERROR_BUFFER_MAX = 50;

export function initObservability(opts: InitOptions): void {
  _buildSha = opts.buildSha;
  _client = opts.client;
  // Global handlers
  window.addEventListener("error", (e) => recordError(e.error, { component: "window.onerror" }));
  window.addEventListener("unhandledrejection", (e) => recordError(e.reason, { component: "unhandledrejection" }));
  // Beacon on unload
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void _flushNow({ beacon: true });
  });
  // Periodic flush
  _flushTimer = setInterval(() => void _flushNow({}), _FLUSH_INTERVAL_MS);
}

export function track(name: ClientEventName, properties: Record<string, unknown> = {}): void {
  if (!_client) return;  // not initialized — drop silently
  _eventBuffer.push({
    event_id: _uuid(),
    correlation_id: getLastCorrelationId() ?? "",
    occurred_at_ms: Date.now(),
    name,
    route: typeof window !== "undefined" ? window.location.pathname : "",
    properties_json: _redactAndStringify(properties),
  });
  if (_eventBuffer.length >= _EVENT_BUFFER_MAX) void _flushNow({});
}

export function recordError(err: unknown, ctx: { component?: string } = {}): void {
  if (!_client) return;
  const e = err instanceof Error ? err : new Error(String(err));
  _errorBuffer.push({
    event_id: _uuid(),
    correlation_id: getLastCorrelationId() ?? "",
    occurred_at_ms: Date.now(),
    component: ctx.component ?? "unknown",
    route: typeof window !== "undefined" ? window.location.pathname : "",
    build_sha: _buildSha,
    user_agent_hash: _hashUA(navigator.userAgent),
    error: {
      name: e.name,
      message: _redact(e.message),
      stack_truncated_8k: _redact((e.stack ?? "").slice(0, 8192)),
    },
  });
  if (_errorBuffer.length >= _ERROR_BUFFER_MAX) void _flushNow({});
}

async function _flushNow({ beacon }: { beacon?: boolean } = {}): Promise<void> {
  if (!_client) return;
  const errs = _errorBuffer.splice(0);
  const evts = _eventBuffer.splice(0);
  if (!errs.length && !evts.length) return;
  if (beacon && navigator.sendBeacon) {
    // sendBeacon doesn't support gRPC-web; fall back to fetch keepalive:true
    // ... or queue to localStorage and flush on next page load.
  }
  try {
    if (errs.length) await _client.observability.recordClientError({ events: errs });
    if (evts.length) await _client.observability.recordClientEvent({ events: evts });
  } catch {
    // Drop on flush failure — don't infinite-loop trying to log a logging error.
  }
}

// Tiny helpers — _uuid (crypto.randomUUID), _hashUA (FNV-1a), _redact (regex strip),
// _redactAndStringify (redact + JSON.stringify with 4KB cap)
```

### Step 3.3 — Export

Add to `frontend/packages/shared/src/index.ts`:
```typescript
export { initObservability, track, recordError, type ClientEventName } from "./observability";
```

### Step 3.4 — Gate

```
cd frontend && npx pnpm@9.15.0 --filter @ip/shared test
cd frontend && npx pnpm@9.15.0 --filter @ip/shared typecheck
```

### Step 3.5 — Commit

```
git add frontend/packages/shared/src/observability.ts frontend/packages/shared/src/observability.test.ts frontend/packages/shared/src/index.ts
git commit -m "feat(@ip/shared): observability SDK — initObservability + track + recordError"
```

---

## Task 4 — Wire 12 funnel events + 4 quality events into FE pages

**Files:** see per-event list below.

Each event fires ONCE at the documented moment.

| Event | Where it fires | File | Notes |
|---|---|---|---|
| `auth.registered` | post-register success | `frontend/apps/candidate/app/register/page.tsx` (+ `company/register/page.tsx`) | property: `role` |
| `auth.logged_in` | post-login success | `apps/candidate/app/login/page.tsx` | properties: `role`, `method` ("password" / "oauth") |
| `job.viewed` | `/jobs/[id]` mount | `apps/candidate/app/jobs/[id]/page.tsx` | property: `job_id` |
| `application.started` | apply CTA click | `apps/candidate/app/jobs/[id]/page.tsx` | property: `job_id` |
| `application.submitted` | submit success | same (or wherever the apply mutation lives) | properties: `job_id`, `application_id` |
| `aptitude.started` | aptitude page mount | `apps/candidate/app/aptitude/[applicationId]/page.tsx` | property: `application_id` |
| `aptitude.submitted` | aptitude submit success | same | properties: `application_id`, `duration_ms` |
| `interview.started` | interview RTC connected | `apps/candidate/app/interview/[applicationId]/page.tsx` | property: `application_id` |
| `interview.completed` | interview end (any reason) | same | properties: `application_id`, `end_reason` |
| `report.viewed` | recruiter opens applicant report | `apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx` | property: `application_id` |
| `decision.made` | hold/reject/advance | same | properties: `application_id`, `decision` |
| `notification.opened` | inbox item click | `apps/candidate/app/notifications/page.tsx` (or wherever inbox lives) | properties: `notification_id`, `kind` |

Quality events:
- `client.error` — wired automatically by `recordError` in the SDK (Task 3).
- `client.slow_render` — React profiler trigger at 3s render duration (skeleton in Task 5).
- `api.timeout` — transport interceptor catches `Code.DeadlineExceeded` or `OperationTimeout` and calls `track("api.timeout", {service, rpc})`.
- `api.unauthorized_refresh` — existing refresh path in `transport.ts` already catches 401 → refresh; add a `track("api.unauthorized_refresh", ...)` call.

### Per-event workflow

1. Read the target page.
2. Add `import { track } from "@ip/shared";` at top (if missing).
3. Fire `track("<event>", { ... })` at the documented moment.
4. Verify typecheck + build:
   ```
   cd frontend && npx pnpm@9.15.0 --filter @ip/candidate typecheck
   cd frontend && npx pnpm@9.15.0 --filter @ip/candidate build
   ```
5. Commit per logical area (auth events together, application events together, etc.):
   ```
   git add <touched files>
   git commit -m "feat(fe): emit auth.* funnel events"
   ```

Aim for 4-5 commits total across the 16 events.

---

## Task 5 — Global error boundary + slow_render + transport quality events

**Files:**
- Create: `frontend/apps/candidate/components/observability-boundary.tsx`
- Modify: `frontend/apps/candidate/app/layout.tsx` (wrap children with the boundary; call `initObservability` at app boot)
- Modify: `frontend/packages/shared/src/transport.ts` (track api.timeout, api.unauthorized_refresh)

### Step 5.1 — Error boundary

```tsx
"use client";
import { Component, type ReactNode } from "react";
import { recordError } from "@ip/shared";

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class ObservabilityBoundary extends Component<Props, State> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error, info: { componentStack?: string }) {
    recordError(err, { component: info.componentStack ?? "ObservabilityBoundary" });
  }
  render() {
    if (this.state.hasError) {
      return <div>Something went wrong. Please refresh.</div>;
    }
    return this.props.children;
  }
}
```

### Step 5.2 — Init at app boot

In `frontend/apps/candidate/app/layout.tsx`, add a small client component that calls `initObservability({ buildSha: process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev", client })` on mount. Wrap children with `ObservabilityBoundary`.

Same change for `frontend/apps/company/app/layout.tsx`.

### Step 5.3 — Transport quality events

In `frontend/packages/shared/src/transport.ts`:
- In the catch path that fires on `Code.DeadlineExceeded` (or wherever timeouts surface), add `track("api.timeout", { service: ..., rpc: ... })`.
- In the existing refresh-on-401 path, add `track("api.unauthorized_refresh", { service: ..., rpc: ... })`.

### Step 5.4 — Slow render (optional polish, skip if React Profiler is too noisy)

If skipping: note in HANDOFF as Phase 6 polish.

### Step 5.5 — Commit

```
git add frontend/apps/candidate/components/observability-boundary.tsx frontend/apps/candidate/app/layout.tsx
git commit -m "feat(candidate): initObservability + ObservabilityBoundary at app root"

git add frontend/packages/shared/src/transport.ts
git commit -m "feat(@ip/shared): emit api.timeout + api.unauthorized_refresh quality events"
```

---

## Task 6 — Prometheus scrape + OTLP exporter env wiring

**Files:**
- Modify: `docker-compose.yml`
- Modify: `lib/lib/config.py` (add `metrics_port` + `otlp_endpoint` settings)
- Modify: `src/admin/app/main.py` (+ ai-agents/mcp-data/mcp-capability) — call `start_metrics_server` + `init_tracing` at startup if configured.
- Create: `deploy/prometheus.yml` — scrape config skeleton.
- Create: `deploy/otel-collector.yml` — collector config (commented).

### Step 6.1 — Settings

Add to `BaseServiceSettings`:
```python
metrics_port: int = 0  # 0 disables the /metrics server
otlp_endpoint: str | None = None  # None disables OTLP export
```

### Step 6.2 — Service main.py — call at startup

Each service's `main.py` (or wherever the ASGI lifespan is set up):
```python
from lib.observability import init_tracing, start_metrics_server

@asynccontextmanager
async def lifespan(app):
    # ... existing setup ...
    if settings.metrics_port:
        await start_metrics_server(settings.metrics_port)
    if settings.otlp_endpoint:
        # Build OTLP exporter from settings and pass to init_tracing
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        init_tracing("admin", exporter=OTLPSpanExporter(endpoint=settings.otlp_endpoint))
    else:
        init_tracing("admin", enabled=False)
    yield
    # ... teardown ...
```

Repeat for ai-agents, mcp-data, mcp-capability with the right service name.

### Step 6.3 — `docker-compose.yml`

Add env vars + ports per service:
```yaml
services:
  admin:
    environment:
      METRICS_PORT: "9090"
      OTLP_ENDPOINT: "${OTLP_ENDPOINT:-}"
    ports:
      - "9091:9090"  # admin Prometheus scrape
  # ... same shape for ai-agents (9092), mcp-data (9093), mcp-capability (9094)
```

### Step 6.4 — `deploy/prometheus.yml`

Skeleton scrape config:
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'admin'
    static_configs:
      - targets: ['admin:9090']
  - job_name: 'ai-agents'
    static_configs:
      - targets: ['ai-agents:9090']
  - job_name: 'mcp-data'
    static_configs:
      - targets: ['mcp-data:9090']
  - job_name: 'mcp-capability'
    static_configs:
      - targets: ['mcp-capability:9090']
```

### Step 6.5 — Gate

```
docker compose config  # validates yaml
bash scripts/check.sh
```

### Step 6.6 — Commit

```
git add lib/lib/config.py
git commit -m "feat(lib/config): metrics_port + otlp_endpoint settings (default disabled)"

git add src/admin/app/main.py src/ai-agents/app/main.py src/mcp-data/app/server.py src/mcp-capability/app/server.py
git commit -m "feat(services): wire init_tracing + start_metrics_server at service startup"

git add docker-compose.yml deploy/prometheus.yml deploy/otel-collector.yml
git commit -m "chore(deploy): Prometheus scrape + OTLP exporter env (collectors opt-in)"
```

---

## Task 7 — SLO + alert rules + on-call doc

**Files:**
- Create: `docs/superpowers/plans/OBSERVABILITY.md`

Cover:
- SLOs per service (availability, p99 latency)
- Error-budget targets (monthly)
- Per-RPC error-rate thresholds (Prometheus query)
- Funnel-event drop alarms (e.g. `auth.registered` count drops > 30% week-over-week)
- Client-error rate alarm (e.g. > 1% of sessions)
- On-call rotation placeholder
- Dashboard list (Grafana boards to create)

Commit:
```
git add docs/superpowers/plans/OBSERVABILITY.md
git commit -m "docs(observability): SLOs + alert rules + on-call playbook"
```

---

## Task 8 — Phase 5 HANDOFF doc + memory

Same shape as previous phase HANDOFFs. Lists commits, shipped surfaces, behavior delta, what Phase 6 consumes.

```
git add docs/superpowers/plans/2026-06-21-robustness-phase-5-handoff.md
git commit -m "docs(robustness-phase-5): HANDOFF — phase 5 close + verification"
```

REMEMBER: do NOT overwrite MEMORY.md. Append ONE line to the index. Phase content goes in `~/.claude/projects/.../memory/robustness-phase-5.md`.

---

## Self-review

**1. Spec coverage:**
- §3.2 ObservabilityService contracts → Task 1 ✓
- §3.2 FE SDK (initObservability, track, recordError, withTraceId) → Tasks 2, 3 ✓
- §3.3 funnel event vocabulary (12 + 4) → Tasks 4, 5 ✓
- §3.4 request-id propagation → Task 2 ✓
- §3.5 storage + retention (30d/90d TTL) → Task 1 (`ttl_index` on repos) ✓
- Server-side identity scrub → Task 1 (resource discards client `context`) ✓
- Prometheus + OTLP wiring → Task 6 ✓
- SLO/alerts → Task 7 ✓
- HANDOFF → Task 8 ✓

**2. Placeholder scan:**
- Task 1 redaction uses `...` for the inline `_redact` function body — the implementer writes a small regex-based redactor. Acceptable.
- Task 3 `_uuid`, `_hashUA`, `_redact` helpers marked `... — tiny helpers` — implementer writes them. Acceptable.
- Task 5.4 `slow_render` marked optional. Acceptable — skip note in HANDOFF.
- Task 6.3 `... same shape for ai-agents (9092), mcp-data (9093), mcp-capability (9094)` — operational. Implementer fills in.

**3. Type consistency:**
- `ClientEventName` union matches the 16 events in §3.3 ✓
- `initOptions.client` typed against `@ip/api-client` ApiClients ✓
- `recordError(err: unknown, ctx?: {...})` matches FE SDK signature in §3.2 ✓
- BE proto messages mirror §3.2 verbatim ✓

**4. Gate impact:**
- Each task explicitly runs `bash scripts/check.sh` (BE) or `pnpm typecheck + build` (FE) before commit ✓
- New BE tests cover all 7 critical paths ✓
- Pre-existing macOS killpg flake mitigation ✓

No issues. Plan ready.

---

## What this plan does NOT cover (deferred to Phase 6)

- Messaging SSE (replace 30s long-poll with server-streaming).
- Voice-worker graceful-shutdown audit.
- Full chaos E2E (toxiproxy profiles).
- Final SLO sign-off (Task 7 ships a draft; ops finalises targets).
- All Phase 2/3/4 carry-forwards (22 routes legacy `_STATUS.get`, AST checker docstring exemption, macOS killpg suppress, vitest devDep, FE infinite scroll, IntegrityFlag.severity enum).

Next plan to write: `docs/superpowers/plans/2026-06-21-robustness-phase-6-polish.md` (after Phase 5 closes).
