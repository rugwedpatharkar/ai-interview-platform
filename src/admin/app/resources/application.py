"""Application (candidate-job) business logic — transport-agnostic resources."""

from lib.cursors import decode_cursor, encode_cursor
from lib.logging import bind_ids, get_logger, log_context
from lib.schemas import Role
from pymongo.errors import DuplicateKeyError

from app.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.model.application import Application
from app.resources import funnel

log = get_logger(component="application.resources")

_MANAGER_ROLES = {Role.company_admin.value, Role.recruiter.value}


def _to_response(app):
    return {
        "application_id": str(app["_id"]),
        "job_id": app["job_id"],
        "candidate_user_id": app["candidate_user_id"],
        "state": app["state"],
    }


async def apply(identity, job_id, consent, *, applications, jobs, publisher):
    async with log_context(
        log,
        "resource.application.apply",
        **bind_ids(user_id=identity["id"], job_id=job_id),
    ):
        if identity["role"] != Role.candidate.value:
            raise ForbiddenError("Only candidates can apply")
        if not consent:
            raise ValidationError("Consent is required to apply")
        job = await jobs.get_by_id(job_id)
        if job is None or job["status"] != "published":
            raise NotFoundError("Job is not open for applications")
        if await applications.get_by_job_and_candidate(job_id, identity["id"]):
            raise ConflictError("Already applied to this job")
        try:
            app_id = await applications.insert(
                Application(
                    comp_id=job["comp_id"],
                    job_id=job_id,
                    candidate_user_id=identity["id"],
                    state="applied",
                    consent=True,
                )
            )
        except DuplicateKeyError:
            # A concurrent apply raced past the check above and won the unique index;
            # surface the same clean Conflict instead of a raw 500. A lost match.run
            # on the publish below is recovered by the reconcile sweep.
            raise ConflictError("Already applied to this job") from None
        await publisher.publish(
            "application.created",
            {
                "application_id": app_id,
                "job_id": job_id,
                "candidate_user_id": identity["id"],
                "comp_id": job["comp_id"],
            },
        )
        # Trigger the Matcher agent (ai-agents binds match.run) to rank this candidate.
        await publisher.publish(
            "match.run",
            {
                "comp_id": job["comp_id"],
                "job_id": job_id,
                "candidate_user_id": identity["id"],
            },
        )
        log.info("application created: job_id={} candidate={}", job_id, identity["id"])
        return {
            "application_id": app_id,
            "job_id": job_id,
            "candidate_user_id": identity["id"],
            "state": "applied",
        }


async def list_my_applications(identity, *, applications):
    async with log_context(
        log,
        "resource.application.list_my_applications",
        **bind_ids(user_id=identity["id"]),
    ):
        if identity["role"] != Role.candidate.value:
            raise ForbiddenError("Only candidates have applications")
        return [
            _to_response(a)
            for a in await applications.list_by_candidate(identity["id"])
        ]


_DEFAULT_PAGE_SIZE = 50
_MAX_PAGE_SIZE = 200


async def list_applicants(identity, job_id, page_size, page_token, *, applications):
    async with log_context(
        log,
        "resource.application.list_applicants",
        **bind_ids(user_id=identity["id"], comp_id=identity["comp_id"], job_id=job_id),
    ):
        if identity["role"] not in _MANAGER_ROLES:
            raise ForbiddenError("Only company users can view applicants")
        size = max(1, min(page_size or _DEFAULT_PAGE_SIZE, _MAX_PAGE_SIZE))
        after_id = decode_cursor(page_token)
        rows, next_after = await applications.list_by_job_paginated(
            job_id, identity["comp_id"], page_size=size, after_id=after_id
        )
        total = (
            await applications.count_by_job(job_id, identity["comp_id"])
            if not page_token
            else 0
        )
        return {
            "applications": [_to_response(a) for a in rows],
            "next_page_token": encode_cursor(next_after) if next_after else "",
            "total_count": total,
        }


async def withdraw_application(
    identity, application_id, *, applications, audit, notifier=None
):
    async with log_context(
        log,
        "resource.application.withdraw_application",
        **bind_ids(user_id=identity["id"], application_id=application_id),
    ):
        # Candidate withdraws their own application (any non-terminal state). Goes
        # through the funnel authority so the transition is validated + audit-logged.
        if identity["role"] != Role.candidate.value:
            raise ForbiddenError("Only candidates can withdraw applications")
        app = await applications.get(application_id)
        if app is None or app["candidate_user_id"] != identity["id"]:
            raise NotFoundError("Application not found")
        new = await funnel.advance_application(
            application_id,
            "application.withdrawn",
            {},
            applications=applications,
            audit=audit,
            notifier=notifier,
        )
        return {**_to_response(app), "state": new}
