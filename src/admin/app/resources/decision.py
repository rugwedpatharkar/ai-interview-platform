"""Recruiter decision loop + gate override — both advance the funnel state machine."""

from lib.logging import bind_ids, get_logger, log_context
from lib.schemas import Role

from app.errors import ForbiddenError, NotFoundError, ValidationError
from app.resources import funnel

log = get_logger(component="decision.resources")

_MANAGER_ROLES = {Role.company_admin.value, Role.recruiter.value}


def _require_manager(identity):
    if identity["role"] not in _MANAGER_ROLES:
        raise ForbiddenError("Only company users can decide on applications")


async def _scoped(identity, application_id, applications):
    application = await applications.get(application_id)
    if application is None or application.get("comp_id") != identity["comp_id"]:
        raise NotFoundError("Application not found")
    return application


async def decide_application(
    identity, application_id, outcome, *, applications, audit, notifier=None
):
    async with log_context(
        log,
        "resource.decision.decide_application",
        **bind_ids(
            user_id=identity["id"],
            comp_id=identity["comp_id"],
            application_id=application_id,
        ),
    ):
        _require_manager(identity)
        if outcome not in funnel.DECISIONS:
            raise ValidationError(f"invalid decision outcome: {outcome!r}")
        await _scoped(identity, application_id, applications)
        new = await funnel.advance_application(
            application_id,
            "recruiter.decision",
            {"outcome": outcome},
            applications=applications,
            audit=audit,
            notifier=notifier,
        )
        log.info("decision recorded: application {} -> {}", application_id, new)
        return new


async def override_gate(
    identity, application_id, *, applications, audit, notifier=None
):
    async with log_context(
        log,
        "resource.decision.override_gate",
        **bind_ids(
            user_id=identity["id"],
            comp_id=identity["comp_id"],
            application_id=application_id,
        ),
    ):
        _require_manager(identity)
        await _scoped(identity, application_id, applications)
        new = await funnel.advance_application(
            application_id,
            "gate.override",
            {},
            applications=applications,
            audit=audit,
            notifier=notifier,
        )
        log.info("gate override: application {} -> {}", application_id, new)
        return new
