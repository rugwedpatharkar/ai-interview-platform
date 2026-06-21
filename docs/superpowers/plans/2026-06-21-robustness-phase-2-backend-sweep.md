# Robustness Phase 2 — Backend Robustness Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap every admin resource function in `async with log_context(...)`, migrate `AuthDomainError` to inherit `lib.errors.AppError` so the central translator handles it natively, add error logs to ~25 catch-and-reraise blocks across mcp-data/ai-agents that currently swallow context on re-raise, fix the silent presigned-URL failure, close the audit-log gaps the Phase-0 audit surfaced, and drain `scripts/.log_coverage_allowlist.txt` to empty. Result: every business operation is observable end-to-end and every typed domain error flows through one boundary translator.

**Architecture:** Three workstreams in sequence.
1. **Error migration:** `AuthDomainError` inherits `lib.errors.AppError`; specific subclasses (`NotFoundError`, `ConflictError`, `ValidationError`) get multiple inheritance from both `AuthDomainError` and their `lib.errors.*` peer so `to_grpc_status()` maps them correctly via `isinstance`. The per-route `_STATUS` dicts become redundant; we delete them and let the Phase-0 translator handle the mapping.
2. **`log_context` coverage:** 28 admin resource files, 104 functions, batched into 3 thematic batches (identity/funnel/everything-else). Commit-per-file (per CLAUDE.md "one commit per pattern category") with `.log_coverage_allowlist.txt` shrinking deterministically.
3. **Cleanup sweep:** error-log gaps in catch blocks, presigned-URL fix, audit-log gap sweep, magic-number timeout removal.

**Tech Stack:** Python 3.12, pydantic-settings 2.x, loguru, grpcio, pytest, ruff. Phase 0 + Phase 1 helpers are the substrate: `lib.errors.AppError` + subclasses, `lib.timeouts.*`, `lib.resilience.with_timeout`, `lib.logging.log_context`/`log_domain_error`, `lib.grpcweb._translate_exception_to_status`.

## Global Constraints

- Spec source: `docs/superpowers/specs/2026-06-21-platform-robustness-and-observability-design.md` (§3 Phase 2).
- Behavior preservation: NO change to gRPC status codes a client observes. The error-migration step is type-system + translator-internal; the `_STATUS` dict deletion only removes a redundant mapping (the central translator produces the same status). Verify with full gate after every commit.
- TDD mandatory: failing test → watched fail → minimal implementation → green → commit (per `PRODUCTION_STANDARDS.md §5`).
- Per-task commit on `main`; never change branch; stage explicit paths only.
- Working directory for every command: `/Users/rugwedpatharkar/Projects/Project`.
- Pre-commit gate per touched-file: `ruff format --check`, `ruff check`, and the relevant pytest suite all exit 0. Full `bash scripts/check.sh` exit 0 at end of every task.
- Lint coverage guard `scripts/check_log_coverage.py` shrinks deterministically: each wrapped function = one line deleted from `scripts/.log_coverage_allowlist.txt`. By Phase 2 close, the file contains only header comments.
- No backwards-compatibility shims; no defensive guards on typed params; no `except: pass`; no nested `try/except`; no magic-number timeouts.
- The pre-existing macOS `os.killpg` flake in `lib/tests/test_execution.py` is unrelated to Phase 2 — re-run the gate if it fires.

## Pre-Phase Audit Findings

`scripts/.log_coverage_allowlist.txt` lists **104 admin resource functions across 28 files**:

| Files (sorted by func count) | Count |
|---|---|
| `auth.py`, `settings.py` | 12, 11 |
| `scheduling.py`, `team.py`, `notification.py`, `job.py` | 8, 6, 5, 5 |
| `scheduler.py`, `rubric.py`, `messaging.py`, `compliance.py`, `company_profile.py`, `application.py` | 4 each |
| `saved_jobs.py`, `report.py`, `profile.py`, `job_alerts.py`, `coding.py`, `analytics.py` | 3 each |
| `recommendations.py`, `preferences.py`, `discovery.py`, `decision.py`, `aptitude.py` | 2 each |
| `talent.py`, `sourcing.py`, `recommend.py`, `integrity.py`, `funnel.py` | 1 each |

