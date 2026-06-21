"""Funnel state machine — the single authority on legal application-state changes.

`next_state` is a pure transition function; `advance_application` loads the application,
applies the transition (compare-and-swap), persists it, and writes an audit log. Driven
by RabbitMQ funnel events (see app/main.py's funnel consumer). States/events come from
the shared `ApplicationState`/`FunnelEvent` enums so typos are caught, not silently
turned into illegal transitions.
"""

from lib.logging import bind_ids, get_logger, log_context
from lib.schemas import ApplicationState as S
from lib.schemas import FunnelEvent as E

from app.errors import InvalidTransition, NotFoundError
from app.model.audit import AuditLog

log = get_logger(component="funnel.resources")

DECISIONS = {S.shortlisted, S.rejected, S.hired}
# No transitions leave these — withdraw/expire/decision are final.
_TERMINAL = {S.shortlisted, S.rejected, S.hired, S.withdrawn, S.expired, S.abandoned}

# An InvalidTransition on these async-handoff events is usually an ordering race —
# scoring.completed gets processed before interview.completed has advanced the state
# (both are ai-agents events on one concurrently-consumed queue). The funnel consumer
# requeues these (bounded -> DLX) instead of dropping, so the application isn't stranded
# unscored; advance_application's CAS keeps the eventual retry idempotent.
_RETRYABLE_EVENTS = frozenset({E.interview_completed, E.scoring_completed})


def is_retryable_conflict(event) -> bool:
    """Whether an InvalidTransition for `event` is likely a transient ordering race a
    requeue can resolve, vs. a permanently illegal move that should be dropped.
    """
    return event in _RETRYABLE_EVENTS


def next_state(current, event, payload):
    if event == E.application_created and current == S.applied:
        return S.aptitude_pending
    if event == E.aptitude_graded and current == S.aptitude_pending:
        return S.interview_pending if payload.get("passed") else S.gated_out
    if event == E.gate_override and current == S.gated_out:
        return S.interview_pending
    if event == E.interview_completed and current == S.interview_pending:
        return S.interviewed
    if event == E.scoring_completed and current == S.interviewed:
        return S.scored
    if event == E.recruiter_decision and current in (S.scored, S.shortlisted):
        outcome = payload.get("outcome")
        if outcome not in DECISIONS:
            raise InvalidTransition(f"invalid decision outcome: {outcome!r}")
        return outcome
    # Edge exits: a candidate may withdraw, or the system may expire/abandon, any
    # application that hasn't already reached a terminal state.
    if event == E.application_withdrawn and current not in _TERMINAL:
        return S.withdrawn
    if event == E.application_expired and current not in _TERMINAL:
        return S.expired
    if event == E.interview_abandoned and current == S.interview_pending:
        return S.abandoned
    raise InvalidTransition(f"event {event!r} not allowed from state {current!r}")


async def advance_application(
    application_id, event, payload, *, applications, audit, notifier=None
):
    async with log_context(
        log,
        "resource.funnel.advance_application",
        **bind_ids(application_id=application_id),
    ):
        application = await applications.get(application_id)
        if application is None:
            raise NotFoundError("Application not found")
        current = application["state"]
        new = next_state(current, event, payload)
        # CAS on the observed state: a concurrent writer or a redelivered event that
        # already produced this transition is a no-op (no duplicate audit row or
        # notification); a genuine conflict surfaces as InvalidTransition.
        if not await applications.set_state_if(application_id, current, new):
            fresh = await applications.get(application_id)
            if fresh is not None and fresh["state"] == new:
                log.info(
                    "funnel: {} already {} ({}), no-op", application_id, new, event
                )
                return new
            raise InvalidTransition(f"state moved under {event!r} from {current!r}")
        await audit.insert(
            AuditLog(
                entity="application",
                entity_id=application_id,
                action=event,
                comp_id=application.get("comp_id"),
                from_state=current,
                to_state=new,
            )
        )
        log.info(
            "funnel: application {} {} -> {} ({})", application_id, current, new, event
        )
        # The injected notifier QUEUES a notification.requested event (see
        # NotificationRequestPublisher) rather than sending inline, so a transient
        # send failure is retried by its own consumer (→ DLX), not dropped. BE-#10.
        if notifier is not None:
            try:
                await notifier.notify(application, new, event)
            except Exception:
                log.exception(
                    "funnel: notification enqueue failed for {}", application_id
                )
        return new
