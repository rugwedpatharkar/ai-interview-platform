"""TDD tests for decision.hold_application and decision.reject_application.

Sub-task B of Phase 4 Task 2 — tests written before implementation.
"""

import pytest

from app.errors import ForbiddenError, InvalidTransition, NotFoundError, ValidationError
from app.model.application import Application
from app.resources import decision

ADMIN = {"id": "u1", "role": "company_admin", "comp_id": "c1"}
CAND = {"id": "u3", "role": "candidate", "comp_id": ""}


async def _app(fakes, state, comp_id="c1"):
    return await fakes["applications"].insert(
        Application(comp_id=comp_id, job_id="j1", candidate_user_id="u9", state=state)
    )


# ---------------------------------------------------------------------------
# hold_application
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_hold_application_advances_state_and_audits(fakes):
    aid = await _app(fakes, "scored")
    result = await decision.hold_application(
        ADMIN,
        aid,
        "backlog",
        "Need more candidates",
        applications=fakes["applications"],
        audit=fakes["audit"],
    )
    assert result["new_state"] == "on_hold"
    assert result["application_id"] == aid
    assert result["audited_at_ms"] > 0
    audit_row = fakes["audit"].records[-1]
    assert audit_row["action"] == "application.hold"
    assert audit_row["from_state"] == "scored"
    assert audit_row["to_state"] == "on_hold"


@pytest.mark.asyncio
async def test_hold_application_is_idempotent(fakes):
    aid = await _app(fakes, "on_hold")
    audit_before = len(fakes["audit"].records)
    result = await decision.hold_application(
        ADMIN,
        aid,
        "backlog",
        "",
        applications=fakes["applications"],
        audit=fakes["audit"],
    )
    assert result["new_state"] == "on_hold"
    assert len(fakes["audit"].records) == audit_before  # no new audit row


@pytest.mark.asyncio
async def test_hold_application_rejects_terminal_states(fakes):
    aid = await _app(fakes, "rejected")
    with pytest.raises(InvalidTransition):
        await decision.hold_application(
            ADMIN,
            aid,
            "backlog",
            "",
            applications=fakes["applications"],
            audit=fakes["audit"],
        )


@pytest.mark.asyncio
async def test_hold_application_rejects_hired_terminal(fakes):
    aid = await _app(fakes, "hired")
    with pytest.raises(InvalidTransition):
        await decision.hold_application(
            ADMIN,
            aid,
            "backlog",
            "",
            applications=fakes["applications"],
            audit=fakes["audit"],
        )


# ---------------------------------------------------------------------------
# reject_application
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reject_application_advances_state(fakes):
    aid = await _app(fakes, "scored")
    result = await decision.reject_application(
        ADMIN,
        aid,
        "not_a_fit",
        "Skills mismatch",
        applications=fakes["applications"],
        audit=fakes["audit"],
    )
    assert result["new_state"] == "rejected"
    assert result["application_id"] == aid
    assert result["audited_at_ms"] > 0
    audit_row = fakes["audit"].records[-1]
    assert audit_row["action"] == "application.reject"
    assert audit_row["from_state"] == "scored"
    assert audit_row["to_state"] == "rejected"


@pytest.mark.asyncio
async def test_reject_application_rejects_terminal_states(fakes):
    aid = await _app(fakes, "hired")
    with pytest.raises(InvalidTransition):
        await decision.reject_application(
            ADMIN,
            aid,
            "not_a_fit",
            "",
            applications=fakes["applications"],
            audit=fakes["audit"],
        )


# ---------------------------------------------------------------------------
# shared access-control
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_non_recruiter_forbidden_hold(fakes):
    aid = await _app(fakes, "scored")
    with pytest.raises(ForbiddenError):
        await decision.hold_application(
            CAND,
            aid,
            "backlog",
            "",
            applications=fakes["applications"],
            audit=fakes["audit"],
        )


@pytest.mark.asyncio
async def test_non_recruiter_forbidden_reject(fakes):
    aid = await _app(fakes, "scored")
    with pytest.raises(ForbiddenError):
        await decision.reject_application(
            CAND,
            aid,
            "not_a_fit",
            "",
            applications=fakes["applications"],
            audit=fakes["audit"],
        )


@pytest.mark.asyncio
async def test_cross_tenant_returns_not_found_hold(fakes):
    aid = await _app(fakes, "scored", comp_id="c1")
    other = {"id": "x", "role": "company_admin", "comp_id": "c2"}
    with pytest.raises(NotFoundError):
        await decision.hold_application(
            other,
            aid,
            "backlog",
            "",
            applications=fakes["applications"],
            audit=fakes["audit"],
        )


@pytest.mark.asyncio
async def test_cross_tenant_returns_not_found_reject(fakes):
    aid = await _app(fakes, "scored", comp_id="c1")
    other = {"id": "x", "role": "company_admin", "comp_id": "c2"}
    with pytest.raises(NotFoundError):
        await decision.reject_application(
            other,
            aid,
            "not_a_fit",
            "",
            applications=fakes["applications"],
            audit=fakes["audit"],
        )


@pytest.mark.asyncio
async def test_validation_error_on_empty_reason_code_hold(fakes):
    aid = await _app(fakes, "scored")
    with pytest.raises(ValidationError):
        await decision.hold_application(
            ADMIN,
            aid,
            "",
            "some text",
            applications=fakes["applications"],
            audit=fakes["audit"],
        )


@pytest.mark.asyncio
async def test_validation_error_on_empty_reason_code_reject(fakes):
    aid = await _app(fakes, "scored")
    with pytest.raises(ValidationError):
        await decision.reject_application(
            ADMIN,
            aid,
            "",
            "some text",
            applications=fakes["applications"],
            audit=fakes["audit"],
        )
