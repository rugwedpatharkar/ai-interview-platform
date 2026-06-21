"""Interview scheduling resources — all logic: authz, ready-gate, CAS, ICS, lists.

Funnel-adjacent: never writes funnel state (only reads `application.state` for the
ready-for-live gate). Authz reuses `decision._require_manager`/`_scoped` (manager) and
`aptitude._owned` (candidate) — the slots + booking are 1:1-per-application, so they
authorize against the application. Every persisted instant is UTC; mutations are
rate-limited; the candidate's pick is first-write-wins via the booking `version` CAS.
"""

from datetime import UTC, datetime

from lib.logging import bind_ids, get_logger, log_context
from lib.schemas import Role

from app.errors import (
    ConflictError,
    NotFoundError,
    RateLimitedError,
    ValidationError,
)
from app.model.scheduling import InterviewBooking, InterviewSlots, ProposedSlot
from app.resources.aptitude import _owned
from app.resources.decision import _require_manager, _scoped
from app.resources.notification import notify_event
from app.resources.scheduling_ics import build_ics

log = get_logger(component="scheduling.resources")

_MANAGER_ROLES = {Role.company_admin.value, Role.recruiter.value}
_READY_STATES = {"interview_pending", "shortlisted"}
_MAX_SLOTS = 10
_MIN_DURATION = 15
_MAX_DURATION = 480
_MAX_LOCATION = 512
_MAX_NOTE = 1024
_RATE_LIMIT = 30
_RATE_WINDOW = 60


def _utcnow():
    return datetime.now(UTC)


def _parse_instant(value):
    """Parse an ISO-8601 instant to aware UTC; ValidationError on bad input."""
    try:
        dt = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError(f"invalid datetime: {value!r}") from None
    return dt.astimezone(UTC) if dt.tzinfo else dt.replace(tzinfo=UTC)


def _as_dt(value):
    """Coerce a stored instant (datetime from Mongo, or ISO str) to aware UTC."""
    return value if isinstance(value, datetime) else _parse_instant(value)


async def _authorize_either(identity, application_id, applications):
    """Manager -> comp-scoped; candidate (or any other role) -> ownership."""
    if identity["role"] in _MANAGER_ROLES:
        return await _scoped(identity, application_id, applications)
    return await _owned(identity, application_id, applications)


async def _rate_limit(limiter, user_id):
    if limiter is None:
        return
    hit = await limiter.hit(f"sched:{user_id}", _RATE_LIMIT, _RATE_WINDOW)
    if not hit.allowed:
        raise RateLimitedError(hit.retry_after)


async def _notify(notifications, user_id, comp_id, kind):
    """Best-effort feed notification — never blocks the durable scheduling write."""
    if notifications is None or not user_id:
        return
    try:
        await notify_event(user_id, comp_id, kind, notifications=notifications)
    except Exception:
        log.exception("scheduling notify failed for {}", kind)


def _require_ready(application):
    if application.get("state") not in _READY_STATES:
        raise ValidationError("candidate is not ready for a live interview")


def _validate_text(location, note):
    if len(location) > _MAX_LOCATION:
        raise ValidationError("location too long")
    if len(note) > _MAX_NOTE:
        raise ValidationError("note too long")


def _validate_slots(slots, *, clock):
    """Boundary-validate + de-dupe proposed slots -> sorted [(start_dt, duration)]."""
    if not slots:
        raise ValidationError("at least one slot is required")
    if len(slots) > _MAX_SLOTS:
        raise ValidationError(f"at most {_MAX_SLOTS} slots")
    now = clock()
    out = {}
    for s in slots:
        start = _parse_instant(s["start_at"])
        if start <= now:
            raise ValidationError("slot start must be in the future")
        duration = s["duration_minutes"]
        if not _MIN_DURATION <= duration <= _MAX_DURATION:
            raise ValidationError(
                f"duration must be {_MIN_DURATION}..{_MAX_DURATION} minutes"
            )
        out[start] = duration  # de-dupe by start instant
    return sorted(out.items())