Plus from the Phase-0 audit:
- **~25 catch-and-reraise blocks** without error logs (~18 in `src/mcp-data/app/tools.py`, 2 in `src/mcp-capability/app/tools.py`, 5 in `src/ai-agents/app/infra/sessions.py` + `mcp_capability.py` + `routes/interview.py`).
- **Presigned-URL silent failure** at `src/admin/app/resources/company_profile.py:68-69` (returns `""` on error instead of surfacing the failure).
- **Audit-log gaps** — Phase-0 audit cited automated decisions/overrides without `audit_logs` writes (specific sites to enumerate in P2-9 by re-scan).

## File Structure (lock-in)

**Modified files (errors migration):**

| Path | Change |
|---|---|
| `src/admin/app/errors.py` | `AuthDomainError(lib.errors.AppError)`; subclasses with `lib.*` peer get multiple inheritance: `ConflictError(AuthDomainError, lib.errors.ConflictError)`, `NotFoundError(AuthDomainError, lib.errors.NotFoundError)`, `ValidationError(AuthDomainError, lib.errors.ValidationError)`, `InvalidCredentialsError(AuthDomainError, lib.errors.AuthError)`, `ForbiddenError(AuthDomainError, lib.errors.PermissionError)`, `InvalidTransition(AuthDomainError, lib.errors.BusinessRuleError)`, `LimitExceededError(AuthDomainError, lib.errors.BusinessRuleError)`. `InvalidTokenError`, `RateLimitedError` stay AuthDomainError-only (translator falls back to `INTERNAL` — `RateLimitedError` overrides via custom mapping). |
| `src/admin/app/routes/auth.py` | `_STATUS` dict + `_abort` helper retained for `RateLimitedError` (needs `RESOURCE_EXHAUSTED` which has no lib peer); other catches simplified to delegate to translator. |
| `src/admin/app/routes/*.py` (other) | Remove per-route `_STATUS` ladders. The central translator handles AppError-mapped subclasses automatically. Keep manual aborts for codes that have no AppError mapping. |

**Modified files (log_context coverage):**
- 28 files under `src/admin/app/resources/`.

**Modified files (error log gaps):**
- `src/mcp-data/app/tools.py` — ~18 catch sites get `log.exception(...)` before `raise`.
- `src/mcp-capability/app/tools.py` — 2 catch sites in `embed()` and `kb_search()` get `log.exception(...)`.
- `src/ai-agents/app/infra/sessions.py` — 3 sites get error logs.
- `src/ai-agents/app/infra/mcp_capability.py:47` — log original exception before re-raising.
- `src/ai-agents/app/routes/interview.py:156`, `chat.py:54,63` — bind context to exception logs.

**Modified files (cleanup):**
- `src/admin/app/resources/company_profile.py:68-69` — return error instead of `""`.
- TBD audit-log gap sites (enumerate at start of P2-9).

**New tests:**
- `src/admin/tests/test_errors_migration.py` — verifies `isinstance(NotFoundError(...), lib.errors.NotFoundError)` etc., translator maps each correctly.
- `src/admin/tests/test_resource_log_coverage.py` — one round-trip test that triggers each batch's resource and asserts `op.start: resource.<file>.<func>` appears in loguru output.
- `src/mcp-data/tests/test_error_logs.py` — verify catch blocks log before re-raise.
- `src/admin/tests/test_presigned_url_failure.py` — verify error surfaced, not swallowed.

---

## Task 1 — Migrate `AuthDomainError` to inherit `AppError` + simplify routes' `_STATUS` ladders

**Files:**
- Modify: `src/admin/app/errors.py`
- Modify: `src/admin/app/routes/auth.py` (simplify `_abort` for non-RateLimited cases) and any other route with a `_STATUS` dict
- Test: `src/admin/tests/test_errors_migration.py` (new)

