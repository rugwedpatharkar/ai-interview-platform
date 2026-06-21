"""Recruiter decision loop + gate override — both advance the funnel state machine."""

import time

from lib.logging import bind_ids, get_logger, log_context
from lib.schemas import Role

from app.errors import ForbiddenError, InvalidTransition, NotFoundError, ValidationError
from app.model.audit import AuditLog
from app.resources import funnel

log = get_logger(component="decision.resources")

_MANAGER_ROLES = {Role.company_admin.value, Role.recruiter.value}
_HOLD_STATE = "on_hold"
_REJECT_STATE = "rejected"
_TERMINAL_STATES = {"hired", "rejected", "withdrawn", "expired", "abandoned"}


def _require_manager(identity):
    if identity["role"] not in _MANAGER_ROLES:
        raise ForbiddenError("Only company users can decide on applications")


async def _scoped(identity, application_id, applications):
    application = await applications.get(application_id)
    if application is None or application.get("comp_id") != identity["comp_id"]:
        raise NotFoundError("Application not found")
    return application


def _ms_now() -> int:
    return int(time.time() * 1000)


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


async def hold_application(
    identity,
    application_id,
    reason_code,
    free_text,
    *,
    applications,
    audit,
    notifier=None,
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
            return {
                "application_id": application_id,
                "new_state": _HOLD_STATE,
                "audited_at_ms": application.get("audited_at_ms") or _ms_now(),
            }
        if current in _TERMINAL_STATES:
            raise InvalidTransition(f"cannot hold from terminal state {current!r}")
        await applications.set_state_if(application_id, current, _HOLD_STATE)
        audited_at_ms = _ms_now()
        await audit.insert(
            AuditLog(
                entity="application",
                entity_id=application_id,
                action="application.hold",
                comp_id=application.get("comp_id"),
                from_state=current,
                to_state=_HOLD_STATE,
            )
        )
        if notifier is not None:
            try:
                await notifier.notify(application, _HOLD_STATE, "application.hold")
            except Exception:
                log.exception("decision.hold: notify failed for {}", application_id)
        log.info("hold applied: application {} {} -> on_hold", application_id, current)
        return {
            "application_id": application_id,
            "new_state": _HOLD_STATE,
            "audited_at_ms": audited_at_ms,
        }


async def reject_application(
    identity,
    application_id,
    reason_code,
    free_text,
    *,
    applications,
    audit,
    notifier=None,
):
    async with log_context(
        log,
        "resource.decision.reject_application",
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
        if current == _REJECT_STATE:
            return {
                "application_id": application_id,
                "new_state": _REJECT_STATE,
                "audited_at_ms": application.get("audited_at_ms") or _ms_now(),
            }
        if current in _TERMINAL_STATES:
            raise InvalidTransition(f"cannot reject from terminal state {current!r}")
        await applications.set_state_if(application_id, current, _REJECT_STATE)
        audited_at_ms = _ms_now()
        await audit.insert(
            AuditLog(
                entity="application",
                entity_id=application_id,
                action="application.reject",
                comp_id=application.get("comp_id"),
                from_state=current,
                to_state=_REJECT_STATE,
            )
        )
        if notifier is not None:
            try:
                await notifier.notify(application, _REJECT_STATE, "application.reject")
            except Exception:
                log.exception("decision.reject: notify failed for {}", application_id)
        log.info(
            "reject applied: application {} {} -> rejected", application_id, current
        )
        return {
            "application_id": application_id,
            "new_state": _REJECT_STATE,
            "audited_at_ms": audited_at_ms,
        }
