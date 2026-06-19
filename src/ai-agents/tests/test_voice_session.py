"""Voice interview orchestrator tests (Task 7 — Tier C TDD).

All tests run offline: engines/room/LLM are fakes from conftest.py.
No LiveKit, Groq, or network calls.

Verifies:
  - Happy path: N scripted answers drive N turns then finalizes;
    interview.completed published exactly once; saved transcript has right turns.
  - Hangup: transport returns "" mid-interview → finalizes partial transcript
    with one interview.completed.
  - Budget exhaustion: the clock can be injected to trigger the time-budget
    guard; the loop finalizes exactly once.
  - Idempotency/parity: _finalize is called exactly once (no double-publish).
  - Failure resilience: an engine error leaves the session in_progress in Redis.
"""

from datetime import UTC, datetime, timedelta

import pytest

from app.model.interview import (
    CompetencyArea,
    InterviewBlueprint,
    InterviewTurnDecision,
)
from app.resources.voice.session import run_voice_interview

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _setup():
    return {
        "comp_id": "c1",
        "job_id": "j1",
        "candidate_user_id": "u1",
        "jd_text": "Backend role",
        "profile": {"headline": "Engineer", "skills": ["python"]},
        "state": "interview_pending",
    }


def _blueprint(minutes=30):
    return InterviewBlueprint(
        competencies=[CompetencyArea(name="python")],
        time_budget_min=minutes,
    )


class _ScriptedLLM:
    """LLM that sequences through decisions per schema.

    start_interview needs InterviewBlueprint first then InterviewTurnDecisions
    for each next_question call.
    """

    def __init__(self, blueprint, decisions):
        self._blueprint = blueprint
        self._decisions = iter(decisions)

    async def structured(self, prompt, schema):
        if schema is InterviewBlueprint:
            return self._blueprint
        return next(self._decisions)


class _ScriptedTransport:
    """Scripted voice transport: sequences through given answers per ask() call.

    Returns "" when answers are exhausted (simulates hangup).
    Records all questions asked.
    """

    def __init__(self, answers):
        self._answers = iter(answers)
        self.questions = []

    async def ask(self, question: str) -> str:
        self.questions.append(question)
        return next(self._answers, "")


# ---------------------------------------------------------------------------
# Happy path — full interview drives N turns then finalizes
# ---------------------------------------------------------------------------


async def test_happy_path_drives_all_turns_and_finalizes(
    fake_data, fake_sessions, fake_publisher
):
    """A scripted transport with 2 answers drives 2 turns then finalizes."""
    blueprint = _blueprint()
    llm = _ScriptedLLM(
        blueprint,
        [
            InterviewTurnDecision(done=False, question="Q1"),
            InterviewTurnDecision(done=False, question="Q2"),
            InterviewTurnDecision(done=True),  # after second answer: done
        ],
    )
    transport = _ScriptedTransport(["Answer 1", "Answer 2"])
    sessions = fake_sessions()
    data = fake_data(interview_setup=_setup())
    pub = fake_publisher()

    await run_voice_interview(
        "a1",
        transport=transport,
        caller_user_id="u1",
        data=data,
        sessions=sessions,
        llm=llm,
        publisher=pub,
    )

    # interview.completed published exactly once
    completed = [(k, v) for k, v in pub.events if k == "interview.completed"]
    assert len(completed) == 1
    assert completed[0][1]["application_id"] == "a1"

    # Session is completed
    assert sessions.saved["a1"].status == "completed"

    # Transcript has both turns in order
    turns = sessions.saved["a1"].transcript.turns
    assert len(turns) == 2
    assert turns[0].question == "Q1"
    assert turns[0].answer == "Answer 1"
    assert turns[1].question == "Q2"
    assert turns[1].answer == "Answer 2"

    # Data gateway received the interview save
    assert "a1" in data.saved_interviews


