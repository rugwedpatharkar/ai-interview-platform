from datetime import UTC, datetime, timedelta

import pytest

from app.errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    RateLimitedError,
    ValidationError,
)
from app.resources import scheduling
from app.resources.scheduler import reminder_sweep

_NOW = datetime(2026, 6, 20, 12, 0, tzinfo=UTC)
_SLOT_A = datetime(2026, 6, 24, 14, 0, tzinfo=UTC)
_SLOT_B = datetime(2026, 6, 25, 9, 0, tzinfo=UTC)


def _clock():
    return lambda: _NOW


def _iso(dt):
    return dt.isoformat()


def _manager(comp_id="c1"):
    return {"id": "rec1", "role": "recruiter", "comp_id": comp_id}


def _candidate(uid="cand1"):
    return {"id": uid, "role": "candidate", "comp_id": None}


def _application(state="interview_pending", comp_id="c1", candidate="cand1"):
    return {
        "_id": "app1",
        "comp_id": comp_id,
        "job_id": "job1",
        "candidate_user_id": candidate,
        "state": state,
    }


class _FakeApplications:
    def __init__(self, app=None):
        self._app = app

    async def get(self, application_id):
        return self._app


class _FakeSlots:
    def __init__(self):
        self.docs = []

    async def create(self, slots):
        self.docs.append(slots.model_dump())
        return str(len(self.docs))

    async def get_open_for_application(self, application_id):
        return next(
            (
                d
                for d in reversed(self.docs)
                if d["application_id"] == application_id and d["status"] == "open"
            ),
            None,
        )

    async def supersede_open(self, application_id):
        for d in self.docs:
            if d["application_id"] == application_id and d["status"] == "open":
                d["status"] = "superseded"


class _FakeBookings:
    def __init__(self):
        self.docs = {}

    async def create(self, booking):
        d = booking.model_dump()
        self.docs[d["application_id"]] = d
        return d["application_id"]

    async def get_by_application(self, application_id):
        return self.docs.get(application_id)

    async def choose_if_proposed(
        self,
        application_id,
        *,
        expected_version,
        chosen_start_at,
        duration_minutes,
        location,
    ):
        d = self.docs.get(application_id)
        if d is None or d["status"] != "proposed" or d["version"] != expected_version:
            return False
        d.update(
            status="booked",
            chosen_start_at=chosen_start_at,
            chosen_duration_minutes=duration_minutes,
            location=location,
            version=d["version"] + 1,
        )
        return True

    async def cancel_if(self, application_id, *, by):
        d = self.docs.get(application_id)
        if d is None or d["status"] not in ("proposed", "booked"):
            return False
        d.update(status="cancelled", cancelled_by=by, version=d["version"] + 1)
        return True

    async def reset_to_proposed(self, application_id, *, location, note):
        d = self.docs.get(application_id)
        if d is None:
            return False
        d.update(
            status="proposed",
            chosen_start_at=None,
            chosen_duration_minutes=0,
            location=location,
            note=note,
            reminded_24h=False,
            reminded_1h=False,
            version=d["version"] + 1,
        )
        return True

    async def stamp_reminder_if_unset(self, application_id, field):
        d = self.docs.get(application_id)
        if d is None or d.get(field):
            return False
        d[field] = True
        return True

    async def due_reminders(self, *, window_start, window_end):
        return [
            d
            for d in self.docs.values()
            if d["status"] == "booked"
            and d.get("chosen_start_at")
            and window_start <= d["chosen_start_at"] <= window_end
        ]

    async def complete_past(self, *, before):
        n = 0
        for d in self.docs.values():
            if (
                d["status"] == "booked"
                and d.get("chosen_start_at")
                and d["chosen_start_at"] < before
            ):
                d["status"] = "completed"
                n += 1
        return n

    async def list_for_candidate(self, candidate_user_id, *, skip=0, limit=20):
        rows = [
            d for d in self.docs.values() if d["candidate_user_id"] == candidate_user_id
        ]
        return rows[skip : skip + limit]

    async def count_for_candidate(self, candidate_user_id):
        return len(
            [
                d
                for d in self.docs.values()
                if d["candidate_user_id"] == candidate_user_id
            ]
        )

    async def list_for_company(self, comp_id, status=None, *, skip=0, limit=20):
        rows = [
            d
            for d in self.docs.values()
            if d["comp_id"] == comp_id and (status is None or d["status"] == status)
        ]
        return rows[skip : skip + limit]

    async def count_for_company(self, comp_id, status=None):
        return len(
            [
                d
                for d in self.docs.values()
                if d["comp_id"] == comp_id and (status is None or d["status"] == status)
            ]
        )


