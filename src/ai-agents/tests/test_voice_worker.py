"""Unit tests for the voice_worker webhook decision logic (Task 9).

Only the pure ``should_start_session`` function is tested here — it has no I/O,
no LiveKit connection, and no uvicorn server.  The live media path (LiveKit room,
Groq STT, edge-tts) is verified manually in E2E.

Test matrix:
  - participant_joined for an interview room with a candidate identity → application_id
  - event type other than participant_joined → None
  - room name that does not match the interview-{id} pattern → None
  - joining identity is the worker (has the worker prefix) → None
  - room already in-flight (duplicate event before task starts) → None
  - room name with a complex application_id (hyphens, digits) → correct extraction
"""

import pytest

from app.service.voice_worker import should_start_session

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