async def test_happy_path_single_turn_interview(
    fake_data, fake_sessions, fake_publisher
):
    """A one-question interview finalizes after the first answer."""
    blueprint = _blueprint()
    llm = _ScriptedLLM(
        blueprint,
        [
            InterviewTurnDecision(done=False, question="Only question"),
            InterviewTurnDecision(done=True),
        ],
    )
    transport = _ScriptedTransport(["My only answer"])
    sessions = fake_sessions()
    data = fake_data(interview_setup=_setup())
    pub = fake_publisher()

    await run_voice_interview(
        "a1",
        transport=transport,
        caller_user_id="u1",
        data=data,
        sessions=sessions,
        llm=llm,
        publisher=pub,
    )

    completed = [k for k, _ in pub.events if k == "interview.completed"]
    assert len(completed) == 1
    assert sessions.saved["a1"].status == "completed"
    assert sessions.saved["a1"].transcript.turns[0].answer == "My only answer"


# ---------------------------------------------------------------------------
# Hangup — transport returns "" mid-interview
# ---------------------------------------------------------------------------


async def test_hangup_mid_interview_finalizes_partial_transcript(
    fake_data, fake_sessions, fake_publisher
):
    """Candidate hangs up after answering Q1; partial transcript is finalized."""
    blueprint = _blueprint()
    llm = _ScriptedLLM(
        blueprint,
        [
            InterviewTurnDecision(done=False, question="Q1"),
            InterviewTurnDecision(done=False, question="Q2"),
        ],
    )
    # Transport answers Q1 then returns "" (hangup) for Q2.
    transport = _ScriptedTransport(["Answer to Q1", ""])
    sessions = fake_sessions()
    data = fake_data(interview_setup=_setup())
    pub = fake_publisher()

    await run_voice_interview(
        "a1",
        transport=transport,
        caller_user_id="u1",
        data=data,
        sessions=sessions,
        llm=llm,
        publisher=pub,
    )

    # Finalized exactly once despite partial transcript
    completed = [k for k, _ in pub.events if k == "interview.completed"]
    assert len(completed) == 1
    assert sessions.saved["a1"].status == "completed"

    # Both turns recorded: the real answer + the hangup empty answer
    turns = sessions.saved["a1"].transcript.turns
    assert len(turns) == 2
    assert turns[0].answer == "Answer to Q1"
    assert turns[1].answer == ""  # the hangup empty answer is recorded


async def test_hangup_on_first_question_finalizes_empty_transcript(
    fake_data, fake_sessions, fake_publisher
):
    """Candidate hangs up immediately — empty transcript is still finalized."""
    blueprint = _blueprint()
    llm = _ScriptedLLM(
        blueprint,
        [InterviewTurnDecision(done=False, question="Q1")],
    )
    transport = _ScriptedTransport([""])  # immediate hangup
    sessions = fake_sessions()
    data = fake_data(interview_setup=_setup())
    pub = fake_publisher()

    await run_voice_interview(
        "a1",
        transport=transport,
        caller_user_id="u1",
        data=data,
        sessions=sessions,
        llm=llm,
        publisher=pub,
    )

    completed = [k for k, _ in pub.events if k == "interview.completed"]
    assert len(completed) == 1
    assert sessions.saved["a1"].status == "completed"
    assert len(sessions.saved["a1"].transcript.turns) == 1
    assert sessions.saved["a1"].transcript.turns[0].answer == ""


# ---------------------------------------------------------------------------
# Budget exhaustion — the clock can be injected to trigger the guard
# ---------------------------------------------------------------------------


async def test_budget_exhaustion_finalizes_and_publishes_completed(
    fake_data, fake_sessions, fake_publisher
):
    """Time budget expires after first turn; loop finalizes even if LLM continues."""
    start = datetime(2026, 1, 1, tzinfo=UTC)
    # Budget is 1 minute; clock returns start for the first call (seeding
    # started_at) then jumps 2 minutes to exceed the budget on the check.
    call_count = 0

    def _clock():
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return start
        return start + timedelta(minutes=2)

    blueprint = _blueprint(minutes=1)
    llm = _ScriptedLLM(
        blueprint,
        [
            InterviewTurnDecision(done=False, question="Q1"),
            InterviewTurnDecision(done=False, question="Q2"),  # LLM wants to continue
        ],
    )
    transport = _ScriptedTransport(["Budget answer"])
    sessions = fake_sessions()
    data = fake_data(interview_setup=_setup())
    pub = fake_publisher()

    await run_voice_interview(
        "a1",
        transport=transport,
        caller_user_id="u1",
        data=data,
        sessions=sessions,
        llm=llm,
        publisher=pub,
        clock=_clock,
    )

    # Finalized exactly once via the budget guard
    completed = [k for k, _ in pub.events if k == "interview.completed"]
    assert len(completed) == 1
    assert sessions.saved["a1"].status == "completed"
    assert "a1" in data.saved_interviews


