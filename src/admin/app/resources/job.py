"""Job posting + lifecycle business logic (transport-agnostic resource functions)."""

from lib.logging import get_logger
from lib.schemas import Role

from app.errors import ForbiddenError, NotFoundError, ValidationError
from app.model.job import Job

log = get_logger(component="job.resources")

_MANAGER_ROLES = {Role.company_admin.value, Role.recruiter.value}


def _require_manager(identity):
    if identity["role"] not in _MANAGER_ROLES:
        raise ForbiddenError("Only company users can manage jobs")


def _to_response(job):
    return {
        "job_id": str(job["_id"]),
        "comp_id": job["comp_id"],
        "title": job["title"],
        "status": job["status"],
    }


async def create_job(identity, title, jd_text, *, jobs):
    _require_manager(identity)
    if not title:
        raise ValidationError("Job title is required")
    job_id = await jobs.insert(
        Job(comp_id=identity["comp_id"], title=title, jd_text=jd_text)
    )
    log.info("job created: comp_id={} job_id={}", identity["comp_id"], job_id)
    return {
        "job_id": job_id,
        "comp_id": identity["comp_id"],
        "title": title,
        "status": "draft",
    }


async def get_job(identity, job_id, *, jobs):
    _require_manager(identity)
    job = await jobs.get_scoped(job_id, identity["comp_id"])
    if job is None:
        raise NotFoundError("Job not found")
    return _to_response(job)


async def list_jobs(identity, *, jobs):
    _require_manager(identity)
    return [_to_response(j) for j in await jobs.list_by_company(identity["comp_id"])]


async def get_public_job(job_id, *, jobs):
    """A published job's public fields (title + JD) for any authenticated user; drafts
    and unknown ids are NotFound; no comp-scope (published jobs are discoverable)."""
    job = await jobs.get_by_id(job_id)
    if job is None or job.get("status") != "published":
        raise NotFoundError("Job not found")
    return {
        "job_id": str(job["_id"]),
        "title": job["title"],
        "jd_text": job.get("jd_text", ""),
    }


async def publish_job(identity, job_id, *, jobs, publisher):
    _require_manager(identity)
    job = await jobs.get_scoped(job_id, identity["comp_id"])
    if job is None:
        raise NotFoundError("Job not found")
    if job["status"] != "draft":
        raise ValidationError("Only a draft job can be published")
    await jobs.set_status(job_id, identity["comp_id"], "published")
    await publisher.publish(
        "job.published", {"job_id": job_id, "comp_id": identity["comp_id"]}
    )
    log.info("job published: comp_id={} job_id={}", identity["comp_id"], job_id)
    return {**_to_response(job), "status": "published"}
