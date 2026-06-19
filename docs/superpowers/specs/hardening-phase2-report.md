# Hardening Phase 2 — Report

## Gate result
`bash scripts/check.sh` GREEN — **542 tests** (84 lib, 204 admin, 199 ai-agents, 24
mcp-data, 31 mcp-capability). Baseline was 532; **+10 new tests** added in this phase.

---

## Manager design

`McpSessionManager` (`src/ai-agents/app/infra/mcp_session.py`) owns one
`streamablehttp_client` + `ClientSession` pair for a single MCP URL.

### Connection lifecycle

The class manually enters/exits the two async context-managers instead of using
`async with`, storing their `__aexit__` handles in `_cm_stack` so they can be
called explicitly on teardown.  This allows start/stop to be controlled from the
service entrypoint (`main.py` / `voice_worker.py`) rather than being tied to the
lexical scope of an `async with` block.

### Lazy connect + lock

`_get_session()` returns the live session immediately if one exists; otherwise it
acquires `_lock` (double-check pattern) and calls `_connect_locked()`.  Concurrent
callers block on the lock and pick up the already-connected session once the first
connect completes — guaranteeing exactly one connect regardless of concurrency.

### Self-healing `call_tool`

```
session = await _get_session()
try:
    return await session.call_tool(name, arguments)
except _TRANSPORT_ERRORS:
    log WARNING
await _reconnect()          # tears down + retries up to N times with backoff
session = await _get_session()
return await session.call_tool(name, arguments)
```

The post-reconnect `call_tool` is NOT wrapped in another transport-error catch.
This is intentional: if the reconnect succeeded but the second call still fails
with a transport error, that means the server is still broken and should surface
as an exception (the next `call_tool` invocation will trigger another reconnect
cycle).

### Reconnect backoff

Exponential + jitter: `delay = 0.5 * 2**attempt + uniform(0, 0.5)`.  After
`max_reconnect_attempts` (default 3) consecutive failed connects, `McpUnavailable`
is raised instead of looping forever.

### Transport error types caught

```python
_TRANSPORT_ERRORS = (RuntimeError, BrokenPipeError, anyio.ClosedResourceError)
```

| Type | Source |
|---|---|
| `RuntimeError` | Most common: `streamablehttp_client` raises this on "connection closed" / "stream closed" when the server restarts |
| `BrokenPipeError` | Low-level OS error on write to a dead socket |
| `anyio.ClosedResourceError` | anyio stream forcibly closed while a read is pending |

**Uncertainty / live-test flag:** These types were inferred from the anyio /
`httpx-sse` source code and manual inspection of MCP client internals.  They have
NOT been verified against a real `mcp-data` server restart.  A live integration
test (restart the container mid-call) is strongly recommended before considering
this closed.  The error set may need to be expanded with `httpx.RemoteProtocolError`
or `httpx.ConnectError` if the HTTP layer raises before anyio.

---

## Files changed

| File | Action |
|---|---|
| `src/ai-agents/app/infra/mcp_session.py` | New — `McpUnavailable`, `McpSessionManager` |
| `src/ai-agents/app/infra/mcp_data.py` | Renamed `session` param to `manager` in `__init__` (comment only — `_session` attribute kept for zero-impact on callers) |
| `src/ai-agents/app/infra/mcp_capability.py` | Same rename as above |
| `src/ai-agents/app/main.py` | Replaced `async with streamablehttp_client(...)` blocks with `McpSessionManager.start()` / `aclose()` |
| `src/ai-agents/app/service/voice_worker.py` | Same replacement; removed unused `ClientSession` / `streamablehttp_client` imports |
| `src/ai-agents/tests/test_mcp_session.py` | New — 10 offline tests |

---

## Test names + counts

