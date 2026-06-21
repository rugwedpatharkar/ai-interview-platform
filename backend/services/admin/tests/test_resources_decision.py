import pytest

from app.errors import (
    ForbiddenError,
    InvalidTransition,
    NotFoundError,
    ValidationError,
)
from app.model.application import Application
from app.resources import decision

ADMIN = {"id": "u1", "role": "company_admin", "comp_id": "c1"}
CAND = {"id": "u3", "role": "candidate", "comp_id": ""}


async def _app(fakes, state, comp_id="c1"):
    return await fakes["applications"].insert(
        Application(comp_id=comp_id, job_id="j1", candidate_user_id="u9", state=state)
    )


@pytest.mark.asyncio
async def test_decide_scored_application(fakes):
    aid = await _app(fakes, "scored")
    new = await decision.decide_application(
        ADMIN, aid, "hired", applications=fakes["applications"], audit=fakes["audit"]
    )
    assert new == "hired"
    assert fakes["audit"].records[-1]["to_state"] == "hired"


@pytest.mark.asyncio
async def test_decide_requires_manager(fakes):
    aid = await _app(fakes, "scored")
    with pytest.raises(ForbiddenError):
        await decision.decide_application(
            CAND, aid, "hired", applications=fakes["applications"], audit=fakes["audit"]
        )


@pytest.mark.asyncio
async def test_decide_other_company_not_found(fakes):
    aid = await _app(fakes, "scored", comp_id="c1")
    other = {"id": "x", "role": "company_admin", "comp_id": "c2"}
    with pytest.raises(NotFoundError):
        await decision.decide_application(
            other,
            aid,
            "hired",
            applications=fakes["applications"],
            audit=fakes["audit"],
        )


@pytest.mark.asyncio
async def test_decide_non_scored_is_invalid(fakes):
    aid = await _app(fakes, "applied")
    with pytest.raises(InvalidTransition):
        await decision.decide_application(
            ADMIN,
            aid,
            "hired",
            applications=fakes["applications"],
            audit=fakes["audit"],
        )


@pytest.mark.asyncio
async def test_decide_invalid_outcome_rejected(fakes):
    aid = await _app(fakes, "scored")
    with pytest.raises(ValidationError):
        await decision.decide_application(
            ADMIN,
            aid,
            "promote",  # not a legal decision outcome
            applications=fakes["applications"],
            audit=fakes["audit"],
        )


@pytest.mark.asyncio
async def test_override_gate(fakes):
    aid = await _app(fakes, "gated_out")
    new = await decision.override_gate(
        ADMIN, aid, applications=fakes["applications"], audit=fakes["audit"]
    )
    assert new == "interview_pending"
