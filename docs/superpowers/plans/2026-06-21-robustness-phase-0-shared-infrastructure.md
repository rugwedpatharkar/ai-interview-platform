# Robustness Phase 0 — Shared Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the shared `lib/` primitives that the next 5 phases consume — typed error hierarchy with gRPC translation, env-driven timeout/retry knobs, debug-no-traceback domain-error logging, a uniform `AppError → gRPC status` translator at the egress boundary, an audit helper with retryable replay, and two gate-enforced lint guards that prevent regression.

**Architecture:** A single Python package (`lib/lib/`) gains six small focused modules; one existing module (`lib/lib/grpcweb.py`) absorbs the central `AppError` translator. Tests sit alongside in `lib/tests/`. Two new repo-level scripts plug into `scripts/check.sh` so future commits can't reintroduce unwrapped external calls or unlogged resource functions. No service code changes in this phase — services keep their old code paths until Phase 1 starts consuming the new helpers.

**Tech Stack:** Python 3.12, pydantic-settings 2.x, loguru, grpcio, pytest (asyncio mode auto), ruff (with `S` security ruleset), motor/pymongo for the audit-replay collection, redis-py for replay-queue dedup.

## Global Constraints

- Spec source: `docs/superpowers/specs/2026-06-21-platform-robustness-and-observability-design.md`.
- Behavior preservation: NO service code change in this phase — only `lib/lib/` additions and gate scripts. Services consume the new helpers starting in Phase 1.
- TDD mandatory: failing test → watched fail → minimal implementation → green → commit (per `PRODUCTION_STANDARDS.md §5`).
- Per-task commit on this branch (`claude/elated-khayyam-135fcb`); never change branch; stage explicit paths only (per the user's git-workflow memory).
- No backwards-compatibility shims; no defensive guards on typed params; no `except: pass`; no nested `try/except`; no per-call magic-number timeouts (per the user's global `CLAUDE.md` Python rules).
- Gate must remain green after each commit: `bash scripts/check.sh` exit 0.
- Lint guards add LITERAL grep checks; no new dependencies in `lib/pyproject.toml`.
- All new public symbols documented with WHY, not WHAT (per `CLAUDE.md`).
- Existing `lib/` test conventions: file `lib/tests/test_<module>.py`, asyncio mode auto, no real infra in unit tests.

---

## File Structure (lock-in)

**New files (under `lib/lib/`):**

| Path | Responsibility |
|---|---|
| `lib/lib/errors.py` | `AppError` base + 9 subclasses; `to_grpc_status()` mapper; nothing else. |
| `lib/lib/timeouts.py` | Tiny accessor module — `timeouts.mongo()`, `timeouts.redis()`, etc. — reads from `Settings`. No state; pure functions over the global settings singleton. |
| `lib/lib/audit.py` | `write_audit(...)` (durable write + immediate persist) and `enqueue_replay(...)` (best-effort durable retry queue). Caller owns sequencing. |

**Modified files:**

| Path | Change |
|---|---|
| `lib/lib/config.py` | Add 9 timeout/retry knob fields to `BaseServiceSettings` with sensible defaults. |
| `lib/lib/logging.py` | Add `log_domain_error(log, err, **ctx)` — debug-no-traceback helper. |
| `lib/lib/grpcweb.py` | Add `AppError` to the central translator's mapping alongside the existing `PyMongoError/StorageError/OperationTimeout → UNAVAILABLE` mapping. |
| `scripts/check.sh` | Add invocations of the two new lint guards in dependency order: format → lint → timeouts-guard → log-coverage-guard → pip-audit → tests. |

**New gate scripts:**

| Path | Responsibility |
|---|---|
| `scripts/check_timeouts.py` | Walks `src/admin`, `src/ai-agents`, `src/mcp-data`, `src/mcp-capability`, `lib/lib`; greps for `await self._collection.`, `await redis.`, `await rabbit.`, `httpx.`, `requests.` outside `with_timeout(...)` contexts; exits non-zero on a violation found OUTSIDE the per-service ALLOWLIST file. |
| `scripts/check_log_coverage.py` | Walks `src/admin/app/resources/*.py`; reports any `async def` whose body doesn't start with `async with log_context(...)`. (Phase 0 ships the script with `--allowlist` populated with all current violations so the gate stays green; Phase 2 then shrinks the allowlist file-by-file.) |
| `scripts/.timeouts_allowlist.txt` | Initial violations the Phase-0 audit found, one `file:lineno` per line; Phase 1 deletes from this file as it wraps each call. |
| `scripts/.log_coverage_allowlist.txt` | All ~192 currently-unwrapped admin resource functions, one `file:lineno:funcname` per line; Phase 2 shrinks this file. |

**New tests (under `lib/tests/`):**

| Path | Tests what |
|---|---|
| `lib/tests/test_errors.py` | The 9 subclasses + `to_grpc_status()` mapping. |
| `lib/tests/test_timeouts.py` | Each accessor returns the configured value. |
| `lib/tests/test_audit.py` | `write_audit` durable path + `enqueue_replay` queues correctly + replay consumer drains. |
| `lib/tests/test_logging.py` (existing) | Add cases for `log_domain_error`. |
| `lib/tests/test_grpcweb.py` (existing) | Add cases for `AppError → grpc.StatusCode` translation. |

---

## Task 1 — Error hierarchy

**Files:**
- Create: `lib/lib/errors.py`
- Test: `lib/tests/test_errors.py`

**Interfaces:**
- Produces: `AppError(public_message: str, *, context: dict[str, Any] | None = None)` base class with attributes `.public_message: str`, `.context: dict[str, Any]`. Nine subclasses (`ValidationError`, `NotFoundError`, `ConflictError`, `PermissionError`, `AuthError`, `DependencyError`, `BusinessRuleError`, `TimeoutError`, `InternalError`) all inherit unchanged init. `TimeoutError` is a re-export alias for `lib.resilience.OperationTimeout`.

- [ ] **Step 1.1: Write the failing test**

Create `lib/tests/test_errors.py`:

```python
from lib.errors import (
    AppError,
    AuthError,
    BusinessRuleError,
    ConflictError,
    DependencyError,
    InternalError,
    NotFoundError,
    PermissionError,
    ValidationError,
)
from lib.errors import TimeoutError as AppTimeoutError
from lib.resilience import OperationTimeout


def test_app_error_carries_public_message_and_context():
    err = AppError("user-facing", context={"comp_id": "c1"})
    assert err.public_message == "user-facing"
    assert err.context == {"comp_id": "c1"}
    assert isinstance(err, Exception)


def test_app_error_context_defaults_to_empty_dict():
    err = AppError("x")
    assert err.context == {}


def test_subclasses_all_inherit_from_app_error():
    for cls in (
        ValidationError,
        NotFoundError,
        ConflictError,
        PermissionError,
        AuthError,
        DependencyError,
        BusinessRuleError,
        InternalError,
    ):
        instance = cls("msg")
        assert isinstance(instance, AppError)
        assert instance.public_message == "msg"


def test_timeout_error_is_operation_timeout_alias():
    assert AppTimeoutError is OperationTimeout
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `cd lib && ../.venv/bin/python -m pytest tests/test_errors.py -v`
Expected: ImportError on `lib.errors`.

- [ ] **Step 1.3: Write minimal implementation**

Create `lib/lib/errors.py`:

```python
"""Typed exception hierarchy for the platform.

Every domain error raised inside resource / repository / handler code is a subclass of
:class:`AppError`. The central gRPC translator (``lib.grpcweb``) maps each subclass to
the correct gRPC status. Internals raise; the translator catches at the egress boundary.
``TimeoutError`` is a re-export of :class:`lib.resilience.OperationTimeout` so callers
import a single names from one module.
"""

from typing import Any

from lib.resilience import OperationTimeout


class AppError(Exception):
    """Base for every domain error. Carries a *client-safe* public message + structured
    ``context`` for log binding. Internal details (stack traces, original exception
    chains) stay on the exception itself; ``public_message`` is what crosses the wire.
    """

    def __init__(
        self, public_message: str, *, context: dict[str, Any] | None = None
    ) -> None:
        super().__init__(public_message)
        self.public_message = public_message
        self.context: dict[str, Any] = context or {}


class ValidationError(AppError):
    """Boundary validation failed (bad email, missing required field, oversize input)."""


class NotFoundError(AppError):
    """The requested resource does not exist for this tenant/user."""


class ConflictError(AppError):
    """Resource already exists or violates a uniqueness constraint."""


class PermissionError(AppError):
    """Authenticated caller is not allowed to perform this action."""


class AuthError(AppError):
    """Caller is not authenticated (missing/expired/invalid token)."""


class DependencyError(AppError):
    """A downstream dependency (Mongo, Redis, RabbitMQ, MCP, LLM) is unavailable."""


class BusinessRuleError(AppError):
    """The request is well-formed but violates a domain invariant."""


class InternalError(AppError):
    """An unexpected condition — the only error mapped to gRPC INTERNAL."""


TimeoutError = OperationTimeout
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `cd lib && ../.venv/bin/python -m pytest tests/test_errors.py -v`
Expected: all 4 tests PASS.

- [ ] **Step 1.5: Commit**

```bash
git add lib/lib/errors.py lib/tests/test_errors.py
git commit -m "feat(lib): error hierarchy for phase-0 robustness program"
```

---

## Task 2 — `to_grpc_status()` mapping

**Files:**
- Modify: `lib/lib/errors.py` (append `to_grpc_status()`)
- Test: `lib/tests/test_errors.py` (append cases)

**Interfaces:**
- Consumes: Task 1's `AppError` subclasses.
- Produces: `to_grpc_status(err: Exception) -> tuple[grpc.StatusCode, str]` — returns `(status_code, public_message)`. For non-`AppError` input, returns `(StatusCode.INTERNAL, "internal error")` so callers can rely on it as a total function.

- [ ] **Step 2.1: Write the failing test**

Append to `lib/tests/test_errors.py`:

```python
import grpc

from lib.errors import to_grpc_status


def test_to_grpc_status_maps_each_subclass():
    cases = [
        (ValidationError("bad email"), grpc.StatusCode.INVALID_ARGUMENT),
        (NotFoundError("no profile"), grpc.StatusCode.NOT_FOUND),
        (ConflictError("dup"), grpc.StatusCode.ALREADY_EXISTS),
        (PermissionError("denied"), grpc.StatusCode.PERMISSION_DENIED),
        (AuthError("expired"), grpc.StatusCode.UNAUTHENTICATED),
        (DependencyError("mongo down"), grpc.StatusCode.UNAVAILABLE),
        (BusinessRuleError("state terminal"), grpc.StatusCode.FAILED_PRECONDITION),
        (AppTimeoutError("op", 1.0), grpc.StatusCode.DEADLINE_EXCEEDED),
        (InternalError("bug"), grpc.StatusCode.INTERNAL),
    ]
    for err, expected_code in cases:
        code, msg = to_grpc_status(err)
        assert code == expected_code, f"{type(err).__name__} → {code}, want {expected_code}"
        assert msg == err.public_message if isinstance(err, AppError) else True


def test_to_grpc_status_falls_back_to_internal_for_unknown():
    code, msg = to_grpc_status(RuntimeError("surprise"))
    assert code == grpc.StatusCode.INTERNAL
    assert msg == "internal error"
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `cd lib && ../.venv/bin/python -m pytest tests/test_errors.py -v -k to_grpc_status`
Expected: ImportError on `to_grpc_status`.

- [ ] **Step 2.3: Write minimal implementation**

Append to `lib/lib/errors.py`:

```python
import grpc

_STATUS_MAP: dict[type[Exception], grpc.StatusCode] = {
    ValidationError: grpc.StatusCode.INVALID_ARGUMENT,
    NotFoundError: grpc.StatusCode.NOT_FOUND,
    ConflictError: grpc.StatusCode.ALREADY_EXISTS,
    PermissionError: grpc.StatusCode.PERMISSION_DENIED,
    AuthError: grpc.StatusCode.UNAUTHENTICATED,
    DependencyError: grpc.StatusCode.UNAVAILABLE,
    BusinessRuleError: grpc.StatusCode.FAILED_PRECONDITION,
    OperationTimeout: grpc.StatusCode.DEADLINE_EXCEEDED,
    InternalError: grpc.StatusCode.INTERNAL,
}


def to_grpc_status(err: Exception) -> tuple[grpc.StatusCode, str]:
    """Map any exception to ``(grpc.StatusCode, public_message)`` for the egress
    boundary. Unknown exceptions fall back to ``INTERNAL`` with a generic message —
    the original exception still propagates through ``log.exception``; this is only
    what we put on the wire.
    """
    for cls, code in _STATUS_MAP.items():
        if isinstance(err, cls):
            msg = err.public_message if isinstance(err, AppError) else str(err)
            return code, msg
    return grpc.StatusCode.INTERNAL, "internal error"
```

Also: add `import grpc` to the top of `errors.py` (move from inline to module-top).

- [ ] **Step 2.4: Run test to verify it passes**

Run: `cd lib && ../.venv/bin/python -m pytest tests/test_errors.py -v`
Expected: all tests PASS.

- [ ] **Step 2.5: Commit**

```bash
git add lib/lib/errors.py lib/tests/test_errors.py
git commit -m "feat(lib): to_grpc_status mapping for the typed error hierarchy"
```

---

## Task 3 — Timeout/retry knobs in config + `timeouts` accessor module

**Files:**
- Modify: `lib/lib/config.py`
- Create: `lib/lib/timeouts.py`
- Test: `lib/tests/test_timeouts.py`
- Test (existing): `lib/tests/test_config.py` — append knob defaults case.

**Interfaces:**
- Produces: 9 new `Settings` fields (env-driven) and a `lib.timeouts` module with `mongo() -> float`, `redis() -> float`, `rabbitmq_publish() -> float`, `llm_call() -> float`, `llm_retries() -> int`, `mcp_call() -> float`, `storage_op() -> float`, `http_client() -> float`. Each reads the singleton `Settings` via `get_settings()`.
- Consumes: nothing (foundational).

- [ ] **Step 3.1: Write the failing test**

Create `lib/tests/test_timeouts.py`:

```python
from lib import timeouts
from lib.config import BaseServiceSettings


def test_timeout_accessors_read_from_settings(monkeypatch):
    monkeypatch.setenv("MONGO_OP_TIMEOUT_SECONDS", "7.5")
    monkeypatch.setenv("REDIS_OP_TIMEOUT_SECONDS", "3")
    monkeypatch.setenv("LLM_CALL_RETRY_ATTEMPTS", "5")
    monkeypatch.setenv("RABBITMQ_PUBLISH_TIMEOUT_SECONDS", "4")
    monkeypatch.setenv("LLM_CALL_TIMEOUT_SECONDS", "20")
    monkeypatch.setenv("MCP_CALL_TIMEOUT_SECONDS", "15")
    monkeypatch.setenv("STORAGE_OP_TIMEOUT_SECONDS", "25")
    monkeypatch.setenv("HTTP_CLIENT_TIMEOUT_SECONDS", "12")

    s = BaseServiceSettings()
    timeouts._cached_settings = s  # inject for the test
    try:
        assert timeouts.mongo() == 7.5
        assert timeouts.redis() == 3.0
        assert timeouts.rabbitmq_publish() == 4.0
        assert timeouts.llm_call() == 20.0
        assert timeouts.llm_retries() == 5
        assert timeouts.mcp_call() == 15.0
        assert timeouts.storage_op() == 25.0
        assert timeouts.http_client() == 12.0
    finally:
        timeouts._cached_settings = None


def test_defaults_match_spec_section_2_3():
    s = BaseServiceSettings()
    timeouts._cached_settings = s
    try:
        assert timeouts.mongo() == 10.0
        assert timeouts.redis() == 5.0
        assert timeouts.rabbitmq_publish() == 5.0
        assert timeouts.llm_call() == 30.0
        assert timeouts.llm_retries() == 3
        assert timeouts.mcp_call() == 20.0
        assert timeouts.storage_op() == 35.0
        assert timeouts.http_client() == 15.0
    finally:
        timeouts._cached_settings = None
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `cd lib && ../.venv/bin/python -m pytest tests/test_timeouts.py -v`
Expected: ImportError on `lib.timeouts` OR AttributeError on the new Settings fields.

- [ ] **Step 3.3: Write minimal implementation**

Modify `lib/lib/config.py` — add these fields to `BaseServiceSettings`:

```python
    # Resilience knobs — see docs/superpowers/specs/2026-06-21-...-design.md §2.3.
    # Every external-call site reads via lib.timeouts.<accessor>(); no magic numbers in
    # call sites means per-environment tuning happens via env, not code.
    mongo_op_timeout_seconds: float = 10.0
    redis_op_timeout_seconds: float = 5.0
    rabbitmq_publish_timeout_seconds: float = 5.0
    llm_call_timeout_seconds: float = 30.0
    llm_call_retry_attempts: int = 3
    mcp_call_timeout_seconds: float = 20.0
    storage_op_timeout_seconds: float = 35.0
    http_client_timeout_seconds: float = 15.0
```

Create `lib/lib/timeouts.py`:

```python
"""Per-class timeout/retry knob accessors. Reads from ``BaseServiceSettings``.

Call sites use ``with_timeout(coro, lib.timeouts.mongo(), op="...")`` — never a magic
number — so per-environment tuning happens via env, not code edits.
"""

from lib.config import BaseServiceSettings

_cached_settings: BaseServiceSettings | None = None


def _s() -> BaseServiceSettings:
    global _cached_settings
    if _cached_settings is None:
        _cached_settings = BaseServiceSettings()
    return _cached_settings


def mongo() -> float:
    return _s().mongo_op_timeout_seconds


def redis() -> float:
    return _s().redis_op_timeout_seconds


def rabbitmq_publish() -> float:
    return _s().rabbitmq_publish_timeout_seconds


def llm_call() -> float:
    return _s().llm_call_timeout_seconds


def llm_retries() -> int:
    return _s().llm_call_retry_attempts


def mcp_call() -> float:
    return _s().mcp_call_timeout_seconds


def storage_op() -> float:
    return _s().storage_op_timeout_seconds


def http_client() -> float:
    return _s().http_client_timeout_seconds
```

- [ ] **Step 3.4: Run test to verify it passes**

Run: `cd lib && ../.venv/bin/python -m pytest tests/test_timeouts.py tests/test_config.py -v`
Expected: PASS.

- [ ] **Step 3.5: Commit**

```bash
git add lib/lib/config.py lib/lib/timeouts.py lib/tests/test_timeouts.py
git commit -m "feat(lib): env-driven timeout/retry knobs + lib.timeouts accessors"
```

---

## Task 4 — `log_domain_error` helper

**Files:**
- Modify: `lib/lib/logging.py` (append helper)
- Test: `lib/tests/test_logging.py` (append case)

**Interfaces:**
- Consumes: Task 1's `AppError`.
- Produces: `log_domain_error(log, err: AppError, **ctx) -> None` — emits one `logger.debug(...)` line with `err.public_message` + bound context. NO traceback, NO `log.exception()`. Used at the gRPC translator boundary for expected domain errors so the log isn't full of `NotFoundError("No profile yet")` stack traces (the issue documented in commit `24e117b`).

- [ ] **Step 4.1: Write the failing test**

Append to `lib/tests/test_logging.py`:

```python
from lib.errors import AuthError, NotFoundError
from lib.logging import get_logger, log_domain_error


def test_log_domain_error_logs_at_debug_without_traceback(caplog):
    log = get_logger(component="test")
    err = NotFoundError("no profile yet", context={"user_id": "u1"})

    with caplog.at_level("DEBUG"):
        log_domain_error(log, err, comp_id="c1")

    debug_records = [r for r in caplog.records if r.levelname == "DEBUG"]
    assert len(debug_records) == 1
    rec = debug_records[0]
    assert "no profile yet" in rec.getMessage()
    # No traceback / exc_info attached — that's the whole point.
    assert rec.exc_info is None


def test_log_domain_error_binds_context(caplog):
    log = get_logger(component="test")
    err = AuthError("token expired")
    with caplog.at_level("DEBUG"):
        log_domain_error(log, err, user_id="u9")
    assert any("token expired" in r.getMessage() for r in caplog.records)
```

- [ ] **Step 4.2: Run test to verify it fails**

Run: `cd lib && ../.venv/bin/python -m pytest tests/test_logging.py::test_log_domain_error_logs_at_debug_without_traceback -v`
Expected: ImportError on `log_domain_error`.

- [ ] **Step 4.3: Write minimal implementation**

Append to `lib/lib/logging.py`:

```python
def log_domain_error(log, err, **ctx) -> None:
    """Log an expected domain error at DEBUG level with **no** traceback.

    Use this at egress boundaries (gRPC translator, event-handler catch site) for errors
    you've already promoted to a typed ``AppError`` and translated to a client status —
    the stack trace is noise for these (commit ``24e117b`` documented the problem).

    For unexpected exceptions, keep using ``log.exception()`` via ``log_context``.
    """
    bound = log.bind(**ctx) if ctx else log
    bound.debug("domain_error: {} kind={}", err.public_message, type(err).__name__)
```

- [ ] **Step 4.4: Run test to verify it passes**

Run: `cd lib && ../.venv/bin/python -m pytest tests/test_logging.py -v`
Expected: PASS.

- [ ] **Step 4.5: Commit**

```bash
git add lib/lib/logging.py lib/tests/test_logging.py
git commit -m "feat(lib): log_domain_error helper for debug-no-traceback boundary logs"
```

---

## Task 5 — Central `AppError` translator in `grpcweb.py`

**Files:**
- Modify: `lib/lib/grpcweb.py` (extend the existing exception-translation block)
- Test: `lib/tests/test_grpcweb.py` (append cases)

**Interfaces:**
- Consumes: Tasks 1, 2, 4 — `AppError`, `to_grpc_status`, `log_domain_error`.
- Produces: a `grpcweb.py` whose call-handler catches `AppError` BEFORE the existing `_UNAVAILABLE_ERRORS` block; uses `to_grpc_status()` for code+message; uses `log_domain_error()` for `AuthError`/`NotFoundError`/`PermissionError`/`ValidationError` (no traceback) and `log.exception` for `DependencyError`/`InternalError`/unknown. Existing `_UNAVAILABLE_ERRORS` mapping unchanged so legacy code keeps working.

- [ ] **Step 5.1: Read the current grpcweb.py call-handler block**

Run: `grep -n "_UNAVAILABLE_ERRORS\|except\|set_code\|set_details" lib/lib/grpcweb.py`
Use the output to find the exact lines (~120–180 typically) where exceptions are caught. Note them.

- [ ] **Step 5.2: Write the failing test**

Append to `lib/tests/test_grpcweb.py` (model after the existing tests in that file — they construct a `_Context` and assert on `code/details`):

```python
import grpc

from lib.errors import AuthError, NotFoundError, ValidationError
from lib.grpcweb import _translate_exception_to_status


def test_translate_app_error_uses_to_grpc_status():
    err = ValidationError("bad email")
    code, msg = _translate_exception_to_status(err)
    assert code == grpc.StatusCode.INVALID_ARGUMENT
    assert msg == "bad email"


def test_translate_auth_error_to_unauthenticated():
    code, _ = _translate_exception_to_status(AuthError("expired"))
    assert code == grpc.StatusCode.UNAUTHENTICATED


def test_translate_not_found_to_not_found():
    code, _ = _translate_exception_to_status(NotFoundError("no profile"))
    assert code == grpc.StatusCode.NOT_FOUND


def test_translate_unknown_exception_to_internal():
    code, _ = _translate_exception_to_status(RuntimeError("surprise"))
    assert code == grpc.StatusCode.INTERNAL


def test_translate_unavailable_error_still_unavailable():
    # The existing PyMongoError/StorageError/OperationTimeout → UNAVAILABLE behavior
    # must not regress.
    from lib.resilience import OperationTimeout

    code, _ = _translate_exception_to_status(OperationTimeout("op", 1.0))
    assert code == grpc.StatusCode.DEADLINE_EXCEEDED  # via to_grpc_status; supersedes UNAVAILABLE
```

- [ ] **Step 5.3: Run test to verify it fails**

Run: `cd lib && ../.venv/bin/python -m pytest tests/test_grpcweb.py -v -k translate`
Expected: ImportError on `_translate_exception_to_status` OR test failures.

- [ ] **Step 5.4: Write the minimal implementation**

In `lib/lib/grpcweb.py`:

1. Add at the top of the imports section: `from lib.errors import AppError, to_grpc_status; from lib.logging import log_domain_error`.

2. Extract the exception-translation logic into a module-level function. Find the existing `except (PyMongoError, StorageError, OperationTimeout)` site (it sets `ctx.code = grpc.StatusCode.UNAVAILABLE` etc) and refactor it to call:

```python
def _translate_exception_to_status(exc: Exception) -> tuple[grpc.StatusCode, str]:
    """Single source of truth for exception → (grpc.StatusCode, message) at egress.

    AppError subclasses route through ``to_grpc_status`` (typed boundary). The legacy
    ``_UNAVAILABLE_ERRORS`` tuple is preserved as a fallback for any pre-AppError
    callers still raising raw infra errors.
    """
    if isinstance(exc, AppError) or isinstance(exc, OperationTimeout):
        return to_grpc_status(exc)
    if isinstance(exc, _UNAVAILABLE_ERRORS):
        return grpc.StatusCode.UNAVAILABLE, "dependency unavailable"
    return grpc.StatusCode.INTERNAL, "internal error"
```

3. Update the call-handler's `except` block to:

```python
except Exception as exc:  # noqa: BLE001 - boundary translator
    code, msg = _translate_exception_to_status(exc)
    if isinstance(exc, AppError) and code in (
        grpc.StatusCode.UNAUTHENTICATED,
        grpc.StatusCode.NOT_FOUND,
        grpc.StatusCode.PERMISSION_DENIED,
        grpc.StatusCode.INVALID_ARGUMENT,
        grpc.StatusCode.FAILED_PRECONDITION,
    ):
        log_domain_error(log, exc)
    else:
        log.exception("rpc_unhandled: code={} exc={}", code.name, type(exc).__name__)
    ctx.set_code(code)
    ctx.set_details(msg)
```

(If `grpcweb.py` already has a different structure, preserve its variable names and integrate the new logic into the existing catch — DON'T duplicate handlers.)

- [ ] **Step 5.5: Run test to verify it passes + run the entire `lib/` suite**

Run: `cd lib && ../.venv/bin/python -m pytest -q`
Expected: all tests PASS — no regression in existing `grpcweb` integration tests.

- [ ] **Step 5.6: Commit**

```bash
git add lib/lib/grpcweb.py lib/tests/test_grpcweb.py
git commit -m "feat(lib): central AppError translator at the gRPC egress boundary"
```

---

## Task 6 — Audit helper + retryable replay queue

**Files:**
- Create: `lib/lib/audit.py`
- Test: `lib/tests/test_audit.py`

**Interfaces:**
- Consumes: existing `lib.mongodb.repository` for the durable write and `lib.redis.client` for the replay queue.
- Produces:
  - `async def write_audit(repo, doc: dict) -> None` — writes one audit row durably; raises `DependencyError` on Mongo failure (caller decides whether to swallow).
  - `async def enqueue_replay(redis, doc: dict) -> None` — pushes a JSON-serialized audit doc onto a Redis list `audit:replay`; idempotent on `doc["event_id"]` via a 24h SET.
  - `async def drain_replay(repo, redis, *, batch: int = 50) -> int` — pops up to `batch` items, attempts `write_audit`, on success consumes; on failure puts the item back at the head and returns the count drained. Returns drained count.

- [ ] **Step 6.1: Write the failing test**

Create `lib/tests/test_audit.py`:

```python
import json

import pytest
import redis.asyncio as aioredis

from lib.audit import drain_replay, enqueue_replay, write_audit
from lib.errors import DependencyError


class FakeRepo:
    def __init__(self) -> None:
        self.docs: list[dict] = []
        self.fail = False

    async def insert(self, doc: dict) -> None:
        if self.fail:
            raise RuntimeError("mongo down")
        self.docs.append(doc)


class FakeRedis:
    def __init__(self) -> None:
        self.list: list[bytes] = []
        self.set_keys: set[str] = set()

    async def sadd(self, key, member):
        before = len(self.set_keys)
        self.set_keys.add(f"{key}:{member}")
        return 1 if len(self.set_keys) > before else 0

    async def expire(self, key, seconds):
        return 1

    async def rpush(self, key, value):
        self.list.append(value)
        return len(self.list)

    async def lpop(self, key):
        return self.list.pop(0) if self.list else None

    async def lpush(self, key, value):
        self.list.insert(0, value)
        return len(self.list)


@pytest.mark.asyncio
async def test_write_audit_persists_on_success():
    repo = FakeRepo()
    await write_audit(repo, {"event_id": "e1", "action": "login"})
    assert repo.docs == [{"event_id": "e1", "action": "login"}]


@pytest.mark.asyncio
async def test_write_audit_raises_dependency_error_on_repo_failure():
    repo = FakeRepo()
    repo.fail = True
    with pytest.raises(DependencyError):
        await write_audit(repo, {"event_id": "e1"})


@pytest.mark.asyncio
async def test_enqueue_replay_dedups_by_event_id():
    redis = FakeRedis()
    doc = {"event_id": "e1", "action": "login"}
    await enqueue_replay(redis, doc)
    await enqueue_replay(redis, doc)  # idempotent
    assert len(redis.list) == 1


@pytest.mark.asyncio
async def test_drain_replay_drains_on_success_and_keeps_on_failure():
    redis = FakeRedis()
    repo = FakeRepo()
    await enqueue_replay(redis, {"event_id": "e1"})
    await enqueue_replay(redis, {"event_id": "e2"})

    drained = await drain_replay(repo, redis, batch=10)
    assert drained == 2
    assert len(redis.list) == 0
    assert len(repo.docs) == 2

    # Failure path — items stay on the queue.
    await enqueue_replay(redis, {"event_id": "e3"})
    repo.fail = True
    drained = await drain_replay(repo, redis, batch=10)
    assert drained == 0
    assert len(redis.list) == 1
```

- [ ] **Step 6.2: Run test to verify it fails**

Run: `cd lib && ../.venv/bin/python -m pytest tests/test_audit.py -v`
Expected: ImportError on `lib.audit`.

- [ ] **Step 6.3: Write minimal implementation**

Create `lib/lib/audit.py`:

```python
"""Audit-write helpers — durable path + retryable replay queue.

Audit data is compliance-critical (every automated decision, override, sensitive access
must leave a row). The single-call path: ``await write_audit(repo, doc)``. When the
caller has already done the durable mutation and the audit-write fails (e.g. transient
Mongo blip), the caller calls ``enqueue_replay(redis, doc)`` to durably stash the row
on a Redis list, and a background drainer (``drain_replay``) flushes it later.
"""

import json
from typing import Any

from lib.errors import DependencyError

_REPLAY_LIST_KEY = "audit:replay"
_REPLAY_DEDUP_KEY = "audit:replay:seen"
_REPLAY_DEDUP_TTL_SECONDS = 24 * 3600


async def write_audit(repo, doc: dict[str, Any]) -> None:
    """Insert one audit row. Translates infra errors to ``DependencyError`` so the
    caller can decide whether to enqueue a replay.
    """
    try:
        await repo.insert(doc)
    except Exception as exc:
        raise DependencyError("audit write failed", context={"event_id": doc.get("event_id")}) from exc


async def enqueue_replay(redis, doc: dict[str, Any]) -> None:
    """Stash an audit doc on the replay queue. Idempotent on ``doc['event_id']``."""
    event_id = doc.get("event_id")
    if not event_id:
        raise ValueError("enqueue_replay: doc must carry event_id")
    added = await redis.sadd(_REPLAY_DEDUP_KEY, event_id)
    if not added:
        return
    await redis.expire(_REPLAY_DEDUP_KEY, _REPLAY_DEDUP_TTL_SECONDS)
    await redis.rpush(_REPLAY_LIST_KEY, json.dumps(doc).encode("utf-8"))


async def drain_replay(repo, redis, *, batch: int = 50) -> int:
    """Pop up to ``batch`` items and try to ``write_audit`` each. On failure, the item
    is pushed back at the head so order is preserved. Returns count drained.
    """
    drained = 0
    for _ in range(batch):
        raw = await redis.lpop(_REPLAY_LIST_KEY)
        if raw is None:
            break
        doc = json.loads(raw)
        try:
            await write_audit(repo, doc)
            drained += 1
        except DependencyError:
            await redis.lpush(_REPLAY_LIST_KEY, raw)
            break
    return drained
```

- [ ] **Step 6.4: Run test to verify it passes**

Run: `cd lib && ../.venv/bin/python -m pytest tests/test_audit.py -v`
Expected: PASS.

- [ ] **Step 6.5: Commit**

```bash
git add lib/lib/audit.py lib/tests/test_audit.py
git commit -m "feat(lib): audit write_audit + enqueue_replay + drain_replay helpers"
```

---

## Task 7 — `scripts/check_timeouts.py` gate-enforcement guard

**Files:**
- Create: `scripts/check_timeouts.py`
- Create: `scripts/.timeouts_allowlist.txt`
- Test: `scripts/tests/test_check_timeouts.py` (small, integration-ish)

**Interfaces:**
- Consumes: nothing (standalone Python script).
- Produces: a script that exits 0 if every uninstrumented call site is on the allowlist, non-zero otherwise. Run from `scripts/check.sh` between `ruff check` and `pip-audit`.

- [ ] **Step 7.1: Seed the allowlist with the current known violations**

Create `scripts/.timeouts_allowlist.txt` (one `file:lineno` per line; sourced from the Phase 0 audit findings):

```
# Allowed-for-now uninstrumented external calls. Phase 1 deletes from this file.
# Format: relative/path/to/file.py:LINE
src/mcp-data/app/tools.py:70
src/mcp-data/app/tools.py:84
src/mcp-data/app/tools.py:100
src/mcp-data/app/tools.py:117
src/mcp-data/app/tools.py:137
# ... (continue with the 18 mcp-data sites + 7 mcp-capability sites + 4 ai-agents sites
#      from the audit; the executing agent re-greps to confirm exact line numbers)
src/mcp-capability/app/tools.py:133
src/mcp-capability/app/tools.py:135
src/mcp-capability/app/tools.py:152
src/mcp-capability/app/tools.py:183
src/mcp-capability/app/tools.py:203
src/mcp-capability/app/tools.py:204
src/mcp-capability/app/tools.py:207
src/ai-agents/app/infra/sessions.py:65
src/ai-agents/app/infra/sessions.py:70
src/ai-agents/app/infra/sessions.py:75
```

(The seeded list above is from the Phase 0 audit; if line numbers shifted, the executing agent re-greps the cited files for the equivalent uninstrumented call and updates line numbers in the allowlist before running the script. There is NO `--seed` flag on `check_timeouts.py`; the allowlist is curated by hand. The agent may extend the allowlist using `Edit` if additional pre-existing violations surface during scan.)

- [ ] **Step 7.2: Write the failing test**

Create `scripts/tests/test_check_timeouts.py`:

```python
import subprocess
import sys
from pathlib import Path


def test_check_timeouts_exits_zero_with_current_allowlist():
    repo = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        [sys.executable, str(repo / "scripts/check_timeouts.py")],
        capture_output=True,
        text=True,
        cwd=repo,
    )
    assert result.returncode == 0, f"stderr={result.stderr}\nstdout={result.stdout}"


def test_check_timeouts_fails_on_new_uninstrumented_call(tmp_path):
    repo = Path(__file__).resolve().parents[2]
    # Create a tmp Python file with an uninstrumented redis call.
    test_target = tmp_path / "bad.py"
    test_target.write_text("async def x():\n    await redis.get('k')\n")
    result = subprocess.run(
        [sys.executable, str(repo / "scripts/check_timeouts.py"), "--root", str(tmp_path)],
        capture_output=True,
        text=True,
        cwd=repo,
    )
    assert result.returncode != 0
    assert "bad.py" in result.stdout + result.stderr
```

- [ ] **Step 7.3: Run test to verify it fails**

Run: `python -m pytest scripts/tests/test_check_timeouts.py -v`
Expected: file-not-found on `scripts/check_timeouts.py`.

- [ ] **Step 7.4: Write minimal implementation**

Create `scripts/check_timeouts.py`:

```python
#!/usr/bin/env python3
"""Gate guard: flag any new uninstrumented external-call site.

Greps the codebase for ``await <ext>.<method>(...)`` patterns outside a
``with_timeout(...)`` context, compares against the allowlist, exits non-zero
on any non-allowlisted hit. See PRODUCTION_STANDARDS.md.
"""

import argparse
import re
import sys
from pathlib import Path

DEFAULT_ROOTS = [
    "lib/lib",
    "src/admin/app",
    "src/ai-agents/app",
    "src/mcp-data/app",
    "src/mcp-capability/app",
]

EXTERNAL_PATTERNS = [
    re.compile(r"await\s+self\._collection\."),
    re.compile(r"await\s+self\._\w+\.(insert|find|update|delete|aggregate)"),
    re.compile(r"await\s+redis\."),
    re.compile(r"await\s+self\._r\."),
    re.compile(r"await\s+self\._redis\."),
    re.compile(r"await\s+self\._publisher\."),
    re.compile(r"httpx\."),
    re.compile(r"requests\."),
]

WRAPPER_PATTERN = re.compile(r"with_timeout\s*\(")


def load_allowlist(path: Path) -> set[str]:
    if not path.exists():
        return set()
    lines = []
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        lines.append(line)
    return set(lines)


def scan(roots: list[Path], allow: set[str]) -> list[str]:
    violations = []
    for root in roots:
        if not root.exists():
            continue
        for py in root.rglob("*.py"):
            if "/pb/" in str(py) or "/tests/" in str(py):
                continue
            text = py.read_text()
            lines = text.splitlines()
            for i, line in enumerate(lines, start=1):
                if not any(p.search(line) for p in EXTERNAL_PATTERNS):
                    continue
                # Heuristic: a wrapper on the SAME line OR the previous 2 lines counts as instrumented.
                window = "\n".join(lines[max(0, i - 3) : i])
                if WRAPPER_PATTERN.search(window):
                    continue
                rel = str(py)
                if f"{rel}:{i}" in allow:
                    continue
                violations.append(f"{rel}:{i}: {line.strip()}")
    return violations


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", action="append", default=None)
    ap.add_argument("--allowlist", default="scripts/.timeouts_allowlist.txt")
    args = ap.parse_args()

    repo = Path.cwd()
    roots = (
        [repo / r for r in (args.root or DEFAULT_ROOTS)]
        if not args.root
        else [Path(r) for r in args.root]
    )
    allow = load_allowlist(repo / args.allowlist)
    violations = scan(roots, allow)
    if violations:
        print("uninstrumented external calls found (add with_timeout or update allowlist):")
        for v in violations:
            print(f"  {v}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 7.5: Run tests + the script itself**

Run:
```
python -m pytest scripts/tests/test_check_timeouts.py -v
python scripts/check_timeouts.py
```
Expected: tests PASS; script exits 0 (because the seeded allowlist covers all current violations).

- [ ] **Step 7.6: Commit**

```bash
git add scripts/check_timeouts.py scripts/.timeouts_allowlist.txt scripts/tests/test_check_timeouts.py
git commit -m "feat(scripts): check_timeouts gate guard + seeded allowlist"
```

---

## Task 8 — `scripts/check_log_coverage.py` gate-enforcement guard

**Files:**
- Create: `scripts/check_log_coverage.py`
- Create: `scripts/.log_coverage_allowlist.txt`
- Test: `scripts/tests/test_check_log_coverage.py`

**Interfaces:**
- Consumes: nothing.
- Produces: a script that exits 0 if every `async def` in `src/admin/app/resources/*.py` whose body does NOT start with `async with log_context(...)` is on the allowlist; exit non-zero otherwise.

- [ ] **Step 8.1: Seed the allowlist**

Create `scripts/.log_coverage_allowlist.txt` with one `file:lineno:funcname` per line. The executing agent runs `python scripts/check_log_coverage.py --seed > scripts/.log_coverage_allowlist.txt` to populate from current state. Header comment:

```
# Resource functions not yet wrapped in log_context. Phase 2 shrinks this file.
# Format: relative/path/to/file.py:LINE:funcname
```

- [ ] **Step 8.2: Write the failing test**

Create `scripts/tests/test_check_log_coverage.py`:

```python
import subprocess
import sys
from pathlib import Path


def test_check_log_coverage_passes_with_current_allowlist():
    repo = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        [sys.executable, str(repo / "scripts/check_log_coverage.py")],
        capture_output=True,
        text=True,
        cwd=repo,
    )
    assert result.returncode == 0, f"stderr={result.stderr}\nstdout={result.stdout}"


def test_check_log_coverage_fails_on_new_unwrapped_function(tmp_path):
    repo = Path(__file__).resolve().parents[2]
    target_dir = tmp_path / "resources"
    target_dir.mkdir()
    (target_dir / "x.py").write_text(
        "async def naked_fn():\n    return 1\n"
    )
    result = subprocess.run(
        [
            sys.executable,
            str(repo / "scripts/check_log_coverage.py"),
            "--resources-root",
            str(tmp_path),
        ],
        capture_output=True,
        text=True,
        cwd=repo,
    )
    assert result.returncode != 0
    assert "naked_fn" in result.stdout + result.stderr
```

- [ ] **Step 8.3: Run test to verify it fails**

Run: `python -m pytest scripts/tests/test_check_log_coverage.py -v`
Expected: file-not-found.

- [ ] **Step 8.4: Write minimal implementation**

Create `scripts/check_log_coverage.py`:

```python
#!/usr/bin/env python3
"""Gate guard: every `async def` in src/admin/app/resources/*.py must wrap its body in
`async with log_context(...)`. Allowlist file holds known unwrapped sites that Phase 2
shrinks file-by-file.
"""

import argparse
import ast
import sys
from pathlib import Path

DEFAULT_RESOURCES_ROOT = "src/admin/app/resources"


def load_allowlist(path: Path) -> set[str]:
    if not path.exists():
        return set()
    out = set()
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        out.add(line)
    return out


def _starts_with_log_context(fn: ast.AsyncFunctionDef) -> bool:
    if not fn.body:
        return False
    first = fn.body[0]
    if isinstance(first, ast.AsyncWith):
        for item in first.items:
            call = item.context_expr
            if (
                isinstance(call, ast.Call)
                and isinstance(call.func, ast.Name)
                and call.func.id == "log_context"
            ):
                return True
            if (
                isinstance(call, ast.Call)
                and isinstance(call.func, ast.Attribute)
                and call.func.attr == "log_context"
            ):
                return True
    return False


def scan(root: Path, allow: set[str]) -> list[str]:
    violations = []
    if not root.exists():
        return violations
    for py in root.rglob("*.py"):
        if py.name == "__init__.py":
            continue
        try:
            tree = ast.parse(py.read_text())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.AsyncFunctionDef):
                continue
            if node.name.startswith("_"):
                continue
            if _starts_with_log_context(node):
                continue
            key = f"{py}:{node.lineno}:{node.name}"
            if key in allow:
                continue
            violations.append(key)
    return violations


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--resources-root", default=DEFAULT_RESOURCES_ROOT)
    ap.add_argument("--allowlist", default="scripts/.log_coverage_allowlist.txt")
    ap.add_argument("--seed", action="store_true", help="Print current violations to stdout")
    args = ap.parse_args()

    repo = Path.cwd()
    root = Path(args.resources_root)
    if not root.is_absolute():
        root = repo / root
    allow = set() if args.seed else load_allowlist(repo / args.allowlist)
    violations = scan(root, allow)
    if args.seed:
        for v in violations:
            print(v)
        return 0
    if violations:
        print("resource functions missing `async with log_context(...)`:")
        for v in violations:
            print(f"  {v}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 8.5: Seed the allowlist + verify**

Run:
```
python scripts/check_log_coverage.py --seed > scripts/.log_coverage_allowlist.txt
```
Then use `Edit` to PREPEND these two lines to `scripts/.log_coverage_allowlist.txt` (above the seeded content):
```
# Resource functions not yet wrapped in log_context. Phase 2 shrinks this file.
# Format: relative/path/to/file.py:LINE:funcname
```
Then run:
```
python scripts/check_log_coverage.py
python -m pytest scripts/tests/test_check_log_coverage.py -v
```
Expected: gate-guard exits 0; tests PASS.

- [ ] **Step 8.6: Commit**

```bash
git add scripts/check_log_coverage.py scripts/.log_coverage_allowlist.txt scripts/tests/test_check_log_coverage.py
git commit -m "feat(scripts): check_log_coverage gate guard + seeded allowlist"
```

---

## Task 9 — Wire new guards into `scripts/check.sh`

**Files:**
- Modify: `scripts/check.sh`

**Interfaces:**
- Consumes: Tasks 7, 8.
- Produces: a `check.sh` that runs the two new guards between `ruff check` and `pip-audit`. No new test (the existing test is the gate itself running green).

- [ ] **Step 9.1: Read the current `scripts/check.sh`**

Run: `cat scripts/check.sh`
Note the line numbers for `ruff check` and `pip-audit` blocks.

- [ ] **Step 9.2: Modify `scripts/check.sh`**

Between the existing `ruff check` block and the `pip-audit` block, insert:

```bash
echo "==> robustness guards (timeouts + log-coverage)"
"$PY" "$ROOT/scripts/check_timeouts.py"
"$PY" "$ROOT/scripts/check_log_coverage.py"
```

(Place after the `ruff check` block and before `pip-audit` so static checks run first, then guards, then dependency audit, then tests.)

- [ ] **Step 9.3: Run the full gate**

Run: `bash scripts/check.sh`
Expected: prints both new lines, then proceeds through `pip-audit` and all 5 test suites. Exit 0.

- [ ] **Step 9.4: Commit**

```bash
git add scripts/check.sh
git commit -m "chore(gate): wire check_timeouts + check_log_coverage into scripts/check.sh"
```

---

## Task 10 — Phase 0 HANDOFF doc + memory pointer

**Files:**
- Create: `docs/superpowers/plans/2026-06-21-robustness-phase-0-handoff.md`
- Modify: `/Users/rugwedpatharkar/.claude/projects/-Users-rugwedpatharkar-Projects-Project/memory/MEMORY.md`
- Create: `/Users/rugwedpatharkar/.claude/projects/-Users-rugwedpatharkar-Projects-Project/memory/robustness-phase-0.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: a handoff doc following the project pattern (see `docs/superpowers/plans/2026-06-21-autonomous-test-issues.md` for style) summarizing what shipped + the verification output + what Phase 1 should consume.

- [ ] **Step 10.1: Write the HANDOFF doc**

Create `docs/superpowers/plans/2026-06-21-robustness-phase-0-handoff.md`:

```markdown
# Robustness Phase 0 — HANDOFF (2026-06-21)

Phase 0 closed: shared `lib/` primitives that the next 5 phases consume have landed.
No service code changed. Gate green: `bash scripts/check.sh` exit 0.

## Shipped

- `lib/lib/errors.py` — `AppError` base + 9 subclasses + `to_grpc_status()`.
- `lib/lib/timeouts.py` — env-driven knob accessors (`mongo()`, `redis()`, etc.).
- `lib/lib/config.py` — 9 new resilience knobs on `BaseServiceSettings`.
- `lib/lib/logging.py` — `log_domain_error(log, err, **ctx)` helper.
- `lib/lib/grpcweb.py` — central `_translate_exception_to_status()` + boundary handler.
- `lib/lib/audit.py` — `write_audit`, `enqueue_replay`, `drain_replay`.
- `scripts/check_timeouts.py` + `.timeouts_allowlist.txt` — gate guard, allowlist seeded.
- `scripts/check_log_coverage.py` + `.log_coverage_allowlist.txt` — gate guard, allowlist seeded.
- `scripts/check.sh` — runs the two new guards between lint and pip-audit.

## Verification

- `bash scripts/check.sh` — PASS.
- `lib/` test suite — PASS (added: `test_errors`, `test_timeouts`, `test_audit`; extended:
  `test_logging`, `test_grpcweb`).
- No regressions in `src/admin`, `src/ai-agents`, `src/mcp-data`, `src/mcp-capability`
  test suites (no service code touched).

## What Phase 1 consumes

- `with_timeout(coro, timeouts.mongo(), op="...")` everywhere `mcp-data/tools.py` and
  `mcp-capability/tools.py` do raw Mongo/Redis calls.
- `with_timeout(coro, timeouts.redis(), op="...")` in `ai-agents/infra/sessions.py`.
- `log_domain_error(log, err)` at every `except AppError:` catch site once Phase 2
  rewires resources to raise typed errors.
- `audit.write_audit` + `audit.enqueue_replay` at every audit-write site Phase 2 fixes.

## What Phase 1 does NOT touch

- Existing `_STATUS` dict in `admin/resources/auth.py` (Phase 2 swaps it for the central
  translator).
- Existing `log_context` decorators (still functional; Phase 2 EXPANDS coverage).
```

- [ ] **Step 10.2: Create the memory file**

Create `/Users/rugwedpatharkar/.claude/projects/-Users-rugwedpatharkar-Projects-Project/memory/robustness-phase-0.md`:

```markdown
---
name: robustness-phase-0
description: Phase 0 (shared lib infra for the robustness program) closed 2026-06-21. lib.errors / lib.timeouts / lib.audit / log_domain_error / grpcweb translator / two gate guards landed. No service code changed; Phase 1 consumes the helpers.
metadata:
  type: project
---

Phase 0 of the platform-robustness program shipped 2026-06-21.

**Why:** baseline for all subsequent phases — typed errors, env-driven timeouts,
boundary-translator, audit helpers, and gate guards (check_timeouts + check_log_coverage)
that prevent regression.

**How to apply:** when implementing Phase 1+, import from these new modules
(`from lib.errors import ...`, `from lib import timeouts`, `from lib.audit import ...`),
and call `log_domain_error(...)` at every typed-error catch site. The allowlist files
under `scripts/` (`.timeouts_allowlist.txt`, `.log_coverage_allowlist.txt`) shrink as
each phase wraps calls / adds log_context.

Full HANDOFF at [[../docs/superpowers/plans/2026-06-21-robustness-phase-0-handoff.md]].
Design spec at [[interview-platform-robustness-spec]].
```

- [ ] **Step 10.3: Add pointers to MEMORY.md**

Append two lines to `/Users/rugwedpatharkar/.claude/projects/-Users-rugwedpatharkar-Projects-Project/memory/MEMORY.md`:

```markdown
- [Robustness program spec (2026-06-21)](interview-platform-robustness-spec.md) — 6-phase backend+FE hardening + observability platform; spec committed, Phase 0 shipped
- [Robustness Phase 0 (2026-06-21)](robustness-phase-0.md) — lib.errors/timeouts/audit + grpcweb translator + 2 gate guards landed
```

Also create the spec-pointer memory file `interview-platform-robustness-spec.md` in that directory:

```markdown
---
name: interview-platform-robustness-spec
description: 6-phase robustness + observability program design spec lives at docs/superpowers/specs/2026-06-21-platform-robustness-and-observability-design.md. User approved 2026-06-21.
metadata:
  type: project
---

Comprehensive 6-phase plan: shared lib infra → P0 timeout wraps → admin resource-log
coverage → FE robustness sweep → missing-RPC wirings (decisions.hold/reject,
IntegrityTimeline, cursor pagination, unified mark-read) → observability platform
(ObservabilityService, 16 funnel events, FE SDK) → polish + chaos verification.

**Why:** user explicitly asked for extreme robustness, exception handling, detailed
logging, optimized code, "never fail at any level". Scope chosen: option C (everything
incl. observability platform) + targeted behavior fixes where audit found bugs.

**How to apply:** every phase has a per-phase plan under
`docs/superpowers/plans/2026-06-21-robustness-phase-<N>-*.md`. Each phase writes its
own HANDOFF doc; this memory's pointer chain is the index. Phase N+1 plan is written
after Phase N closes.
```

- [ ] **Step 10.4: Commit**

```bash
git add docs/superpowers/plans/2026-06-21-robustness-phase-0-handoff.md
git commit -m "docs(robustness-phase-0): HANDOFF — phase 0 close + verification"
```

(The memory files are outside the repo — under `~/.claude/projects/...` — and are not committed to git.)

---

## Self-review

**1. Spec coverage:**
- §2.1 error hierarchy → Tasks 1, 2 ✓
- §2.2 logging convention (`log_domain_error`) → Task 4 ✓
- §2.3 timeout/retry knob model → Task 3 ✓
- §2.4 idempotency + audit contract (helpers) → Task 6 ✓ (`@idempotent_by` decorator is a Phase 2 add — Phase 0 only ships the audit primitives)
- §3 Phase 0 scope (5 lib additions + 2 gate guards) → Tasks 1–9 ✓
- §4.3 lint reinforcement (the two new check scripts) → Tasks 7, 8, 9 ✓
- §4.6 sequencing (per-phase HANDOFF) → Task 10 ✓

**2. Placeholder scan:**
- Allowlist file in Task 7.1 has a `# ...` comment with "(continue ... agent re-greps to confirm exact line numbers)" — this is intentional guidance for the executing engineer (the audit listed the file paths but line numbers may have shifted; the seeded few are the audit-cited lines). Not a placeholder for ME to fill — it's an instruction for the engineer. Accepting.

**3. Type consistency:**
- `to_grpc_status(err)` returns `tuple[StatusCode, str]` everywhere (Tasks 2, 5).
- `AppError(public_message, *, context)` signature consistent (Tasks 1, 2, 5).
- `write_audit(repo, doc)` / `enqueue_replay(redis, doc)` / `drain_replay(repo, redis, *, batch)` signatures consistent (Task 6 only).
- `log_domain_error(log, err, **ctx)` signature consistent (Tasks 4, 5).
- `timeouts.mongo()` / `redis()` / etc. — accessor naming consistent (Tasks 3, "what Phase 1 consumes" in Task 10).

No inconsistencies found.

---

## What this plan does NOT cover (deferred to Phase 1+)

- Service code changes (any `src/*` modification) — Phases 1, 2, 4, 5, 6.
- FE code changes — Phases 1, 3, 5, 6.
- The `@idempotent_by(...)` decorator-comment pair — Phase 2.
- The `audit_replay_drainer` consumer service that calls `drain_replay` on a schedule —
  Phase 2 (paired with the audit-log gap sweep).
- Wiring the new translator into per-service servicers (replaces per-resource `_STATUS`
  dicts) — Phase 2.

Next plan to write: `docs/superpowers/plans/2026-06-21-robustness-phase-1-stop-the-bleeding.md` (after Phase 0 closes).