class _FakeLimiter:
    def __init__(self, allowed=True):
        self._allowed = allowed
        self.hits = []

    async def hit(self, key, limit, window):
        self.hits.append(key)
        return type("H", (), {"allowed": self._allowed, "retry_after": 30})()


class _FakeNotifications:
    def __init__(self):
        self.sent = []

    async def insert_dedup(self, notification):
        self.sent.append(notification)
        return True


def _repos(app):
    return _FakeApplications(app), _FakeSlots(), _FakeBookings()


async def _propose_one(apps, slots_repo, bookings, *, notifications=None, limiter=None):
    return await scheduling.propose_slots(
        _manager(),
        "app1",
        [{"start_at": _iso(_SLOT_A), "duration_minutes": 60}],
        "Google Meet",
        "see you",
        applications=apps,
        slots_repo=slots_repo,
        bookings=bookings,
        notifications=notifications,
        limiter=limiter,
        clock=_clock(),
    )


async def test_propose_creates_open_proposal_and_proposed_booking():
    apps, slots_repo, bookings = _repos(_application())
    notifications = _FakeNotifications()
    dto = await _propose_one(apps, slots_repo, bookings, notifications=notifications)
    assert dto["status"] == "proposed"
    assert len(dto["slots"]) == 1
    booking = bookings.docs["app1"]
    assert booking["status"] == "proposed" and booking["version"] == 0
    assert booking["candidate_user_id"] == "cand1" and booking["comp_id"] == "c1"
    # Best-effort candidate notification.
    assert any(n.kind == "interview_proposed" for n in notifications.sent)


async def test_propose_not_ready_state_rejected():
    apps, slots_repo, bookings = _repos(_application(state="aptitude_pending"))
    with pytest.raises(ValidationError):
        await _propose_one(apps, slots_repo, bookings)
    assert bookings.docs == {}  # nothing written when not ready


async def test_propose_requires_manager_and_tenant():
    apps, slots_repo, bookings = _repos(_application())
    with pytest.raises(ForbiddenError):
        await scheduling.propose_slots(
            _candidate(),
            "app1",
            [{"start_at": _iso(_SLOT_A), "duration_minutes": 60}],
            "",
            "",
            applications=apps,
            slots_repo=slots_repo,
            bookings=bookings,
            clock=_clock(),
        )
    cross = _FakeApplications(_application(comp_id="other"))
    with pytest.raises(NotFoundError):
        await scheduling.propose_slots(
            _manager(),
            "app1",
            [{"start_at": _iso(_SLOT_A), "duration_minutes": 60}],
            "",
            "",
            applications=cross,
            slots_repo=slots_repo,
            bookings=bookings,
            clock=_clock(),
        )


async def test_propose_slot_validation():
    apps, slots_repo, bookings = _repos(_application())
    # past slot
    with pytest.raises(ValidationError):
        await scheduling.propose_slots(
            _manager(),
            "app1",
            [{"start_at": _iso(_NOW - timedelta(days=1)), "duration_minutes": 60}],
            "",
            "",
            applications=apps,
            slots_repo=slots_repo,
            bookings=bookings,
            clock=_clock(),
        )
    # empty
    with pytest.raises(ValidationError):
        await scheduling.propose_slots(
            _manager(),
            "app1",
            [],
            "",
            "",
            applications=apps,
            slots_repo=slots_repo,
            bookings=bookings,
            clock=_clock(),
        )
    # bad duration
    with pytest.raises(ValidationError):
        await scheduling.propose_slots(
            _manager(),
            "app1",
            [{"start_at": _iso(_SLOT_A), "duration_minutes": 5}],
            "",
            "",
            applications=apps,
            slots_repo=slots_repo,
            bookings=bookings,
            clock=_clock(),
        )