### test_mcp_session.py (10 tests)
- `test_reconnect_on_transport_error_then_succeeds` — `RuntimeError` on first call → reconnect → result correct; reconnect called once
- `test_bounded_reconnect_raises_mcp_unavailable` — cap=2, reconnect always fails → `McpUnavailable(attempts=2)` 
- `test_mcp_unavailable_is_not_infinite_loop` — cap=1, instant sleep, verifies termination
- `test_mcp_unavailable_contains_url_and_attempt_count` — error carries `.url` and `.attempts` fields
- `test_lazy_connect_no_double_connect` — 3 concurrent `call_tool` without prior `start()` → connect called exactly once
- `test_data_gateway_delegates_to_manager_call_tool` — `McpDataGateway(fake_manager).get_job()` routes correctly
- `test_capability_gateway_delegates_to_manager_call_tool` — `McpCapability(fake_manager).parse_document()` routes correctly
- `test_anyio_closed_resource_triggers_reconnect` — `anyio.ClosedResourceError` caught → reconnect → success
- `test_broken_pipe_triggers_reconnect` — `BrokenPipeError` caught → reconnect → success
- `test_aclose_when_not_started` — `aclose()` on a fresh manager is a no-op

All 10 are offline (no real MCP server, no real network).

---

## Gate line
`bash scripts/check.sh` → **GATE PASSED** — 542 tests (84 + 204 + 199 + 24 + 31).

---

---

## Phase 2 fix pass (2026-06-19)

### McpError import

```python
from mcp.shared.exceptions import McpError
from mcp.types import CONNECTION_CLOSED  # = -32000
```

`McpError` wraps an `ErrorData(code: int, message: str)` pydantic model, accessed
via `exc.error.code`.  `CONNECTION_CLOSED` is exported directly from `mcp.types`.

### What was caught and fixed

| Finding | Fix |
|---|---|
| **[CRITICAL]** `McpError(code=-32000)` was not caught — self-heal never fired on live drop | Added `except McpError` before `except _TRANSPORT_ERRORS`; re-raises if `exc.error.code != CONNECTION_CLOSED`; routes to the same reconnect-and-retry path on match |
| **[IMPORTANT]** Double-reconnect race: N concurrent transport errors caused N reconnects | `_reconnect(broken_session=...)` takes the broken session reference; under the lock checks `self._session is not None and self._session is not broken_session` — if true, a concurrent caller already reconnected, return early |
| **[MINOR]** Stale `voice_worker.py` docstring still said `streamablehttp_client` | Updated to say `McpSessionManager` |
| `anyio.BrokenResourceError` not in `_TRANSPORT_ERRORS` | Added (write-side companion to `ClosedResourceError`) |

### New tests (3 added → 13 total in test_mcp_session.py)

- `test_mcp_error_connection_closed_triggers_reconnect` — `McpError(CONNECTION_CLOSED)` on first call → reconnect → result correct; connect count = 2
- `test_mcp_error_other_code_propagates_no_reconnect` — `McpError(-32602)` propagates immediately; connect count unchanged; call attempted exactly once
- `test_concurrent_transport_errors_single_reconnect` — 3 concurrent callers all see transport error on same broken session; `_connect_locked` supplies a new session object on reconnect; assert connect count = 2 (one start + one reconnect, not three)

### Gate result

`bash scripts/check.sh` → **GATE PASSED** — 545 tests (84 lib + 204 admin + 202 ai-agents + 24 mcp-data + 31 mcp-capability).  +3 new ai-agents tests over the Phase-2 baseline.

---

## Concerns / deferred

1. **Live transport-error verification (critical):** The `_TRANSPORT_ERRORS` set
   (`RuntimeError`, `BrokenPipeError`, `anyio.ClosedResourceError`) was derived from
   source inspection.  A real restart of `mcp-data` (e.g. `kubectl rollout restart`)
   while `ai-agents` is active may raise `httpx.RemoteProtocolError` or
   `httpx.ConnectError` instead.  Until a live test is run, BE-#6 should be
   considered "self-heal logic present, transport error set unverified."

2. **`max_reconnect_attempts` is not config-driven:** Currently hardcoded to 3 in
   `McpSessionManager(url)`.  Phase 6 should plumb `s.mcp_reconnect_attempts` from
   settings so it can be tuned per environment.

3. **`call_timeout_s` param exists but is not wired:** The constructor accepts
   `call_timeout_s` (for future `with_timeout` wrapping of `call_tool`), but the
   current impl does not use it — the MCP session has its own internal timeout.
   Phase 5/6 should wire `lib.resilience.with_timeout` around `call_tool` using
   this param.

4. **Existing gateway tests in `test_mcp_clients.py`** use `_FakeSession` injected
   directly into `McpDataGateway(session)` — this still works because the gateways
   store the injected object as `self._session` and duck-type on `.call_tool()`.
   No changes to existing tests were needed.
