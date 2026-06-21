# Robustness Phase 4 — Missing-RPC Wirings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the FE↔BE gaps the Phase 0 audit identified — ship `decisions.holdApplication` + `decisions.rejectApplication` end-to-end (currently FE-only toast fakes), wire the FE applicant page to the existing live `reports.getIntegrityTimeline` RPC (currently a cast-seam mock), add server-side cursor pagination to `listApplicants`, `getCandidateRecommendations`, and `talent.getTalentPool` so a job with 5000 applicants doesn't force a full-list fetch, and introduce a shared `mark_read.mark_thread_read` backend resource so the `messaging.markRead` + `notification.markRead` paths can't desync. Result: zero FE feature fakes, predictable pagination at scale, and one source of truth for unread-count mutations.

**Architecture:** All work in `src/admin/app/routes/pb/*.proto` + `src/admin/app/resources/` + `src/admin/app/routes/` + `frontend/` consume sites. Proto changes regenerate the gRPC stubs (`pnpm gen` for FE, `protoc` for BE). Each new RPC follows the established pattern: proto definition → resource (logic) → route (thin RPC translation) → audit-log write → FE wiring. The hold/reject pair extends the existing `DecisionService` (which already has `OverrideGate`); IntegrityTimeline is FE-only (BE already shipped at `src/admin/app/routes/report.py:164` + `src/admin/app/resources/integrity.py:33`). Cursor pagination uses opaque base64-encoded Mongo `_id` cursors — stateless, no offset-based scan.

**Tech Stack:** Python 3.12, grpcio, pymongo, pydantic; TypeScript 5.x with `@connectrpc/connect`. Verification: `bash scripts/check.sh` for BE; `pnpm -r typecheck` + `pnpm --filter @ip/<app> build` for FE.

## Global Constraints

- Spec source: `docs/superpowers/specs/2026-06-21-platform-robustness-and-observability-design.md` (§3 Phase 4 + §3.1 RPC contracts).
- Behavior preservation: do NOT change existing RPC contracts. ALL Phase 4 work is additive (new RPCs, new request fields with defaults, new pagination params with safe defaults).
- TDD mandatory: failing test → watched fail → minimal implementation → green → commit.
- Per-task commit on `main`; never change branch; stage explicit paths only.
- Working directory for every command: `/Users/rugwedpatharkar/Projects/Project`.
- pnpm pinned at `9.15.0`.
- Pre-commit gate per touched-file: `ruff format --check` + `ruff check` + the relevant pytest suite (BE) OR `pnpm typecheck` + `pnpm build` (FE) — all exit 0 BEFORE commit. Full `bash scripts/check.sh` exit 0 after every BE commit.
- No new `except: pass`, no nested `try/except`, no magic-number timeouts (Phase 0+1 conventions).
- Every new RPC writes an `AuditLog` row when it mutates state (Phase 2 conventions).
- Every new RPC's resource wraps its body in `async with log_context(log, "resource.<file>.<func>", **bind_ids(...)):` (Phase 2 conventions).
- gRPC stub regeneration:
  - **BE Python stubs:** `cd src/admin && python -m grpc_tools.protoc -I app/routes/pb --python_out=app/routes/pb --grpc_python_out=app/routes/pb app/routes/pb/<file>.proto` (or whatever the existing `scripts/gen-proto.sh` does — check first).
  - **FE TS stubs:** `cd frontend && npx pnpm@9.15.0 --filter @ip/api-client gen` (per the existing pattern in CLAUDE.md and prior commits like `feat(jobAlerts): flip jobAlerts to live gRPC JobAlertsService`).
- The pre-existing macOS `os.killpg` flake in `lib/tests/test_execution.py` — re-run gate if it fires.

## Pre-Phase Audit Findings

