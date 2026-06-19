"""Unit tests for the voice_worker webhook decision logic (Task 9).

Only the pure ``should_start_session`` function and the ``cancel_in_flight``
helper are tested here — no I/O, no LiveKit connection, no uvicorn server.
The live media path (LiveKit room, Groq STT, edge-tts) is verified manually
in E2E.

Test matrix:
  - participant_joined for an interview room with a candidate identity → application_id
  - event type other than participant_joined → None
  - room name that does not match the interview-{id} pattern → None
  - joining identity is the worker (has the worker prefix) → None
  - room already in-flight (duplicate event before task starts) → None
  - room name with a complex application_id (hyphens, digits) → correct extraction
  - cancel_in_flight: cancels all tasks, noop on empty, bounded by timeout
"""

import asyncio

import pytest

from app.service.voice_worker import cancel_in_flight, should_start_session

# Default test constants
_WORKER_PREFIX = "agent-"
_ROOM = "interview-app123"
_APP_ID = "app123"
_CANDIDATE = "user-abc"
_WORKER_IDENTITY = "agent-app123"


def _in_flight(*ids: str) -> set[str]:
    return set(ids)


# ---------------------------------------------------------------------------
# Happy path — should return the application_id
# ---------------------------------------------------------------------------


def test_participant_joined_candidate_returns_application_id():
    result = should_start_session(
        "participant_joined", _ROOM, _CANDIDATE, _WORKER_PREFIX, _in_flight()
    )
    assert result == _APP_ID


def test_complex_application_id_with_hyphens():
    """application_id may contain hyphens (UUID-style); the regex captures all of it."""
    room = "interview-550e8400-e29b-41d4-a716-446655440000"
    expected = "550e8400-e29b-41d4-a716-446655440000"
    result = should_start_session(
        "participant_joined", room, _CANDIDATE, _WORKER_PREFIX, _in_flight()
    )
    assert result == expected


def test_application_id_with_digits_only():
    result = should_start_session(
        "participant_joined", "interview-42", "some-user", _WORKER_PREFIX, _in_flight()
    )
    assert result == "42"


# ---------------------------------------------------------------------------
# Wrong event type — should return None
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "event_type",
    [
        "participant_left",
        "room_started",
        "room_finished",
        "track_published",
        "",
        "PARTICIPANT_JOINED",  # case-sensitive check
    ],
)
def test_non_participant_joined_event_returns_none(event_type):
    result = should_start_session(
        event_type, _ROOM, _CANDIDATE, _WORKER_PREFIX, _in_flight()
    )
    assert result is None


# ---------------------------------------------------------------------------
# Non-interview room — should return None
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "room_name",
    [
        "lobby",
        "test-room",
        "Interview-app123",  # capital I — case-sensitive
        "interview_app123",  # underscore, not hyphen
        "",
        "interview-",  # nothing after the hyphen
    ],
)
def test_non_interview_room_returns_none(room_name):
    result = should_start_session(
        "participant_joined", room_name, _CANDIDATE, _WORKER_PREFIX, _in_flight()
    )
    assert result is None


# ---------------------------------------------------------------------------
# Worker identity — should return None (agent joining its own room)
# ---------------------------------------------------------------------------


def test_worker_identity_returns_none():
    result = should_start_session(
        "participant_joined", _ROOM, _WORKER_IDENTITY, _WORKER_PREFIX, _in_flight()
    )
    assert result is None


def test_worker_prefix_match_is_startswith():
    """Any identity starting with the prefix (not just exact match) is a worker."""
    result = should_start_session(
        "participant_joined",
        _ROOM,
        "agent-some-other-value",
        _WORKER_PREFIX,
        _in_flight(),
    )
    assert result is None


def test_custom_worker_prefix():
    """The prefix is configurable; a different prefix should be respected."""
    result = should_start_session(
        "participant_joined", _ROOM, "bot-app123", "bot-", _in_flight()
    )
    assert result is None


def test_candidate_identity_not_matching_prefix_is_allowed():
    """An identity that does not start with the worker prefix is a candidate."""
    result = should_start_session(
        "participant_joined", _ROOM, "user-12345", _WORKER_PREFIX, _in_flight()
    )
    assert result == _APP_ID


# ---------------------------------------------------------------------------
# Already in-flight — should return None (guard against double-spawn)
# ---------------------------------------------------------------------------


def test_already_in_flight_returns_none():
    result = should_start_session(
        "participant_joined", _ROOM, _CANDIDATE, _WORKER_PREFIX, _in_flight(_APP_ID)
    )
    assert result is None


def test_different_room_in_flight_does_not_block():
    """Only the specific application_id being requested is checked in in_flight."""
    result = should_start_session(
        "participant_joined",
        _ROOM,
        _CANDIDATE,
        _WORKER_PREFIX,
        _in_flight("other-app-id"),
    )
    assert result == _APP_ID


def test_in_flight_set_is_not_mutated_by_should_start():
    """should_start_session is a pure read of in_flight — it does not add to it."""
    in_flight: set[str] = set()
    should_start_session(
        "participant_joined", _ROOM, _CANDIDATE, _WORKER_PREFIX, in_flight
    )
    assert len(in_flight) == 0


# ---------------------------------------------------------------------------
# cancel_in_flight — shutdown helper
# ---------------------------------------------------------------------------


async def test_cancel_in_flight_cancels_all_tasks():
    """All tasks in the registry are cancelled and awaited."""
    d: dict[str, asyncio.Task] = {}
    for i in range(3):
        d[str(i)] = asyncio.ensure_future(asyncio.sleep(3600))

    await cancel_in_flight(d, timeout=1.0)

    assert all(t.cancelled() for t in d.values())


async def test_cancel_in_flight_empty_is_noop():
    """cancel_in_flight on an empty dict returns without error."""
    await cancel_in_flight({}, timeout=1.0)  # must not raise


async def test_cancel_in_flight_bounded_by_timeout():
    """cancel_in_flight returns within the timeout even if a task is slow to cancel."""

    async def _stubborn():
        try:
            await asyncio.sleep(3600)
        except asyncio.CancelledError:
            # Swallow cancel and sleep again — simulates a task that ignores cancellation
            await asyncio.sleep(3600)

    d: dict[str, asyncio.Task] = {"stubborn": asyncio.ensure_future(_stubborn())}
    # Should return quickly (timeout=0.05) rather than hanging
    await cancel_in_flight(d, timeout=0.05)
    # Task was cancelled (first CancelledError was delivered)
    assert d["stubborn"].cancelled() or d["stubborn"].done()