**Interfaces:**
- Consumes: `lib.errors.AppError`/`ConflictError`/`NotFoundError`/`ValidationError`/`AuthError`/`PermissionError`/`BusinessRuleError`.
- Produces: `app.errors.AuthDomainError(lib.errors.AppError)` and subclasses with multiple inheritance where a `lib.errors.*` peer exists. The central `to_grpc_status()` now maps admin's errors to gRPC status automatically.

- [ ] **Step 1.1: Write the failing test**

Create `src/admin/tests/test_errors_migration.py`:

```python
import grpc
import pytest

from app.errors import (
    AuthDomainError,
    ConflictError,
    ForbiddenError,
    InvalidCredentialsError,
    InvalidTokenError,
    InvalidTransition,
    LimitExceededError,
    NotFoundError,
    RateLimitedError,
    ValidationError,
)
from lib import errors as lib_errors
from lib.errors import to_grpc_status


def test_authdomainerror_inherits_apperror():
    err = AuthDomainError("base")
    assert isinstance(err, lib_errors.AppError)


def test_notfound_translates_to_not_found():
    err = NotFoundError("missing")
    assert isinstance(err, lib_errors.NotFoundError)
    code, msg = to_grpc_status(err)
    assert code == grpc.StatusCode.NOT_FOUND


def test_conflict_translates_to_already_exists():
    err = ConflictError("dup")
    code, _ = to_grpc_status(err)
    assert code == grpc.StatusCode.ALREADY_EXISTS


def test_validation_translates_to_invalid_argument():
    err = ValidationError("bad input")
    code, _ = to_grpc_status(err)
    assert code == grpc.StatusCode.INVALID_ARGUMENT


def test_invalidcredentials_translates_to_unauthenticated():
    err = InvalidCredentialsError("wrong")
    code, _ = to_grpc_status(err)
    assert code == grpc.StatusCode.UNAUTHENTICATED


def test_forbidden_translates_to_permission_denied():
    err = ForbiddenError("denied")
    code, _ = to_grpc_status(err)
    assert code == grpc.StatusCode.PERMISSION_DENIED


def test_invalid_transition_translates_to_failed_precondition():
    err = InvalidTransition("bad state")
    code, _ = to_grpc_status(err)
    assert code == grpc.StatusCode.FAILED_PRECONDITION


def test_limit_exceeded_translates_to_failed_precondition():
    err = LimitExceededError("over cap")
    code, _ = to_grpc_status(err)
    assert code == grpc.StatusCode.FAILED_PRECONDITION


def test_invalid_token_no_peer_falls_back_to_internal():
    # InvalidTokenError has no lib.* peer; translator falls back to INTERNAL.
    # Routes layer manually aborts with UNAUTHENTICATED.
    err = InvalidTokenError("bad token")
    code, _ = to_grpc_status(err)
    assert code == grpc.StatusCode.INTERNAL  # documents fallback


def test_rate_limited_keeps_retry_after():
    err = RateLimitedError(30)
    assert err.retry_after == 30
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `cd src/admin && ../../.venv/bin/python -m pytest tests/test_errors_migration.py -v`
Expected: most cases FAIL (admin errors don't currently inherit `lib.errors.*`).

- [ ] **Step 1.3: Migrate `app/errors.py`**

```python
"""Admin domain errors. Inherit lib.errors.AppError so the central gRPC translator
maps them correctly; multi-inherit specific peers (NotFoundError, ConflictError, etc.)
so isinstance checks in lib.errors._STATUS_MAP hit. InvalidTokenError and
RateLimitedError have no lib peer — routes handle them manually.
"""

from lib import errors as lib_errors


class AuthDomainError(lib_errors.AppError):
    """Base for admin domain errors; the routes layer maps these to gRPC status codes."""


class ConflictError(AuthDomainError, lib_errors.ConflictError):
    """A unique constraint (e.g. email) was violated."""


class InvalidTokenError(AuthDomainError):
    """A token was malformed, expired, or of the wrong purpose/type.
    No lib.errors peer — routes manually abort with UNAUTHENTICATED.
    """