# ---------------------------------------------------------------------------
# Idempotency — no double-publish
# ---------------------------------------------------------------------------


async def test_no_double_publish_on_clean_finalize(
    fake_data, fake_sessions, fake_publisher
):
    """_finalize is called exactly once — no duplicate interview.completed events."""
    blueprint = _blueprint()
    llm = _ScriptedLLM(
        blueprint,
        [
            InterviewTurnDecision(done=False, question="Q1"),
            InterviewTurnDecision(done=True),
        ],
    )
    transport = _ScriptedTransport(["Only answer"])
    sessions = fake_sessions()
    data = fake_data(interview_setup=_setup())
    pub = fake_publisher()

    await run_voice_interview(
        "a1",
        transport=transport,
        caller_user_id="u1",
        data=data,
        sessions=sessions,
        llm=llm,
        publisher=pub,
    )

    all_completed = [k for k, _ in pub.events if k == "interview.completed"]
    assert len(all_completed) == 1


# ---------------------------------------------------------------------------
# Failure resilience — engine error leaves session resumable
# ---------------------------------------------------------------------------


class _BoomTransport:
    """Transport that raises after the first successful ask."""

    def __init__(self, first_answer):
        self._first = first_answer
        self._called = 0
        self.questions = []

    async def ask(self, question: str) -> str:
        self.questions.append(question)
        self._called += 1
        if self._called == 1:
            return self._first
        raise RuntimeError("transport exploded")


async def test_engine_failure_leaves_session_in_progress(
    fake_data, fake_sessions, fake_publisher
):
    """A transport failure during the loop leaves session in_progress (resumable)."""
    blueprint = _blueprint()
    llm = _ScriptedLLM(
        blueprint,
        [
            InterviewTurnDecision(done=False, question="Q1"),
            InterviewTurnDecision(done=False, question="Q2"),
        ],
    )
    transport = _BoomTransport("First answer")
    sessions = fake_sessions()
    data = fake_data(interview_setup=_setup())
    pub = fake_publisher()

    with pytest.raises(RuntimeError, match="transport exploded"):
        await run_voice_interview(
            "a1",
            transport=transport,
            caller_user_id="u1",
            data=data,
            sessions=sessions,
            llm=llm,
            publisher=pub,
        )

    # Session must be in_progress (not completed) so the reaper can pick it up
    assert sessions.saved["a1"].status == "in_progress"
    # No interview.completed was emitted
    assert all(k != "interview.completed" for k, _ in pub.events)


# ---------------------------------------------------------------------------
# Transcript parity with text path
# ---------------------------------------------------------------------------


async def test_transcript_shape_matches_text_path(
    fake_data, fake_sessions, fake_publisher
):
    """The saved transcript has the same model shape as the text submit_turn path."""
    blueprint = _blueprint()
    llm = _ScriptedLLM(
        blueprint,
        [
            InterviewTurnDecision(done=False, question="Tell me about Python"),
            InterviewTurnDecision(done=True),
        ],
    )
    transport = _ScriptedTransport(["I love Python"])
    sessions = fake_sessions()
    data = fake_data(interview_setup=_setup())
    pub = fake_publisher()

    await run_voice_interview(
        "a1",
        transport=transport,
        caller_user_id="u1",
        data=data,
        sessions=sessions,
        llm=llm,
        publisher=pub,
    )

    saved_doc = data.saved_interviews["a1"]
    # The transcript key must exist with turns as dicts (model_dump)
    assert "transcript" in saved_doc
    turns = saved_doc["transcript"]["turns"]
    assert len(turns) == 1
    assert turns[0]["question"] == "Tell me about Python"
    assert turns[0]["answer"] == "I love Python"
    # Blueprint and job_id must also be present (unchanged scoring path needs them)
    assert "blueprint" in saved_doc
    assert saved_doc["job_id"] == "j1"
    assert saved_doc["user_id"] == "u1"