async def test_propose_rate_limited():
    apps, slots_repo, bookings = _repos(_application())
    with pytest.raises(RateLimitedError):
        await _propose_one(
            apps, slots_repo, bookings, limiter=_FakeLimiter(allowed=False)
        )


async def test_choose_books_offered_slot_and_bumps_version():
    apps, slots_repo, bookings = _repos(_application())
    await _propose_one(apps, slots_repo, bookings)
    dto = await scheduling.choose_slot(
        _candidate(),
        "app1",
        _iso(_SLOT_A),
        applications=apps,
        slots_repo=slots_repo,
        bookings=bookings,
        clock=_clock(),
    )
    assert dto["status"] == "booked"
    assert bookings.docs["app1"]["version"] == 1
    assert bookings.docs["app1"]["chosen_duration_minutes"] == 60


async def test_choose_non_offered_slot_rejected_before_cas():
    apps, slots_repo, bookings = _repos(_application())
    await _propose_one(apps, slots_repo, bookings)
    with pytest.raises(ValidationError):
        await scheduling.choose_slot(
            _candidate(),
            "app1",
            _iso(_SLOT_B),
            applications=apps,
            slots_repo=slots_repo,
            bookings=bookings,
            clock=_clock(),
        )
    assert bookings.docs["app1"]["status"] == "proposed"  # untouched


async def test_choose_lost_race_is_already_exists():
    apps, slots_repo, bookings = _repos(_application())
    await _propose_one(apps, slots_repo, bookings)
    # First pick wins.
    await scheduling.choose_slot(
        _candidate(),
        "app1",
        _iso(_SLOT_A),
        applications=apps,
        slots_repo=slots_repo,
        bookings=bookings,
        clock=_clock(),
    )
    # A second pick (stale version) loses the CAS -> ConflictError (ALREADY_EXISTS).
    with pytest.raises(ConflictError):
        await scheduling.choose_slot(
            _candidate(),
            "app1",
            _iso(_SLOT_A),
            applications=apps,
            slots_repo=slots_repo,
            bookings=bookings,
            clock=_clock(),
        )


async def test_choose_requires_ownership():
    apps, slots_repo, bookings = _repos(_application(candidate="someone_else"))
    await _propose_one(apps, slots_repo, bookings)
    with pytest.raises(ForbiddenError):
        await scheduling.choose_slot(
            _candidate("intruder"),
            "app1",
            _iso(_SLOT_A),
            applications=apps,
            slots_repo=slots_repo,
            bookings=bookings,
            clock=_clock(),
        )


async def test_cancel_idempotent_and_marks_by():
    apps, slots_repo, bookings = _repos(_application())
    await _propose_one(apps, slots_repo, bookings)
    dto = await scheduling.cancel(
        _manager(),
        "app1",
        applications=apps,
        slots_repo=slots_repo,
        bookings=bookings,
    )
    assert dto["status"] == "cancelled" and dto["cancelled_by"] == "company"
    # Double-cancel is a no-op success (no raise).
    dto2 = await scheduling.cancel(
        _manager(),
        "app1",
        applications=apps,
        slots_repo=slots_repo,
        bookings=bookings,
    )
    assert dto2["status"] == "cancelled"


async def test_reschedule_resets_booking_to_proposed():
    apps, slots_repo, bookings = _repos(_application())
    await _propose_one(apps, slots_repo, bookings)
    await scheduling.choose_slot(
        _candidate(),
        "app1",
        _iso(_SLOT_A),
        applications=apps,
        slots_repo=slots_repo,
        bookings=bookings,
        clock=_clock(),
    )
    notifications = _FakeNotifications()
    dto = await scheduling.reschedule(
        _manager(),
        "app1",
        [{"start_at": _iso(_SLOT_B), "duration_minutes": 45}],
        "Office",
        "",
        applications=apps,
        slots_repo=slots_repo,
        bookings=bookings,
        notifications=notifications,
        clock=_clock(),
    )
    assert dto["status"] == "proposed"
    assert bookings.docs["app1"]["chosen_start_at"] is None
    assert any(n.kind == "interview_rescheduled" for n in notifications.sent)