| Item | Current state | Action |
|---|---|---|
| `reports.getIntegrityTimeline` | **BE already exists** (`integrity.py:33`, `routes/report.py:164`) | FE-only: replace cast-seam mock in `apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:131-136` with live RPC call |
| `decisions.holdApplication` / `decisions.rejectApplication` | Backend MISSING. FE has UI-only toasts at `apps/.../applicants/[appId]/page.tsx:180-195` ("hold/reject are best-effort: the real decision RPC may be added later") | Full E2E build: proto + resource + route + audit + FE wiring |
| `listApplicants` cursor pagination | Current: `list_applicants(identity, job_id, *, applications)` — no page params. FE fetches full list. | Add `page_size` + `page_token` (opaque base64 Mongo `_id` cursor). Cap `page_size` at 200. |
| `getCandidateRecommendations` cursor pagination | Current: `get_candidate_recommendations(identity, *, matches)` — no params | Same pattern |
| `talent.getTalentPool` cursor pagination | Current: `get_talent_pool(identity, *, applications)` — no params | Same pattern |
| `listNotifications` cursor pagination | Already paginated (skip/limit at `notification.py:42`). | DEFERRED — skip/limit is functionally fine for inbox; cursor migration is a Phase 6 polish item (behavior-preserving but no clear scaling win for this collection). |
| `messaging.mark_read` + `notification.mark_read` unification | Separately implemented in `messaging.py:244` and `notification.py:68`. Audit cited risk of desync from concurrent mutations. | New shared backend resource `mark_read.mark_thread_read(comp_id, user_id, kind, id, seq_no)` that both delegate to; server enforces monotonic `seq_no`. |

## File Structure (lock-in)

**Modified protos:**
- `src/admin/app/routes/pb/decision.proto` — add `HoldApplicationRequest`/`Response` + `RejectApplicationRequest`/`Response` + 2 RPCs on `DecisionService`.
- `src/admin/app/routes/pb/application.proto` — extend `ListApplicantsRequest` with `page_size` + `page_token`; extend `ListApplicantsResponse` with `next_page_token` + `total_count`.
- `src/admin/app/routes/pb/recommendation.proto` — extend `GetCandidateRecommendationsRequest` with page params + response with `next_page_token`.
- `src/admin/app/routes/pb/talent.proto` — extend `GetTalentPoolRequest` with page params + response with `next_page_token`.
- `src/admin/app/routes/pb/messaging.proto` — `MarkReadRequest` gains optional `seq_no` (defaults 0 = server picks); `MarkReadResponse` returns `accepted_seq_no`.
- `src/admin/app/routes/pb/notification.proto` — same shape extension to `MarkReadRequest`/`Response`.