class InvalidCredentialsError(AuthDomainError, lib_errors.AuthError):
    """Login credentials did not match."""


class NotFoundError(AuthDomainError, lib_errors.NotFoundError):
    """A referenced entity does not exist."""


class RateLimitedError(AuthDomainError):
    """Too many attempts; retry after `retry_after` seconds.
    No lib peer (RESOURCE_EXHAUSTED not in the typed map). Routes manually abort.
    """

    def __init__(self, retry_after: int) -> None:
        super().__init__("Too many attempts")
        self.retry_after = retry_after


class ForbiddenError(AuthDomainError, lib_errors.PermissionError):
    """The caller is authenticated but not allowed to perform this action."""


class ValidationError(AuthDomainError, lib_errors.ValidationError):
    """Input failed a boundary validation check (size, type, format)."""


class InvalidTransition(AuthDomainError, lib_errors.BusinessRuleError):
    """An illegal application-state transition (funnel state machine)."""


class LimitExceededError(AuthDomainError, lib_errors.BusinessRuleError):
    """A per-caller resource cap was exceeded (e.g. max active job alerts)."""
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `cd src/admin && ../../.venv/bin/python -m pytest tests/test_errors_migration.py -v`
Expected: all 10 cases PASS.

- [ ] **Step 1.5: Full gate — verify no regression**

Run: `bash scripts/check.sh`
Expected: GATE PASSED. ALL existing admin tests must still pass — the migration is additive (subclasses retain the same isinstance behavior for AuthDomainError, plus new isinstance behavior for lib peer).

If any existing `except SomeAdminError` chain breaks due to MRO or constructor signature, fix it in the same commit.

- [ ] **Step 1.6: Commit**

```bash
git add src/admin/app/errors.py src/admin/tests/test_errors_migration.py
git commit -m "feat(admin): migrate AuthDomainError to inherit lib.errors.AppError"
```

- [ ] **Step 1.7: Simplify routes' `_STATUS` ladders (separate commit)**

For each routes file under `src/admin/app/routes/` that has a `_STATUS = {SomeError: grpc.StatusCode...}` dict for admin errors that NOW have a lib peer, replace the per-route translation with a call to `to_grpc_status()` from `lib.errors`, OR delete the ladder and let the central grpcweb translator handle it.

Keep manual handling for:
- `InvalidTokenError` → UNAUTHENTICATED (no lib peer; abort manually).
- `RateLimitedError` → RESOURCE_EXHAUSTED (no lib peer; abort manually with `retry_after` metadata).

Run gate after each routes file. Commit per file (CLAUDE.md "one commit per pattern category"):

```bash
git add src/admin/app/routes/<file>.py
git commit -m "refactor(admin): drop _STATUS dict in routes/<file>.py — central translator covers it"
```

If a routes file has ONLY `InvalidTokenError`/`RateLimitedError` in its `_STATUS`, leave it untouched.

- [ ] **Step 1.8: Full gate green after all routes cleanup**

Run: `bash scripts/check.sh`
Expected: GATE PASSED.

---

## Task 2 — `log_context` coverage Batch A: identity + settings (38 funcs across 6 files)

**Files:**
- Modify (one commit per file):
  - `src/admin/app/resources/auth.py` (12 funcs)
  - `src/admin/app/resources/settings.py` (11 funcs)
  - `src/admin/app/resources/team.py` (6 funcs)
  - `src/admin/app/resources/company_profile.py` (4 funcs)
  - `src/admin/app/resources/profile.py` (3 funcs)
  - `src/admin/app/resources/preferences.py` (2 funcs)
- Modify: `scripts/.log_coverage_allowlist.txt` (strip 38 lines)

**Interfaces:**
- Consumes: existing `lib.logging.log_context` + `bind_ids`.
- Produces: every public `async def` in these files wraps its body in `async with log_context(log, "resource.<file>.<func>", **bind_ids(...)):`.

**Pattern (apply to every public async def in each file):**

Before:
```python
async def register_company(email, password, *, users, tokens, notifier, nonces):
    # ... body ...
```

