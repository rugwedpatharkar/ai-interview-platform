import pytest

from app.errors import InvalidTransition, NotFoundError
from app.model.application import Application
from app.resources import funnel


def test_next_state_happy_path():
    assert funnel.next_state("applied", "application.created", {}) == "aptitude_pending"
    assert (
        funnel.next_state("aptitude_pending", "aptitude.graded", {"passed": True})
        == "interview_pending"
    )
    assert (
        funnel.next_state("aptitude_pending", "aptitude.graded", {"passed": False})
        == "gated_out"
    )
    assert (
        funnel.next_state("interview_pending", "interview.completed", {})
        == "interviewed"
    )
    assert funnel.next_state("interviewed", "scoring.completed", {}) == "scored"
    assert (
        funnel.next_state("scored", "recruiter.decision", {"outcome": "hired"})
        == "hired"
    )
    # a shortlisted candidate can still be moved to a final decision (hire/reject)
    assert (
        funnel.next_state("shortlisted", "recruiter.decision", {"outcome": "hired"})
        == "hired"
    )


def test_next_state_illegal_transitions_raise():
    with pytest.raises(InvalidTransition):
        funnel.next_state("applied", "scoring.completed", {})
    with pytest.raises(InvalidTransition):
        funnel.next_state("scored", "recruiter.decision", {"outcome": "bogus"})


def test_retryable_conflict_targets_async_handoff_events():
    # scoring.completed can be processed before interview.completed advances the state
    # (the async interview->scoring handoff under concurrent consumption). Such an
    # InvalidTransition must be requeued (retried -> DLX), not dropped-and-acked, or the
    # application strands unscored. User/system edge events aren't part of that race.
    assert funnel.is_retryable_conflict("scoring.completed") is True
    assert funnel.is_retryable_conflict("interview.completed") is True
    assert funnel.is_retryable_conflict("application.withdrawn") is False
    assert funnel.is_retryable_conflict("recruiter.decision") is False


def test_next_state_edge_transitions():
    # withdraw / expire allowed from any non-terminal state
    assert funnel.next_state("applied", "application.withdrawn", {}) == "withdrawn"
    assert (
        funnel.next_state("interview_pending", "application.withdrawn", {})
        == "withdrawn"
    )
    assert funnel.next_state("aptitude_pending", "application.expired", {}) == "expired"
    # abandon only from the interview-pending state
    assert (
        funnel.next_state("interview_pending", "interview.abandoned", {}) == "abandoned"
    )


def test_next_state_edge_transitions_rejected_from_terminal():
    for terminal in ("hired", "rejected", "shortlisted", "withdrawn", "expired"):
        with pytest.raises(InvalidTransition):
            funnel.next_state(terminal, "application.withdrawn", {})
    # abandon is not legal outside an interview
    with pytest.raises(InvalidTransition):
        funnel.next_state("applied", "interview.abandoned", {})


@pytest.mark.asyncio
async def test_advance_application_updates_state_and_audits(fakes):
    app_id = await fakes["applications"].insert(
        Application(comp_id="c1", job_id="j1", candidate_user_id="u1", state="applied")
    )
    new = await funnel.advance_application(
        app_id,
        "application.created",
        {},
        applications=fakes["applications"],
        audit=fakes["audit"],
    )
    assert new == "aptitude_pending"
    assert (await fakes["applications"].get(app_id))["state"] == "aptitude_pending"
    record = fakes["audit"].records[0]
    assert record["action"] == "application.created"
    assert record["from_state"] == "applied"
    assert record["to_state"] == "aptitude_pending"


@pytest.mark.asyncio
async def test_advance_records_transition_timing(fakes):
    # The funnel CAS appends a {state, at} entry to the application's transitions log so
    # CompanyProfile / Analytics can derive stage timings (applied -> first decision).
    app_id = await fakes["applications"].insert(
        Application(comp_id="c1", job_id="j1", candidate_user_id="u1", state="applied")
    )
    assert (await fakes["applications"].get(app_id))["transitions"] == []
    await funnel.advance_application(
        app_id,
        "application.created",
        {},
        applications=fakes["applications"],
        audit=fakes["audit"],
    )
    transitions = (await fakes["applications"].get(app_id))["transitions"]
    assert len(transitions) == 1
    assert transitions[0]["state"] == "aptitude_pending"
    assert transitions[0]["at"] is not None


@pytest.mark.asyncio
async def test_failed_cas_records_no_transition(fakes):
    app_id = await fakes["applications"].insert(
        Application(comp_id="c1", job_id="j1", candidate_user_id="u1", state="applied")
    )
    # CAS miss (wrong expected state) must not append a transition.
    moved = await fakes["applications"].set_state_if(app_id, "scored", "hired")
    assert moved is False
    assert (await fakes["applications"].get(app_id))["transitions"] == []


@pytest.mark.asyncio
async def test_advance_unknown_application_raises(fakes):
    with pytest.raises(NotFoundError):
        await funnel.advance_application(
            "nope",
            "application.created",
            {},
            applications=fakes["applications"],
            audit=fakes["audit"],
        )


class _RaceRepo:
    """Simulates a concurrent double-write: the CAS fails but the re-read shows the row
    already at the same target (a benign race loser)."""

    def __init__(self):
        self.calls = 0

    async def get(self, _id):
        self.calls += 1
        state = "applied" if self.calls == 1 else "aptitude_pending"
        return {"_id": _id, "state": state, "comp_id": "c1"}

    async def set_state_if(self, _id, expected, new):
        return False


class _ConflictRepo:
    """CAS fails and the row has moved elsewhere — a genuine conflict."""

    def __init__(self):
        self.calls = 0

    async def get(self, _id):
        self.calls += 1
        state = "applied" if self.calls == 1 else "withdrawn"
        return {"_id": _id, "state": state, "comp_id": "c1"}

    async def set_state_if(self, _id, expected, new):
        return False


@pytest.mark.asyncio
async def test_advance_concurrent_double_write_is_noop(fakes):
    result = await funnel.advance_application(
        "a1", "application.created", {}, applications=_RaceRepo(), audit=fakes["audit"]
    )
    assert result == "aptitude_pending"
    assert fakes["audit"].records == []  # the race loser writes no second audit row


@pytest.mark.asyncio
async def test_advance_conflict_raises(fakes):
    with pytest.raises(InvalidTransition):
        await funnel.advance_application(
            "a1",
            "application.created",
            {},
            applications=_ConflictRepo(),
            audit=fakes["audit"],
        )
    assert fakes["audit"].records == []  # no audit row on a genuine conflict