**Generated stubs (regenerate, don't hand-edit):**
- `src/admin/app/routes/pb/*_pb2.py`, `*_pb2_grpc.py`
- `frontend/packages/api-client/src/gen/*_pb.ts`

**Modified Python resources:**
- `src/admin/app/resources/decision.py` — add `hold_application(identity, application_id, reason_code, free_text, *, applications, audit, notifier=None)` + `reject_application(...)`. Both idempotent on `(application_id, target_state)`. Both write AuditLog + publish event for candidate notification.
- `src/admin/app/resources/application.py` — refactor `list_applicants` to accept `page_size` + `page_token`, return `(applicants, next_page_token, total_count)`.
- `src/admin/app/resources/recommendations.py` — same pattern on `get_candidate_recommendations`.
- `src/admin/app/resources/talent.py` — same pattern on `get_talent_pool`.
- Create: `src/admin/app/resources/mark_read.py` — shared `mark_thread_read(comp_id, user_id, kind, id, seq_no, *, store)` that enforces monotonic `seq_no` per `(user_id, kind, id)`.
- `src/admin/app/resources/messaging.py` — `mark_read` delegates to `mark_read.mark_thread_read(..., kind="thread", ...)`.
- `src/admin/app/resources/notification.py` — `mark_read` delegates to `mark_read.mark_thread_read(..., kind="notification", ...)`.

**Modified Python routes:**
- `src/admin/app/routes/decision.py` — add 2 servicer methods.
- `src/admin/app/routes/application.py` — pass page params through; convert next_page_token.
- `src/admin/app/routes/recommendation.py` — same.
- `src/admin/app/routes/talent.py` — same.
- `src/admin/app/routes/messaging.py` + `notification.py` — pass seq_no through.

**Modified FE pages:**
- `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx` — wire `decisions.holdApplication`/`rejectApplication` (replace UI-only toasts at lines 180-195); replace `IntegrityTimeline` cast-seam mock with live `reports.getIntegrityTimeline` RPC.
- FE pages consuming `listApplicants` — adopt cursor pagination (use Tanstack Query's `useInfiniteQuery` or load-more pattern).
- FE pages consuming `getCandidateRecommendations`/`getTalentPool` — same.

**New cursor helper (shared):**
- `lib/lib/cursors.py` — `encode_cursor(doc_id)` and `decode_cursor(token)` for opaque base64 Mongo `_id` cursors. Returns `(ObjectId | None, valid: bool)`. Phase 6 may move this to `lib.mongodb.cursors` for reuse.

**New tests:**
- `src/admin/tests/test_decision_hold_reject.py` — unit tests for hold/reject (state precondition, idempotency, audit-log write).
- `src/admin/tests/test_pagination.py` — unit tests for the cursor encode/decode + pagination edge cases (empty, single-page, multi-page, invalid cursor).
- `src/admin/tests/test_mark_read_unified.py` — unit tests for `mark_thread_read` (monotonic seq_no, concurrent calls).
- `lib/tests/test_cursors.py` — encode/decode round-trip + invalid input.
- FE: existing Playwright/component tests where they exist; otherwise new Vitest cases for the wired RPC paths.

---

## Task 1 — `lib.cursors` opaque cursor helper

**Files:**
- Create: `lib/lib/cursors.py`
- Create: `lib/tests/test_cursors.py`

**Interfaces:**
- Produces: `encode_cursor(doc_id: ObjectId | str) -> str` (opaque base64 token). `decode_cursor(token: str | None) -> ObjectId | None` (None = first page; invalid token raises `lib.errors.ValidationError`).

- [ ] **Step 1.1: Write the failing test** `lib/tests/test_cursors.py`:

```python
import pytest
from bson import ObjectId

from lib.cursors import decode_cursor, encode_cursor
from lib.errors import ValidationError


def test_encode_decode_roundtrip():
    oid = ObjectId()
    token = encode_cursor(oid)
    assert isinstance(token, str)
    assert decode_cursor(token) == oid


def test_decode_none_means_first_page():
    assert decode_cursor(None) is None
    assert decode_cursor("") is None


def test_decode_invalid_token_raises_validation_error():
    with pytest.raises(ValidationError):
        decode_cursor("not-base64!@#")


def test_decode_valid_base64_but_not_objectid_raises():
    import base64
    bogus = base64.urlsafe_b64encode(b"too-short").decode()
    with pytest.raises(ValidationError):
        decode_cursor(bogus)


def test_encode_accepts_string_oid():
    oid_str = str(ObjectId())
    token = encode_cursor(oid_str)
    assert decode_cursor(token) == ObjectId(oid_str)
```

- [ ] **Step 1.2: Verify RED.**

```
cd lib && ../.venv/bin/python -m pytest tests/test_cursors.py -v
```

- [ ] **Step 1.3: Write minimal implementation** `lib/lib/cursors.py`:

```python
"""Opaque pagination cursors for Mongo collections.

Encoded as urlsafe-base64 of the ObjectId's 12-byte binary. Stateless: the server
never stores cursor state, the client just rounds-trips the token. ``decode_cursor``
raises ValidationError on invalid input so the boundary translator returns
``INVALID_ARGUMENT`` rather than letting a malformed token surface as INTERNAL.
"""

import base64

from bson import ObjectId
from bson.errors import InvalidId

from lib.errors import ValidationError


def encode_cursor(doc_id) -> str:
    """Encode a Mongo ObjectId (or its string form) as an opaque base64 token."""
    if isinstance(doc_id, str):
        doc_id = ObjectId(doc_id)
    return base64.urlsafe_b64encode(doc_id.binary).decode("ascii")


def decode_cursor(token):
    """Decode an opaque pagination token back to an ObjectId, or None if empty.

    Returns ``None`` for empty/None token (caller treats as first page).
    Raises ``ValidationError`` for malformed input.
    """
    if not token:
        return None
    try:
        raw = base64.urlsafe_b64decode(token.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise ValidationError("invalid page_token") from exc
    try:
        return ObjectId(raw)
    except (InvalidId, ValueError) as exc:
        raise ValidationError("invalid page_token") from exc
```

- [ ] **Step 1.4: Verify GREEN + ruff:**

```
./.venv/bin/ruff format --check lib/lib/cursors.py lib/tests/test_cursors.py
./.venv/bin/ruff check lib/lib/cursors.py lib/tests/test_cursors.py
cd lib && ../.venv/bin/python -m pytest tests/test_cursors.py -v
bash scripts/check.sh
```

All exit 0.

- [ ] **Step 1.5: Commit:**

```
git add lib/lib/cursors.py lib/tests/test_cursors.py
git commit -m "feat(lib): opaque base64 ObjectId cursor for Mongo pagination"
```

---

## Task 2 — `decisions.holdApplication` + `decisions.rejectApplication` BE end-to-end

**Files:**
- Modify: `src/admin/app/routes/pb/decision.proto`
- Regenerate: `src/admin/app/routes/pb/decision_pb2.py`, `decision_pb2_grpc.py`
- Modify: `src/admin/app/resources/decision.py`
- Modify: `src/admin/app/routes/decision.py`
- Create: `src/admin/tests/test_decision_hold_reject.py`

### Step 2.1: Extend `decision.proto`

Read the existing file; add:

```proto
message HoldApplicationRequest {
  string application_id = 1;
  string reason_code = 2;
  string free_text = 3;  // optional
}

message HoldApplicationResponse {
  string application_id = 1;
  string new_state = 2;
  int64 audited_at_ms = 3;
}

message RejectApplicationRequest {
  string application_id = 1;
  string reason_code = 2;
  string free_text = 3;
}

message RejectApplicationResponse {
  string application_id = 1;
  string new_state = 2;
  int64 audited_at_ms = 3;
}

service DecisionService {
  // ... existing RPCs
  rpc HoldApplication(HoldApplicationRequest) returns (HoldApplicationResponse);
  rpc RejectApplication(RejectApplicationRequest) returns (RejectApplicationResponse);
}
```

### Step 2.2: Regenerate stubs

Look at `scripts/` for a proto-gen script. If not present, run:

```
cd src/admin && python -m grpc_tools.protoc -I app/routes/pb \
  --python_out=app/routes/pb --grpc_python_out=app/routes/pb \
  app/routes/pb/decision.proto
```

(Match the exact command in any existing `scripts/gen-proto.sh` or similar.)

### Step 2.3: TDD — write failing tests first

`src/admin/tests/test_decision_hold_reject.py`:

```python
import pytest

from app.errors import BusinessRuleError, ForbiddenError, NotFoundError, ValidationError
from app.resources import decision


@pytest.mark.asyncio
async def test_hold_application_advances_state_and_audits(fake_apps, fake_audit, identity_manager):
    app_id = await fake_apps.insert_with_state(state="scored", comp_id=identity_manager["comp_id"])
    result = await decision.hold_application(
        identity_manager, app_id, "needs_more_data", "want a second interview",
        applications=fake_apps, audit=fake_audit,
    )
    assert result["new_state"] == "on_hold"
    assert any(row["action"] == "application.hold" for row in fake_audit.rows)
    state = await fake_apps.get_state(app_id)
    assert state == "on_hold"


@pytest.mark.asyncio
async def test_hold_application_is_idempotent(fake_apps, fake_audit, identity_manager):
    app_id = await fake_apps.insert_with_state(state="on_hold", comp_id=identity_manager["comp_id"])
    result = await decision.hold_application(
        identity_manager, app_id, "needs_more_data", "",
        applications=fake_apps, audit=fake_audit,
    )
    assert result["new_state"] == "on_hold"
    # Idempotent re-call writes NO new audit row.
    pre = len(fake_audit.rows)
    await decision.hold_application(
        identity_manager, app_id, "needs_more_data", "",
        applications=fake_apps, audit=fake_audit,
    )
    assert len(fake_audit.rows) == pre


@pytest.mark.asyncio
async def test_hold_application_rejects_terminal_states(fake_apps, fake_audit, identity_manager):
    app_id = await fake_apps.insert_with_state(state="rejected", comp_id=identity_manager["comp_id"])
    with pytest.raises(BusinessRuleError):
        await decision.hold_application(
            identity_manager, app_id, "x", "",
            applications=fake_apps, audit=fake_audit,
        )


@pytest.mark.asyncio
async def test_reject_application_advances_state(fake_apps, fake_audit, identity_manager):
    app_id = await fake_apps.insert_with_state(state="scored", comp_id=identity_manager["comp_id"])
    result = await decision.reject_application(
        identity_manager, app_id, "not_a_fit", "",
        applications=fake_apps, audit=fake_audit,
    )
    assert result["new_state"] == "rejected"


@pytest.mark.asyncio
async def test_non_recruiter_forbidden(fake_apps, fake_audit, identity_candidate):
    app_id = await fake_apps.insert_with_state(state="scored", comp_id="any")
    with pytest.raises(ForbiddenError):
        await decision.hold_application(
            identity_candidate, app_id, "x", "",
            applications=fake_apps, audit=fake_audit,
        )


@pytest.mark.asyncio
async def test_cross_tenant_returns_not_found(fake_apps, fake_audit, identity_manager):
    app_id = await fake_apps.insert_with_state(state="scored", comp_id="other_comp")
    with pytest.raises(NotFoundError):
        await decision.hold_application(
            identity_manager, app_id, "x", "",
            applications=fake_apps, audit=fake_audit,
        )
```

Adapt fixtures to whatever `src/admin/tests/conftest.py` provides. If `fake_apps.insert_with_state` doesn't exist, write the simplest fake that lets the tests pass.

### Step 2.4: Verify RED.

```
cd src/admin && ../../.venv/bin/python -m pytest tests/test_decision_hold_reject.py -v
```

### Step 2.5: Implement in `src/admin/app/resources/decision.py`

```python
_HOLD_STATE = "on_hold"
_REJECT_STATE = "rejected"
_TERMINAL_STATES = {"hired", "rejected", "withdrawn", "expired", "abandoned"}


async def hold_application(
    identity, application_id, reason_code, free_text, *, applications, audit, notifier=None
):
    async with log_context(
        log,
        "resource.decision.hold_application",
        **bind_ids(
            user_id=identity["id"],
            comp_id=identity["comp_id"],
            application_id=application_id,
        ),
    ):
        _require_manager(identity)
        if not reason_code:
            raise ValidationError("reason_code is required")
        application = await _scoped(identity, application_id, applications)
        current = application["state"]
        if current == _HOLD_STATE:
            return _decision_response(application_id, _HOLD_STATE, application.get("audited_at"))
        if current in _TERMINAL_STATES:
            raise BusinessRuleError(f"cannot hold from terminal state {current!r}")
        await applications.set_state_if(application_id, current, _HOLD_STATE)
        await audit.insert(
            AuditLog(
                entity="application",
                entity_id=application_id,
                action="application.hold",
                comp_id=application.get("comp_id"),
                from_state=current,
                to_state=_HOLD_STATE,
                details={"reason_code": reason_code, "free_text": free_text or ""},
            )
        )
        # Best-effort candidate notification (BE-#10 pattern).
        if notifier is not None:
            try:
                await notifier.notify(application, _HOLD_STATE, "application.hold")
            except Exception:
                log.exception("decision.hold: notify failed for {}", application_id)
        return _decision_response(application_id, _HOLD_STATE, audited_at_ms_now())


async def reject_application(
    identity, application_id, reason_code, free_text, *, applications, audit, notifier=None
):
    # Symmetric implementation; same idempotency + terminal-state guard + audit + notify.
    # ... (mirror hold_application with _REJECT_STATE)
```

(Implementer fills in the symmetric reject version and the helpers `_decision_response`, `audited_at_ms_now()`. Use `time.time() * 1000` for the audit timestamp.)

### Step 2.6: Wire the servicer in `src/admin/app/routes/decision.py`

Add 2 thin RPC methods that call into the resource and translate exceptions via the central translator (Phase 0).

### Step 2.7: Verify GREEN + ruff + full gate

```
./.venv/bin/ruff format --check src/admin/app/resources/decision.py src/admin/app/routes/decision.py src/admin/tests/test_decision_hold_reject.py
./.venv/bin/ruff check src/admin/app/resources/decision.py src/admin/app/routes/decision.py src/admin/tests/test_decision_hold_reject.py
cd src/admin && ../../.venv/bin/python -m pytest -q
bash scripts/check.sh
```

### Step 2.8: Commit (one commit per logical unit)

```
git add src/admin/app/routes/pb/decision.proto src/admin/app/routes/pb/decision_pb2.py src/admin/app/routes/pb/decision_pb2_grpc.py
git commit -m "feat(admin/decision.proto): add HoldApplication + RejectApplication RPCs"

git add src/admin/app/resources/decision.py src/admin/tests/test_decision_hold_reject.py
git commit -m "feat(admin/decision): hold_application + reject_application with audit"

git add src/admin/app/routes/decision.py
git commit -m "feat(admin/routes/decision): wire HoldApplication + RejectApplication servicer"
```

---

## Task 3 — `listApplicants` cursor pagination

**Files:**
- Modify: `src/admin/app/routes/pb/application.proto`
- Regenerate: stubs
- Modify: `src/admin/app/infra/repositories/applications.py` — add `list_applicants_paginated(comp_id, job_id, page_size, after_id) -> (rows, next_after_id, total)`
- Modify: `src/admin/app/resources/application.py` — refactor `list_applicants`
- Modify: `src/admin/app/routes/application.py` — pass-through
- Create: `src/admin/tests/test_pagination.py`

### Workflow

- [ ] Extend proto: `ListApplicantsRequest` gains `int32 page_size = 2;` + `string page_token = 3;`. `ListApplicantsResponse` gains `string next_page_token = 2;` + `int64 total_count = 3;`.
- [ ] Regenerate stubs.
- [ ] Add repository method `list_applicants_paginated` that queries `find({comp_id, job_id, _id: { $gt: after_id }}).sort(_id).limit(page_size + 1)` — the `+1` is the cheap "is there a next page" trick. If results > page_size, the (page_size+1)-th doc's `_id` becomes the next cursor; trim back to page_size for the response.
- [ ] `total_count` returned only on first page (`page_token == ""`); use `estimated_document_count` to avoid full scan.
- [ ] `page_size` clamped server-side to `[1, 200]`.
- [ ] Resource calls `decode_cursor(page_token)` → `ObjectId | None`, then encodes the next cursor.
- [ ] Tests cover: empty (total=0, next_page_token=""), single-page (total>0, next_page_token=""), multi-page (next_page_token != ""), `page_size > 200` clamps, invalid cursor → INVALID_ARGUMENT.
- [ ] Commit:
```
git add src/admin/app/routes/pb/application.proto <generated stubs>
git commit -m "feat(admin/application.proto): cursor pagination for ListApplicants"

git add src/admin/app/infra/repositories/applications.py src/admin/app/resources/application.py src/admin/app/routes/application.py src/admin/tests/test_pagination.py
git commit -m "feat(admin/application): cursor pagination on list_applicants"
```

---

## Task 4 — `getCandidateRecommendations` + `getTalentPool` cursor pagination

Same workflow as Task 3, replicated across the two RPCs. One commit per RPC:

- [ ] `recommendation.proto` extension + regen + `recommendations.py` refactor + tests.
- [ ] Commit: `feat(admin/recommendation): cursor pagination on get_candidate_recommendations`
- [ ] `talent.proto` extension + regen + `talent.py` refactor + tests.
- [ ] Commit: `feat(admin/talent): cursor pagination on get_talent_pool`

---

## Task 5 — Unified `mark_read` shared resource

**Files:**
- Modify: `src/admin/app/routes/pb/messaging.proto` + `notification.proto` — add optional `int64 seq_no = ...` to both `MarkReadRequest`; return `accepted_seq_no` on `MarkReadResponse`.
- Regenerate stubs.
- Create: `src/admin/app/resources/mark_read.py` with `mark_thread_read(comp_id, user_id, kind, id, seq_no, *, store) -> int`. Server-side monotonic seq_no enforcement: if the request's `seq_no` is less than the stored seq_no for `(user_id, kind, id)`, the call is a no-op (returns the existing higher seq_no); otherwise update + return the new seq_no.
- Modify: `src/admin/app/resources/messaging.py` — `mark_read` delegates to `mark_thread_read(..., kind="thread", ...)`.
- Modify: `src/admin/app/resources/notification.py` — `mark_read` delegates to `mark_thread_read(..., kind="notification", ...)`.
- Modify: `src/admin/app/infra/repositories/messaging.py` (or wherever the read-state store lives) — add `get_seq_no(comp_id, user_id, kind, id) -> int | None` and `set_seq_no_if_greater(comp_id, user_id, kind, id, new_seq) -> int` (CAS on the existing seq_no).
- Create: `src/admin/tests/test_mark_read_unified.py` — concurrent calls with monotonic seq_no, idempotency.

### Workflow

- [ ] TDD on `test_mark_read_unified.py` first. Tests:
  - Two concurrent calls with `seq_no=5` and `seq_no=3` result in stored=5.
  - Re-call with `seq_no=5` is idempotent (no audit storm).
  - Re-call with `seq_no=10` updates stored to 10.
  - Negative/zero seq_no rejected with ValidationError.
- [ ] Implement `mark_read.py` + repository CAS.
- [ ] Update `messaging.py` + `notification.py` to delegate.
- [ ] Existing `test_messaging.py` + `test_notification.py` should still pass — the seq_no field is optional with default 0 (server picks current+1).
- [ ] Commit:
```
git add src/admin/app/routes/pb/messaging.proto src/admin/app/routes/pb/notification.proto <generated stubs>
git commit -m "feat(admin/proto): seq_no on messaging.MarkRead + notification.MarkRead"

git add src/admin/app/resources/mark_read.py src/admin/tests/test_mark_read_unified.py src/admin/app/infra/repositories/messaging.py
git commit -m "feat(admin): shared mark_thread_read resource with monotonic seq_no"

git add src/admin/app/resources/messaging.py src/admin/app/resources/notification.py
git commit -m "refactor(admin): route messaging+notification mark_read through shared resource"
```

---

## Task 6 — FE: regenerate stubs + wire hold/reject + replace IntegrityTimeline mock + adopt cursor pagination

**Files:**
- Run: `cd frontend && npx pnpm@9.15.0 --filter @ip/api-client gen` to regenerate the TS stubs from all the protos touched in Tasks 2-5.
- Modify: `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx` — replace the lines 180-195 toast fakes with live `decisions.holdApplication` / `decisions.rejectApplication` calls; replace IntegrityTimeline cast-seam mock (lines 131-136) with a `useQuery` calling `reports.getIntegrityTimeline`.
- Modify: FE pages consuming `listApplicants` (candidate `/applications/...` ? — check), `getCandidateRecommendations`, `getTalentPool` — adopt cursor pagination (Tanstack Query `useInfiniteQuery` or load-more pattern).
- Modify: FE pages consuming `messaging.markRead` / `notification.markRead` — pass the current local `seq_no` (a counter incremented per local mark-read action) to prevent concurrent-mutation desync.

### Workflow

- [ ] Regenerate stubs:
```
cd frontend && npx pnpm@9.15.0 --filter @ip/api-client gen
```
- [ ] Verify the regen touched the expected files only. Commit per logical FE area (don't lump all FE changes into one mega-commit).
- [ ] **Commit 1** — proto regen:
```
git add frontend/packages/api-client/src/gen/
git commit -m "chore(api-client): regenerate stubs for Phase 4 protos"
```
- [ ] **Commit 2** — Wire hold/reject:
```
# edit apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate typecheck
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate build
git add frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx
git commit -m "feat(company/applicants): wire decisions.holdApplication + rejectApplication"
```
- [ ] **Commit 3** — IntegrityTimeline live wiring (replaces cast-seam mock):
```
git add frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx
git commit -m "feat(company/applicants): wire reports.getIntegrityTimeline live RPC"
```
- [ ] **Commit 4** — Cursor pagination on consuming pages:
```
# Edit the FE pages that consume listApplicants / recommendations / talent
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate typecheck
cd frontend && npx pnpm@9.15.0 --filter @ip/candidate build
git add <touched FE files>
git commit -m "feat(fe): adopt cursor pagination for listApplicants/recommendations/talent"
```
- [ ] **Commit 5** — Unified mark-read seq_no wiring (if any FE change needed — may be transparent):
```
git add <touched FE files>
git commit -m "feat(fe): pass seq_no to messaging.markRead + notification.markRead"
```

---

## Task 7 — Phase 4 HANDOFF doc + memory pointer

**Files:**
- Create: `docs/superpowers/plans/2026-06-21-robustness-phase-4-handoff.md`
- Append ONE LINE to `~/.claude/projects/-Users-rugwedpatharkar-Projects-Project/memory/MEMORY.md` (NOT overwrite — that's the index)
- Create: `~/.claude/projects/-Users-rugwedpatharkar-Projects-Project/memory/robustness-phase-4.md`

Same shape as the Phase 0/1/2/3 HANDOFFs. Lists commits, shipped RPCs, behavior delta (new gRPC codes a client can see), and what Phase 5 consumes.

Commit:
```
git add docs/superpowers/plans/2026-06-21-robustness-phase-4-handoff.md
git commit -m "docs(robustness-phase-4): HANDOFF — phase 4 close + behavior delta"
```

---

## Self-review

**1. Spec coverage:**
- §3.1 Phase 4 hold/reject RPCs → Tasks 2 + 6 ✓
- §3.1 IntegrityTimeline (BE already exists) → Task 6 (FE-only) ✓
- §3.1 cursor pagination (listApplicants / recommendations / talent) → Tasks 3 + 4 + 6 ✓
- §3.1 unified mark-read → Task 5 + 6 ✓
- listNotifications cursor pagination → DEFERRED with rationale (skip/limit functionally fine for inbox; no scaling win). Documented in Pre-Phase findings.
- HANDOFF + memory → Task 7 ✓

**2. Placeholder scan:**
- Step 2.5 has `# ... (mirror hold_application with _REJECT_STATE)` — operational latitude; the implementer mirrors the hold pattern. Acceptable.
- Step 5 test count is "concurrent calls" — pseudocode; the implementer writes the actual asyncio-based concurrent test.

**3. Type / signature consistency:**
- `encode_cursor(doc_id) → str`, `decode_cursor(token) → ObjectId | None` — consistent across Tasks 1, 3, 4 ✓
- `mark_thread_read(comp_id, user_id, kind, id, seq_no, *, store) → int` — consistent across Tasks 5 ✓
- AuditLog signature: matches existing pattern from Phase 2 ✓
- `_decision_response` helper not yet defined; implementer writes a 3-line helper returning the response dict ✓

**4. Gate impact:**
- Each task explicitly runs `bash scripts/check.sh` (BE) or `pnpm typecheck + build` (FE) before commit ✓
- Pre-commit gate (ruff + pytest) called out in every task ✓
- Pre-existing macOS killpg flake handled by re-run guidance ✓

No issues. Plan ready.

---

## What this plan does NOT cover (deferred to Phase 5+)

- Observability platform (ObservabilityService, FE SDK, funnel events) — Phase 5.
- Messaging SSE, voice-worker graceful shutdown, chaos verification — Phase 6.
- listNotifications cursor migration — Phase 6 polish (skip/limit functionally adequate).
- Phase 2 carry-forwards: 22 routes modules using `_STATUS.get`, AST checker docstring exemption, macOS `os.killpg` suppress, vitest devDep in `@ip/shared`.

Next plan to write: `docs/superpowers/plans/2026-06-21-robustness-phase-5-observability.md` (after Phase 4 closes).