After:
```python
async def register_company(email, password, *, users, tokens, notifier, nonces):
    async with log_context(log, "resource.auth.register_company", **bind_ids()):
        # ... body ...
```

- The op-name format `resource.<filename>.<funcname>` is mandatory for grep-ability.
- `bind_ids()` binds the current correlation_id; pass extras when the function has natural ids: `bind_ids(user_id=user_id, comp_id=comp_id)`.
- Skip private functions (name starts with `_`) — the lint guard already skips them.

**Imports to add at top of each file:**
```python
from lib.logging import bind_ids, log_context  # plus existing get_logger
```

(Skip if already present.)

- [ ] **Step 2.1: Write the batch verification test**

Create `src/admin/tests/test_resource_log_coverage.py`:

```python
import io
import pytest
from loguru import logger
from lib.logging import log_context  # for sanity


@pytest.fixture
def loguru_sink():
    """Capture loguru output to a list."""
    records = []
    sink_id = logger.add(lambda m: records.append(m.record), level="DEBUG")
    try:
        yield records
    finally:
        logger.remove(sink_id)


@pytest.mark.asyncio
async def test_register_company_emits_op_start(loguru_sink, ...):
    # Trigger any auth resource that doesn't need extensive mocking.
    # Adapt to existing test fixtures in src/admin/tests/conftest.py.
    ...
    msgs = [r["message"] for r in loguru_sink]
    assert any("op.start: resource.auth.register_company" in m for m in msgs)
```

