"""Job posting + lifecycle business logic (transport-agnostic resource functions)."""

from datetime import UTC, datetime

from lib.logging import bind_ids, get_logger, log_context
from lib.schemas import Role

from app.errors import ForbiddenError, NotFoundError, ValidationError
from app.model.job import AptitudeConfig, Job
from app.resources.discovery import iso

log = get_logger(component="job.resources")

_MANAGER_ROLES = {Role.company_admin.value, Role.recruiter.value}
_REMOTE_MODES = {"remote", "hybrid", "onsite"}
_EMPLOYMENT_TYPES = {"full_time", "contract", "internship"}
_GATE_MODES = {"auto", "advisory"}


def _require_manager(identity):
    if identity["role"] not in _MANAGER_ROLES:
        raise ForbiddenError("Only company users can manage jobs")


def _norm(value):
    """Trim a string; empty -> None (normalises optional marketplace fields)."""
    value = (value or "").strip()
    return value or None


def _validate_marketplace(fields):
    """Validate + normalise the optional marketplace fields (shared by create/update).

    Returns a flat dict of normalised values (gate_mode included, defaulting to "auto").
    Off-enum values, or salary_min > salary_max, raise ValidationError.
    """
    remote_mode = _norm(fields.get("remote_mode"))
    if remote_mode is not None and remote_mode not in _REMOTE_MODES:
        raise ValidationError("invalid remote_mode")
    employment_type = _norm(fields.get("employment_type"))
    if employment_type is not None and employment_type not in _EMPLOYMENT_TYPES:
        raise ValidationError("invalid employment_type")
    gate_mode = _norm(fields.get("gate_mode")) or "auto"
    if gate_mode not in _GATE_MODES:
        raise ValidationError("invalid gate_mode")
    salary_min = fields.get("salary_min") or 0
    salary_max = fields.get("salary_max") or 0
    if salary_min and salary_max and salary_min > salary_max:
        raise ValidationError("salary_min cannot exceed salary_max")
    skills = sorted(
        {s.strip().lower() for s in (fields.get("skills") or []) if s.strip()}
    )
    return {
        "city": _norm(fields.get("city")),
        "region": _norm(fields.get("region")),
        "country": _norm(fields.get("country")),
        "remote_mode": remote_mode,
        "employment_type": employment_type,
        "salary_min": salary_min,
        "salary_max": salary_max,
        "salary_currency": _norm(fields.get("salary_currency")),
        "skills": skills,
        "gate_mode": gate_mode,
    }


def _to_response(job):
    cfg = job.get("aptitude_config") or {}
    gate_mode = cfg.get("gate_mode", "auto") if isinstance(cfg, dict) else "auto"
    return {
        "job_id": str(job["_id"]),
        "comp_id": job["comp_id"],
        "title": job["title"],
        "status": job["status"],
        "city": job.get("city") or "",
        "region": job.get("region") or "",
        "country": job.get("country") or "",
        "remote_mode": job.get("remote_mode") or "",
        "employment_type": job.get("employment_type") or "",
        "salary_min": job.get("salary_min") or 0,
        "salary_max": job.get("salary_max") or 0,
        "salary_currency": job.get("salary_currency") or "",
        "skills": job.get("skills") or [],
        "gate_mode": gate_mode or "auto",
        "posted_at": iso(job.get("posted_at")),
    }


async def create_job(identity, title, jd_text, *, jobs, marketplace=None):
    async with log_context(
        log,
        "resource.job.create_job",
        **bind_ids(comp_id=identity["comp_id"]),
    ):
        _require_manager(identity)
        if not title:
            raise ValidationError("Job title is required")
        norm = _validate_marketplace(marketplace or {})
        gate_mode = norm.pop("gate_mode")
        job_id = await jobs.insert(
            Job(
                comp_id=identity["comp_id"],
                title=title,
                jd_text=jd_text,
                aptitude_config=AptitudeConfig(gate_mode=gate_mode),
                **norm,
            )
        )
        log.info("job created: comp_id={} job_id={}", identity["comp_id"], job_id)
        return _to_response(await jobs.get_scoped(job_id, identity["comp_id"]))


async def update_job(identity, job_id, title, jd_text, *, jobs, marketplace=None):
    async with log_context(
        log,
        "resource.job.update_job",
        **bind_ids(comp_id=identity["comp_id"], job_id=job_id),
    ):
        _require_manager(identity)
        if not title:
            raise ValidationError("Job title is required")
        if await jobs.get_scoped(job_id, identity["comp_id"]) is None:
            raise NotFoundError("Job not found")
        norm = _validate_marketplace(marketplace or {})
        gate_mode = norm.pop("gate_mode")
        await jobs.update_fields(
            job_id,
            identity["comp_id"],
            {
                **norm,
                "title": title,
                "jd_text": jd_text,
                "aptitude_config.gate_mode": gate_mode,
            },
        )
        log.info("job updated: comp_id={} job_id={}", identity["comp_id"], job_id)
        return _to_response(await jobs.get_scoped(job_id, identity["comp_id"]))


async def get_job(identity, job_id, *, jobs):
    async with log_context(
        log,
        "resource.job.get_job",
        **bind_ids(comp_id=identity["comp_id"], job_id=job_id),
    ):
        _require_manager(identity)
        job = await jobs.get_scoped(job_id, identity["comp_id"])
        if job is None:
            raise NotFoundError("Job not found")
        return _to_response(job)


async def list_jobs(identity, *, jobs):
    async with log_context(
        log,
        "resource.job.list_jobs",
        **bind_ids(comp_id=identity["comp_id"]),
    ):
        _require_manager(identity)
        return [
            _to_response(j) for j in await jobs.list_by_company(identity["comp_id"])
        ]


async def publish_job(identity, job_id, *, jobs, publisher):
    async with log_context(
        log,
        "resource.job.publish_job",
        **bind_ids(comp_id=identity["comp_id"], job_id=job_id),
    ):
        _require_manager(identity)
        job = await jobs.get_scoped(job_id, identity["comp_id"])
        if job is None:
            raise NotFoundError("Job not found")
        if job["status"] not in ("draft", "published"):
            raise ValidationError("Only a draft or published job can be published")
        if job["status"] == "draft":
            # Stamp posted_at at the flip (drafts have none); re-publish keeps original.
            await jobs.update_fields(
                job_id,
                identity["comp_id"],
                {"status": "published", "posted_at": datetime.now(UTC)},
            )
        # Emit (or re-emit) job.published. Idempotent — split bank/plan guards — so
        # re-publishing rebuilds anything a prior flip failure left missing. BE-#8.
        await publisher.publish(
            "job.published", {"job_id": job_id, "comp_id": identity["comp_id"]}
        )
        log.info("job published: comp_id={} job_id={}", identity["comp_id"], job_id)
        return _to_response(await jobs.get_scoped(job_id, identity["comp_id"]))
