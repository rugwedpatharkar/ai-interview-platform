import pytest

from app.errors import ForbiddenError, NotFoundError, ValidationError
from app.resources import job

ADMIN = {"id": "u1", "role": "company_admin", "comp_id": "c1"}
OTHER = {"id": "u2", "role": "company_admin", "comp_id": "c2"}
CAND = {"id": "u3", "role": "candidate", "comp_id": None}


@pytest.mark.asyncio
async def test_create_and_get_job(fakes):
    created = await job.create_job(ADMIN, "Backend Eng", "JD...", jobs=fakes["jobs"])
    assert created["status"] == "draft"
    got = await job.get_job(ADMIN, created["job_id"], jobs=fakes["jobs"])
    assert got["title"] == "Backend Eng"


@pytest.mark.asyncio
async def test_jobs_are_company_scoped(fakes):
    created = await job.create_job(ADMIN, "Eng", "x", jobs=fakes["jobs"])
    with pytest.raises(NotFoundError):
        await job.get_job(OTHER, created["job_id"], jobs=fakes["jobs"])
    assert await job.list_jobs(OTHER, jobs=fakes["jobs"]) == []


@pytest.mark.asyncio
async def test_candidate_cannot_manage_jobs(fakes):
    with pytest.raises(ForbiddenError):
        await job.create_job(CAND, "Eng", "x", jobs=fakes["jobs"])


@pytest.mark.asyncio
async def test_get_public_job_returns_published_fields(fakes):
    created = await job.create_job(
        ADMIN, "Backend Eng", "Build APIs.", jobs=fakes["jobs"]
    )
    await fakes["jobs"].set_status(created["job_id"], "c1", "published")
    out = await job.get_public_job(created["job_id"], jobs=fakes["jobs"])
    assert out["title"] == "Backend Eng"
    assert out["jd_text"] == "Build APIs."


@pytest.mark.asyncio
async def test_get_public_job_draft_is_not_found(fakes):
    # An unpublished (draft) job is not publicly discoverable.
    created = await job.create_job(ADMIN, "Draft Role", "x", jobs=fakes["jobs"])
    with pytest.raises(NotFoundError):
        await job.get_public_job(created["job_id"], jobs=fakes["jobs"])


@pytest.mark.asyncio
async def test_publish_emits_event_and_blocks_double(fakes):
    created = await job.create_job(ADMIN, "Eng", "x", jobs=fakes["jobs"])
    out = await job.publish_job(
        ADMIN, created["job_id"], jobs=fakes["jobs"], publisher=fakes["publisher"]
    )
    assert out["status"] == "published"
    assert fakes["publisher"].published[0][0] == "job.published"
    with pytest.raises(ValidationError):
        await job.publish_job(
            ADMIN, created["job_id"], jobs=fakes["jobs"], publisher=fakes["publisher"]
        )
