import pytest
from pymongo.errors import DuplicateKeyError

from app.errors import (
    ConflictError,
    ForbiddenError,
    InvalidTransition,
    NotFoundError,
    ValidationError,
)
from app.model.application import Application
from app.model.job import Job
from app.resources import application

CAND = {"id": "u3", "role": "candidate", "comp_id": ""}
ADMIN = {"id": "u1", "role": "company_admin", "comp_id": "c1"}


async def _published_job(fakes, comp_id="c1"):
    return await fakes["jobs"].insert(
        Job(comp_id=comp_id, title="Eng", status="published")
    )


@pytest.mark.asyncio
async def test_apply_creates_and_publishes(fakes):
    jid = await _published_job(fakes)
    out = await application.apply(
        CAND,
        jid,
        True,
        applications=fakes["applications"],
        jobs=fakes["jobs"],
        publisher=fakes["publisher"],
    )
    assert out["state"] == "applied"
    assert fakes["publisher"].published[0][0] == "application.created"


@pytest.mark.asyncio
async def test_apply_emits_match_run(fakes):
    jid = await _published_job(fakes)
    await application.apply(
        CAND,
        jid,
        True,
        applications=fakes["applications"],
        jobs=fakes["jobs"],
        publisher=fakes["publisher"],
    )
    match_event = next(e for e in fakes["publisher"].published if e[0] == "match.run")
    assert match_event[1] == {
        "comp_id": "c1",
        "job_id": jid,
        "candidate_user_id": "u3",
    }


@pytest.mark.asyncio
async def test_apply_requires_consent(fakes):
    jid = await _published_job(fakes)
    with pytest.raises(ValidationError):
        await application.apply(
            CAND,
            jid,
            False,
            applications=fakes["applications"],
            jobs=fakes["jobs"],
            publisher=fakes["publisher"],
        )


@pytest.mark.asyncio
async def test_apply_to_unpublished_job_not_found(fakes):
    jid = await fakes["jobs"].insert(Job(comp_id="c1", title="Eng", status="draft"))
    with pytest.raises(NotFoundError):
        await application.apply(
            CAND,
            jid,
            True,
            applications=fakes["applications"],
            jobs=fakes["jobs"],
            publisher=fakes["publisher"],
        )


@pytest.mark.asyncio
async def test_apply_once_per_job(fakes):
    jid = await _published_job(fakes)
    kw = {
        "applications": fakes["applications"],
        "jobs": fakes["jobs"],
        "publisher": fakes["publisher"],
    }
    await application.apply(CAND, jid, True, **kw)
    with pytest.raises(ConflictError):
        await application.apply(CAND, jid, True, **kw)


@pytest.mark.asyncio
async def test_apply_concurrent_race_maps_to_conflict(fakes):
    # Two applies race past the existence check and both insert; the loser hits the
    # unique index. That must surface as a clean Conflict, not a raw 500.
    jid = await _published_job(fakes)

    class _RacyApps:
        async def get_by_job_and_candidate(self, job_id, candidate_user_id):
            return None  # the check passes — both racers reach the insert

        async def insert(self, application):
            raise DuplicateKeyError("dup (job_id, candidate_user_id)")

    with pytest.raises(ConflictError):
        await application.apply(
            CAND,
            jid,
            True,
            applications=_RacyApps(),
            jobs=fakes["jobs"],
            publisher=fakes["publisher"],
        )


@pytest.mark.asyncio
async def test_candidate_cannot_list_applicants(fakes):
    jid = await _published_job(fakes)
    with pytest.raises(ForbiddenError):
        await application.list_applicants(
            CAND, jid, 50, "", applications=fakes["applications"]
        )


@pytest.mark.asyncio
async def test_manager_lists_applicants_company_scoped(fakes):
    jid = await _published_job(fakes, comp_id="c1")
    await application.apply(
        CAND,
        jid,
        True,
        applications=fakes["applications"],
        jobs=fakes["jobs"],
        publisher=fakes["publisher"],
    )
    mine = await application.list_applicants(
        ADMIN, jid, 50, "", applications=fakes["applications"]
    )
    assert len(mine["applications"]) == 1
    assert mine["total_count"] == 1
    other = await application.list_applicants(
        {"id": "x", "role": "company_admin", "comp_id": "c2"},
        jid,
        50,
        "",
        applications=fakes["applications"],
    )
    assert other["applications"] == []
    assert other["total_count"] == 0


@pytest.mark.asyncio
async def test_withdraw_application_by_owner(fakes):
    app_id = await fakes["applications"].insert(
        Application(
            comp_id="c1", job_id="j1", candidate_user_id="u3", state="aptitude_pending"
        )
    )
    out = await application.withdraw_application(
        CAND, app_id, applications=fakes["applications"], audit=fakes["audit"]
    )
    assert out["state"] == "withdrawn"
    assert (await fakes["applications"].get(app_id))["state"] == "withdrawn"
    assert fakes["audit"].records[-1]["action"] == "application.withdrawn"


@pytest.mark.asyncio
async def test_withdraw_application_not_owner_is_hidden(fakes):
    app_id = await fakes["applications"].insert(
        Application(
            comp_id="c1", job_id="j1", candidate_user_id="someone", state="applied"
        )
    )
    with pytest.raises(NotFoundError):
        await application.withdraw_application(
            CAND, app_id, applications=fakes["applications"], audit=fakes["audit"]
        )


@pytest.mark.asyncio
async def test_withdraw_after_decision_rejected(fakes):
    app_id = await fakes["applications"].insert(
        Application(comp_id="c1", job_id="j1", candidate_user_id="u3", state="hired")
    )
    with pytest.raises(InvalidTransition):
        await application.withdraw_application(
            CAND, app_id, applications=fakes["applications"], audit=fakes["audit"]
        )