(Per-file: pick ONE function in the file and write a representative test. Don't write a test per function — too many. The `check_log_coverage.py` lint guard enforces 100% coverage.)

- [ ] **Step 2.2: For each file in Batch A:**

  - Add `from lib.logging import bind_ids, log_context` if missing.
  - For each public `async def` in the file, wrap body in `async with log_context(log, "resource.<file_stem>.<func>", **bind_ids(...)):`. Re-indent body.
  - Run `cd src/admin && ../../.venv/bin/python -m pytest -q tests/test_<file_stem>.py -v` — existing tests must pass.
  - Run `./.venv/bin/ruff format --check src/admin/app/resources/<file>.py && ./.venv/bin/ruff check src/admin/app/resources/<file>.py`.
  - Strip that file's lines from the allowlist:
    ```
    grep -v "src/admin/app/resources/<file>.py:" scripts/.log_coverage_allowlist.txt > x && mv x scripts/.log_coverage_allowlist.txt
    ```
  - Run `./.venv/bin/python scripts/check_log_coverage.py` → exit 0.
  - Run `bash scripts/check.sh` → GATE PASSED.
  - Commit:
    ```
    git add src/admin/app/resources/<file>.py scripts/.log_coverage_allowlist.txt
    git commit -m "feat(admin/<file_stem>): wrap N resource funcs with log_context"
    ```

  Order: `auth.py` (12) → `settings.py` (11) → `team.py` (6) → `company_profile.py` (4) → `profile.py` (3) → `preferences.py` (2).

- [ ] **Step 2.3: After Batch A complete, verify allowlist has shrunk by 38**

Run: `grep -v "^#" scripts/.log_coverage_allowlist.txt | grep -v "^$" | wc -l`
Expected: 104 - 38 = 66.

---

## Task 3 — `log_context` coverage Batch B: funnel/scheduling/compliance (28 funcs across 7 files)

**Files (one commit per, in order):**
- `src/admin/app/resources/scheduling.py` (8)
- `src/admin/app/resources/scheduler.py` (4)
- `src/admin/app/resources/compliance.py` (4)
- `src/admin/app/resources/application.py` (4)
- `src/admin/app/resources/report.py` (3)
- `src/admin/app/resources/decision.py` (2)
- `src/admin/app/resources/funnel.py` (1)
- Modify: `scripts/.log_coverage_allowlist.txt` (strip 26 lines)

Same workflow as Task 2. Op-name format: `resource.<file_stem>.<func>`.

- [ ] Per-file process per Task 2 Step 2.2.
- [ ] After Batch B complete, allowlist size = 66 - 26 = 40.

---

## Task 4 — `log_context` coverage Batch C: jobs/talent/messaging/everything-else (40 funcs across 15 files)

**Files (one commit per, in order — largest first):**
- `src/admin/app/resources/notification.py` (5)
- `src/admin/app/resources/job.py` (5)
- `src/admin/app/resources/rubric.py` (4)
- `src/admin/app/resources/messaging.py` (4)
- `src/admin/app/resources/saved_jobs.py` (3)
- `src/admin/app/resources/job_alerts.py` (3)
- `src/admin/app/resources/coding.py` (3)
- `src/admin/app/resources/analytics.py` (3)
- `src/admin/app/resources/recommendations.py` (2)
- `src/admin/app/resources/discovery.py` (2)
- `src/admin/app/resources/aptitude.py` (2)
- `src/admin/app/resources/talent.py` (1)
- `src/admin/app/resources/sourcing.py` (1)
- `src/admin/app/resources/recommend.py` (1)
- `src/admin/app/resources/integrity.py` (1)
- Modify: `scripts/.log_coverage_allowlist.txt` (strip 40 lines)

Same workflow.

- [ ] Per-file process per Task 2 Step 2.2.
- [ ] After Batch C complete, allowlist size = 40 - 40 = 0 (header comments only).

---

## Task 5 — Error logs in catch-and-reraise blocks (~25 sites)

**Files:**
- Modify: `src/mcp-data/app/tools.py` (~18 catch sites)
- Modify: `src/mcp-capability/app/tools.py` (2 catch sites in `embed()` + `kb_search()`)
- Modify: `src/ai-agents/app/infra/sessions.py` (3 catch sites — save/get/list_in_progress)
- Modify: `src/ai-agents/app/infra/mcp_capability.py:47`
- Modify: `src/ai-agents/app/routes/interview.py:156`, `chat.py:54,63`
- Test: `src/mcp-data/tests/test_error_logs.py` (new)

**Pattern:**

Before:
```python
try:
    async with span("mongo.save_profile", user_id=user_id):
        await with_timeout(...)
except Exception:
    _mongo_errors.labels(op=op).inc()
    raise
```

After:
```python
try:
    async with span("mongo.save_profile", user_id=user_id):
        await with_timeout(...)
except Exception:
    _mongo_errors.labels(op=op).inc()
    log.exception("mongo.{} failed for user_id={}", op, user_id)
    raise
```

The `log.exception(...)` adds the traceback to logs WITHOUT swallowing — `raise` is preserved. Use bound context (user_id, application_id, etc.) where available.

- [ ] **Step 5.1: Read each catch site and the surrounding context** (which ids are in scope).

- [ ] **Step 5.2: Write a representative failing test for mcp-data:**

```python
# src/mcp-data/tests/test_error_logs.py
import io
import pytest
from loguru import logger
from app.tools import DataStore


class _SinkRecorder:
    def __init__(self): self.records = []
    def __call__(self, m): self.records.append(m.record)


class _Failing:
    async def update_one(self, *a, **k): raise RuntimeError("synthetic")


@pytest.mark.asyncio
async def test_save_profile_logs_exception_before_reraise():
    sink = _SinkRecorder()
    sink_id = logger.add(sink, level="ERROR")
    try:
        store = DataStore({n: _Failing() for n in [
            "candidate_profiles", "jobs", "aptitude_banks", "interviews",
            "reports", "applications", "match_results", "job_question_plans",
            "proctoring_events", "practice_sessions",
        ]})
        with pytest.raises(RuntimeError, match="synthetic"):
            await store.save_profile("u1", {"name": "Alice"})
        error_records = [r for r in sink.records if r["level"].name == "ERROR"]
        assert error_records
        assert "save_profile" in error_records[-1]["message"]
        assert error_records[-1]["exception"] is not None  # traceback present
    finally:
        logger.remove(sink_id)
```

- [ ] **Step 5.3: Verify RED.**

- [ ] **Step 5.4: Apply the pattern at each site.** Use the existing local `op` variable when present; otherwise use a string literal matching the function name.

- [ ] **Step 5.5: Pre-commit gate + full gate + commit per file:**

```
./.venv/bin/ruff format --check <file> && ./.venv/bin/ruff check <file>
(cd src/<service> && ../../.venv/bin/python -m pytest -q)
bash scripts/check.sh
git add <file> [test file if applicable]
git commit -m "fix(<service>): log.exception before re-raise in N catch blocks"
```

---

## Task 6 — Presigned-URL silent failure + audit-log gap sweep + magic-number timeout removal

**Files:**
- Modify: `src/admin/app/resources/company_profile.py:68-69` — surface the error.
- Modify: audit-log gap sites (enumerate below).
- Modify: any remaining magic-number timeout in code (grep `asyncio.wait_for`, hardcoded `timeout=` literals in service code).
- Test: `src/admin/tests/test_presigned_url_failure.py` (new)

### 6a — Presigned-URL fix

The current behavior:
```python
try:
    return self._storage.presigned_get_url(key)
except Exception:
    return ""
```
swallows storage failures and returns an empty string (FE silently renders no logo).

Fix:
```python
try:
    return self._storage.presigned_get_url(key)
except Exception as exc:
    log.exception("company_profile: presigned URL generation failed for key={}", key)
    raise DependencyError("logo presign failed", context={"key": key}) from exc
```

The FE then sees a clear error (gRPC `UNAVAILABLE` via the translator) instead of an empty image.

Test:
```python
# src/admin/tests/test_presigned_url_failure.py
import pytest
from lib.errors import DependencyError


class _FailingStorage:
    def presigned_get_url(self, key):
        raise RuntimeError("S3 down")


@pytest.mark.asyncio
async def test_logo_presign_failure_raises_dependency_error():
    # adapt to existing CompanyProfileResource constructor in src/admin/tests/conftest.py
    ...
    with pytest.raises(DependencyError):
        await resource.get_company_profile(comp_id="c1", ...)
```

### 6b — Audit-log gap sweep

Enumerate sites by re-scanning the codebase for automated decisions / overrides / sensitive accesses that don't write to `audit_logs`. Pattern: any resource function that ends in a mutation (update/insert/delete) on a tenant-owned doc and does NOT call `audit_logs.insert(...)`.

Specifically check:
- Recruiter overrides (gate decisions, manual advances) — funnel.py, decision.py
- Compliance erasure cascade — compliance.py
- Settings changes (email, password, 2FA) — auth.py, settings.py
- Team admin actions (invite, remove, role change) — team.py
- Job publish/unpublish state changes — job.py

For each gap site, add:
```python
await self._audit.insert(
    AuditLog(
        entity="<entity>",
        entity_id=<id>,
        action="<action>",
        actor_user_id=<actor>,
        details={...},
    )
)
```

Use the existing AuditLog model. Write the audit-log call AFTER the durable mutation succeeds. Use `audit.write_audit` (Phase 0) if the resource has a repo handle.

### 6c — Magic-number timeout removal

Grep for hardcoded timeout literals in service code:
```
grep -rn "timeout=[0-9]\|asyncio.wait_for" src/ lib/ --include="*.py" | grep -v test | head -20
```

For each hit, replace the literal with a settings knob from `lib.timeouts.*` (or add a new knob to `lib/lib/config.py` if no existing one fits). Wrap with `with_timeout(..., op="...")`.

- [ ] **Step 6.1: Apply fixes in three separate commits (6a, 6b, 6c).**

- [ ] **Step 6.2: Full gate green** after each commit.

---

## Task 7 — Phase 2 HANDOFF doc + memory pointer

**Files:**
- Create: `docs/superpowers/plans/2026-06-21-robustness-phase-2-handoff.md`
- Modify: `~/.claude/projects/-Users-rugwedpatharkar-Projects-Project/memory/MEMORY.md` (append)
- Create: `~/.claude/projects/-Users-rugwedpatharkar-Projects-Project/memory/robustness-phase-2.md`

- [ ] **Step 7.1: Write the HANDOFF doc.** Template:

```markdown
# Robustness Phase 2 — HANDOFF (2026-06-21)

Phase 2 closed: every admin resource function emits structured op-logs;
AuthDomainError flows through the central translator; catch-and-reraise
blocks now log before re-raise; presigned-URL failure is no longer silent;
audit-log gaps closed; magic-number timeouts replaced with settings knobs.

Branch: main · Base: <P1 HEAD> · HEAD: <P2 HEAD>
Gate: bash scripts/check.sh exit 0.

## Shipped
- AuthDomainError → AppError migration (commit X)
- 104 admin resource funcs wrapped in log_context across 28 files
- 25 catch-and-reraise blocks now log before re-raise
- company_profile.py presigned URL surfaces DependencyError instead of ""
- Audit-log gaps closed (list sites)
- All magic-number timeouts moved to lib/lib/config.py knobs

## Verification
- bash scripts/check.sh — GATE PASSED
- scripts/.log_coverage_allowlist.txt: empty (header-only)

## What Phase 3 consumes
- Every admin resource is observable end-to-end (start/done/error with duration_ms).
- Phase 3 (FE robustness sweep) can rely on backend NEVER swallowing errors silently.
```

- [ ] **Step 7.2: Create memory file `robustness-phase-2.md`.**

- [ ] **Step 7.3: Append pointer to MEMORY.md.**

- [ ] **Step 7.4: Commit the HANDOFF doc only.**

```
git add docs/superpowers/plans/2026-06-21-robustness-phase-2-handoff.md
git commit -m "docs(robustness-phase-2): HANDOFF — phase 2 close + verification"
```

---

## Self-review

**1. Spec coverage:**
- §3 Phase 2 resource-layer op-logging (~104 funcs) → Tasks 2, 3, 4 ✓
- §3 Phase 2 central translator replacing _STATUS dicts → Task 1 ✓
- §3 Phase 2 catch-and-reraise error logs (~25 sites) → Task 5 ✓
- §3 Phase 2 presigned-URL silent failure → Task 6a ✓
- §3 Phase 2 audit-log gap sweep → Task 6b ✓
- §3 Phase 2 magic-number timeout removal → Task 6c ✓
- HANDOFF + memory → Task 7 ✓

**2. Placeholder scan:**
- Task 5 + 6a + 6b test stubs use `...` to indicate "adapt to existing test fixtures in conftest.py" — this is operational latitude (each test suite has its own fixture pattern), not a placeholder for me to fill.
- Task 6b enumerates the WHERE TO LOOK for audit gaps rather than the exact sites. The implementer scans the codebase fresh — Phase 0 found gaps but didn't pin all sites, and resources may have evolved.

**3. Type / signature consistency:**
- `log_context(log, "op.name", **bind_ids(...))` matches Phase 0 signature ✓
- `with_timeout(coro, timeouts.<class>(), op="...")` matches Phase 0/1 ✓
- `DependencyError(public_message, *, context)` matches Phase 0 ✓
- `to_grpc_status(err) -> (StatusCode, str)` matches Phase 0 ✓

**4. Gate impact:**
- `scripts/check_log_coverage.py` shrinks deterministically file-by-file ✓
- Pre-commit gate (ruff format + ruff check + pytest) called out in every task ✓
- Full gate (`bash scripts/check.sh`) called out after every commit ✓

No issues found. Plan ready.

---

## What this plan does NOT cover (deferred to Phase 3+)

- Frontend robustness work — Phase 3.
- Missing-RPC wirings (decisions.hold/reject, IntegrityTimeline, cursor pagination) — Phase 4.
- Observability platform (ObservabilityService, FE SDK, funnel events) — Phase 5.
- Messaging SSE, voice-worker graceful shutdown, chaos verification — Phase 6.

Next plan to write: `docs/superpowers/plans/2026-06-21-robustness-phase-3-frontend-sweep.md` (after Phase 2 closes).