async def _schedule_dto(application_id, slots_repo, bookings):
    booking = await bookings.get_by_application(application_id)
    proposal = await slots_repo.get_open_for_application(application_id)
    return {
        "application_id": application_id,
        "status": (booking or {}).get("status", "proposed"),
        "slots": (proposal or {}).get("slots", []),
        "chosen_start_at": (booking or {}).get("chosen_start_at"),
        "chosen_duration_minutes": (booking or {}).get("chosen_duration_minutes", 0),
        "location": (booking or {}).get("location", ""),
        "note": (booking or {}).get("note", ""),
        "cancelled_by": (booking or {}).get("cancelled_by", ""),
    }


async def _propose(
    identity,
    application_id,
    slots,
    location,
    note,
    kind,
    *,
    applications,
    slots_repo,
    bookings,
    notifications=None,
    limiter=None,
    clock=_utcnow,
):
    _require_manager(identity)
    await _rate_limit(limiter, identity["id"])
    application = await _scoped(identity, application_id, applications)
    _require_ready(application)
    _validate_text(location, note)
    parsed = _validate_slots(slots, clock=clock)
    proposed = [
        ProposedSlot(start_at=start, duration_minutes=dur) for start, dur in parsed
    ]
    comp_id = application.get("comp_id", "")
    candidate_user_id = application.get("candidate_user_id", "")
    await slots_repo.supersede_open(application_id)
    await slots_repo.create(
        InterviewSlots(
            application_id=application_id,
            comp_id=comp_id,
            slots=proposed,
            location=location,
            note=note,
        )
    )
    # Eager-create the single booking, or reset an existing one to proposed — the CAS
    # bumps version so any in-flight pick of the old proposal loses.
    if await bookings.get_by_application(application_id) is None:
        await bookings.create(
            InterviewBooking(
                application_id=application_id,
                comp_id=comp_id,
                candidate_user_id=candidate_user_id,
                location=location,
                note=note,
            )
        )
    else:
        await bookings.reset_to_proposed(application_id, location=location, note=note)
    await _notify(notifications, candidate_user_id, comp_id, kind)
    return await _schedule_dto(application_id, slots_repo, bookings)


async def propose_slots(identity, application_id, slots, location, note, **kw):
    async with log_context(
        log,
        "resource.scheduling.propose_slots",
        **bind_ids(
            user_id=identity["id"],
            comp_id=identity.get("comp_id", ""),
            application_id=application_id,
        ),
    ):
        return await _propose(
            identity, application_id, slots, location, note, "interview_proposed", **kw
        )


async def reschedule(identity, application_id, slots, location, note, **kw):
    async with log_context(
        log,
        "resource.scheduling.reschedule",
        **bind_ids(
            user_id=identity["id"],
            comp_id=identity.get("comp_id", ""),
            application_id=application_id,
        ),
    ):
        return await _propose(
            identity,
            application_id,
            slots,
            location,
            note,
            "interview_rescheduled",
            **kw,
        )


async def get_schedule(identity, application_id, *, applications, slots_repo, bookings):
    async with log_context(
        log,
        "resource.scheduling.get_schedule",
        **bind_ids(
            user_id=identity["id"],
            application_id=application_id,
        ),
    ):
        await _authorize_either(identity, application_id, applications)
        return await _schedule_dto(application_id, slots_repo, bookings)


async def choose_slot(
    identity,
    application_id,
    start_at,
    *,
    applications,
    slots_repo,
    bookings,
    notifications=None,
    limiter=None,
    clock=_utcnow,
):
    async with log_context(
        log,
        "resource.scheduling.choose_slot",
        **bind_ids(
            user_id=identity["id"],
            application_id=application_id,
        ),
    ):
        await _owned(identity, application_id, applications)
        await _rate_limit(limiter, identity["id"])
        booking = await bookings.get_by_application(application_id)
        if booking is None:
            raise NotFoundError("no interview to schedule")
        proposal = await slots_repo.get_open_for_application(application_id)
        chosen_start, duration = _match_offered(proposal, start_at)
        won = await bookings.choose_if_proposed(
            application_id,
            expected_version=booking["version"],
            chosen_start_at=chosen_start,
            duration_minutes=duration,
            location=(proposal or {}).get("location", ""),
        )
        if not won:
            raise ConflictError("that time was just taken")
        return await _schedule_dto(application_id, slots_repo, bookings)