async def test_get_schedule_either_role():
    apps, slots_repo, bookings = _repos(_application())
    await _propose_one(apps, slots_repo, bookings)
    mgr = await scheduling.get_schedule(
        _manager(), "app1", applications=apps, slots_repo=slots_repo, bookings=bookings
    )
    cand = await scheduling.get_schedule(
        _candidate(),
        "app1",
        applications=apps,
        slots_repo=slots_repo,
        bookings=bookings,
    )
    assert mgr["status"] == cand["status"] == "proposed"
    assert len(cand["slots"]) == 1


async def test_get_ics_only_when_booked():
    apps, slots_repo, bookings = _repos(_application())
    await _propose_one(apps, slots_repo, bookings)
    with pytest.raises(NotFoundError):
        await scheduling.get_ics(
            _candidate(), "app1", applications=apps, bookings=bookings, clock=_clock()
        )
    await scheduling.choose_slot(
        _candidate(),
        "app1",
        _iso(_SLOT_A),
        applications=apps,
        slots_repo=slots_repo,
        bookings=bookings,
        clock=_clock(),
    )
    out = await scheduling.get_ics(
        _candidate(), "app1", applications=apps, bookings=bookings, clock=_clock()
    )
    assert out["filename"].endswith(".ics")
    assert "BEGIN:VCALENDAR" in out["content"]
    assert "UID:aptura-interview-app1@aptura" in out["content"]


async def test_list_candidate_and_company_scoped():
    apps, slots_repo, bookings = _repos(_application())
    await _propose_one(apps, slots_repo, bookings)
    cand = await scheduling.list_candidate_interviews(
        _candidate(), bookings=bookings, page=1, page_size=20
    )
    assert cand["total"] == 1 and len(cand["bookings"]) == 1
    comp = await scheduling.list_company_bookings(
        _manager(), "", bookings=bookings, page=1, page_size=20
    )
    assert comp["total"] == 1


async def test_reminder_sweep_completes_past_and_sends_once():
    bookings = _FakeBookings()
    # A booking 30 min out (1h reminder window) + one in the past (to complete).
    bookings.docs["app1"] = {
        "application_id": "app1",
        "comp_id": "c1",
        "candidate_user_id": "cand1",
        "status": "booked",
        "chosen_start_at": _NOW + timedelta(minutes=30),
        "chosen_duration_minutes": 60,
        "version": 1,
        "reminded_24h": False,
        "reminded_1h": False,
    }
    bookings.docs["app2"] = {
        "application_id": "app2",
        "comp_id": "c1",
        "candidate_user_id": "cand2",
        "status": "booked",
        "chosen_start_at": _NOW - timedelta(hours=2),
        "chosen_duration_minutes": 60,
        "version": 1,
        "reminded_24h": True,
        "reminded_1h": True,
    }
    notifications = _FakeNotifications()
    sent = await reminder_sweep(
        bookings=bookings, notifications=notifications, now=_NOW
    )
    assert sent == 1
    assert bookings.docs["app1"]["reminded_1h"] is True
    assert bookings.docs["app2"]["status"] == "completed"
    # The reminder actually fired (catches a broken/missing notify path).
    assert any(n.kind == "interview_reminder" for n in notifications.sent)
    # Idempotent: a second sweep sends nothing new.
    assert (
        await reminder_sweep(bookings=bookings, notifications=notifications, now=_NOW)
        == 0
    )


@pytest.mark.asyncio
async def test_reminder_sweep_retries_on_notify_failure():
    # A transient notify failure must NOT stamp the flag, so the next tick retries —
    # otherwise the reminder is silently lost.
    bookings = _FakeBookings()
    bookings.docs["app1"] = {
        "application_id": "app1",
        "comp_id": "c1",
        "candidate_user_id": "cand1",
        "status": "booked",
        "chosen_start_at": _NOW + timedelta(minutes=30),
        "chosen_duration_minutes": 60,
        "version": 1,
        "reminded_24h": False,
        "reminded_1h": False,
    }

    class _FailingNotifications:
        async def insert_dedup(self, notification):
            raise RuntimeError("notify broker down")

    sent = await reminder_sweep(
        bookings=bookings, notifications=_FailingNotifications(), now=_NOW
    )
    assert sent == 0
    assert bookings.docs["app1"]["reminded_1h"] is False  # not stamped → retried