async def cancel(
    identity,
    application_id,
    *,
    applications,
    slots_repo,
    bookings,
    notifications=None,
    limiter=None,
):
    async with log_context(
        log,
        "resource.scheduling.cancel",
        **bind_ids(
            user_id=identity["id"],
            application_id=application_id,
        ),
    ):
        await _authorize_either(identity, application_id, applications)
        await _rate_limit(limiter, identity["id"])
        booking = await bookings.get_by_application(application_id)
        if booking is None:
            raise NotFoundError("no interview to cancel")
        by = "company" if identity["role"] in _MANAGER_ROLES else "candidate"
        # A double-cancel returns False (already cancelled) — idempotent, no raise.
        await bookings.cancel_if(application_id, by=by)
        # Notify the candidate when the company cancels (recruiter side has no single
        # user_id on the application; candidate-initiated cancels notify no one here).
        if by == "company":
            await _notify(
                notifications,
                booking.get("candidate_user_id", ""),
                booking.get("comp_id", ""),
                "interview_cancelled",
            )
        return await _schedule_dto(application_id, slots_repo, bookings)


async def get_ics(identity, application_id, *, applications, bookings, clock=_utcnow):
    async with log_context(
        log,
        "resource.scheduling.get_ics",
        **bind_ids(
            user_id=identity["id"],
            application_id=application_id,
        ),
    ):
        await _authorize_either(identity, application_id, applications)
        booking = await bookings.get_by_application(application_id)
        if booking is None or booking.get("status") != "booked":
            raise NotFoundError("no booked interview")
        content = build_ics(
            booking_id=application_id,  # stable 1:1 key -> stable UID across re-sends
            version=booking.get("version", 0),
            start_at=_as_dt(booking["chosen_start_at"]),
            duration_minutes=booking.get("chosen_duration_minutes", 0),
            title="Interview",
            now=clock(),
            location=booking.get("location", ""),
            note=booking.get("note", ""),
        )
        return {"filename": f"interview-{application_id}.ics", "content": content}


def _paginate(page, page_size):
    return (page or 1), min(page_size or 20, 50)


def _booking_dto(r):
    return {
        "application_id": r.get("application_id", ""),
        "status": r.get("status", ""),
        "chosen_start_at": r.get("chosen_start_at"),
        "chosen_duration_minutes": r.get("chosen_duration_minutes", 0),
        "location": r.get("location", ""),
    }


async def list_candidate_interviews(identity, *, bookings, page=1, page_size=20):
    async with log_context(
        log,
        "resource.scheduling.list_candidate_interviews",
        **bind_ids(user_id=identity["id"]),
    ):
        page, page_size = _paginate(page, page_size)
        skip = (page - 1) * page_size
        rows = await bookings.list_for_candidate(
            identity["id"], skip=skip, limit=page_size
        )
        total = await bookings.count_for_candidate(identity["id"])
        return {
            "bookings": [_booking_dto(r) for r in rows],
            "page": page,
            "page_size": page_size,
            "total": total,
        }


async def list_company_bookings(identity, status, *, bookings, page=1, page_size=20):
    async with log_context(
        log,
        "resource.scheduling.list_company_bookings",
        **bind_ids(user_id=identity["id"], comp_id=identity["comp_id"]),
    ):
        _require_manager(identity)
        page, page_size = _paginate(page, page_size)
        skip = (page - 1) * page_size
        rows = await bookings.list_for_company(
            identity["comp_id"], status or None, skip=skip, limit=page_size
        )
        total = await bookings.count_for_company(identity["comp_id"], status or None)
        return {
            "bookings": [_booking_dto(r) for r in rows],
            "page": page,
            "page_size": page_size,
            "total": total,
        }


def _match_offered(proposal, start_at):
    """The offered (start_dt, duration) for `start_at`, or ValidationError. Runs BEFORE
    any CAS write so a non-offered time never touches the booking."""
    wanted = _parse_instant(start_at)
    for slot in (proposal or {}).get("slots", []):
        if _as_dt(slot["start_at"]) == wanted:
            return wanted, slot["duration_minutes"]
    raise ValidationError("chosen time is not an offered slot")
