import inspect
from datetime import UTC, datetime

import pytest

from app.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.model.interview import (
    CompetencyArea,
    InterviewBlueprint,
    InterviewTurnDecision,
)
from app.model.practice import GrowthFeedback, PracticeSession
from app.model.scoring import CompetencyScore, Evaluation
from app.resources import practice as practice_mod
from app.resources.practice import (
    _SynthJD,
    get_practice_feedback,
    list_practice_sessions,
    start_practice,
    submit_practice_turn,
)


class _FakeSessions:
    """In-memory practice store keyed by practice_id (mirrors RedisPracticeStore)."""

    def __init__(self):
        self.saved = {}

    async def save(self, session):
        self.saved[session.practice_id] = session

    async def get(self, practice_id):
        return self.saved.get(practice_id)


class _FakeData:
    def __init__(self, profile=None, summaries=None):
        self._profile = profile
        self.saved_summaries = []
        self._summaries = list(summaries or [])

    async def get_profile(self, user_id):
        return self._profile

    async def save_practice_summary(self, user_id, summary):
        self.saved_summaries.append((user_id, summary))

    async def get_practice_summary(self, user_id, practice_id):
        return next(
            (
                s
                for s in self._summaries
                if s["user_id"] == user_id and s["practice_id"] == practice_id
            ),
            None,
        )

    async def list_practice_summaries(self, user_id):
        return [s for s in self._summaries if s["user_id"] == user_id]


class _SchemaLLM:
    """Returns the registered object for each requested output schema."""

    def __init__(self, mapping):
        self._mapping = mapping

    async def structured(self, prompt, schema):
        return self._mapping[schema]


def _blueprint():
    return InterviewBlueprint(
        competencies=[CompetencyArea(name="Python"), CompetencyArea(name="APIs")],
        time_budget_min=30,
    )


def _clock():
    return lambda: datetime(2026, 6, 20, 12, 0, 0, tzinfo=UTC)


async def test_start_practice_topic_synthesizes_jd_and_persists_session():
    sessions = _FakeSessions()
    data = _FakeData(profile={"headline": "Eng", "skills": ["python"]})
    llm = _SchemaLLM(
        {
            _SynthJD: _SynthJD(jd_text="A backend role."),
            InterviewBlueprint: _blueprint(),
            InterviewTurnDecision: InterviewTurnDecision(question="Q1?"),
        }
    )
    practice_id, question = await start_practice(
        topic="Backend Python",
        jd_text=None,
        caller_user_id="u1",
        data=data,
        sessions=sessions,
        llm=llm,
        clock=_clock(),
    )
    assert question == "Q1?"
    session = sessions.saved[practice_id]
    assert session.user_id == "u1"
    assert session.role_label == "Backend Python"
    assert session.jd_text == "A backend role."  # synthesized from the topic
    assert session.status == "in_progress"
    assert session.current_question == "Q1?"


async def test_start_practice_jd_text_used_verbatim_no_synthesis():
    sessions = _FakeSessions()
    data = _FakeData(profile=None)  # exercises the minimal-profile fallback
    llm = _SchemaLLM(
        {
            InterviewBlueprint: _blueprint(),
            InterviewTurnDecision: InterviewTurnDecision(question="Q1?"),
        }
    )
    practice_id, _ = await start_practice(
        topic=None,
        jd_text="Senior SRE. Owns reliability.",
        caller_user_id="u1",
        data=data,
        sessions=sessions,
        llm=llm,
    )
    session = sessions.saved[practice_id]
    assert session.jd_text == "Senior SRE. Owns reliability."
    assert session.role_label == "Pasted job description"


async def test_start_practice_requires_exactly_one_source():
    sessions, data, llm = _FakeSessions(), _FakeData(), _SchemaLLM({})
    with pytest.raises(ValidationError):
        await start_practice(
            topic="",
            jd_text="",
            caller_user_id="u1",
            data=data,
            sessions=sessions,
            llm=llm,
        )
    with pytest.raises(ValidationError):
        await start_practice(
            topic="x",
            jd_text="y",
            caller_user_id="u1",
            data=data,
            sessions=sessions,
            llm=llm,
        )


async def test_submit_turn_asks_next_question_when_not_done():
    sessions, data = _FakeSessions(), _FakeData()
    await sessions.save(
        PracticeSession(
            practice_id="p1",
            user_id="u1",
            blueprint=_blueprint(),
            current_question="Q1?",
            started_at=_clock()().isoformat(),
        )
    )
    llm = _SchemaLLM(
        {InterviewTurnDecision: InterviewTurnDecision(done=False, question="Q2?")}
    )
    decision = await submit_practice_turn(
        "p1",
        "my answer",
        caller_user_id="u1",
        sessions=sessions,
        data=data,
        llm=llm,
        clock=_clock(),
    )
    assert decision.done is False
    assert decision.question == "Q2?"
    saved = sessions.saved["p1"]
    assert saved.current_question == "Q2?"
    assert len(saved.transcript.turns) == 1
    assert saved.transcript.turns[0].answer == "my answer"


async def test_submit_turn_done_finalizes_and_persists_summary_no_publisher():
    sessions, data = _FakeSessions(), _FakeData()
    await sessions.save(
        PracticeSession(
            practice_id="p1",
            user_id="u1",
            role_label="Backend",
            jd_text="JD",
            blueprint=_blueprint(),
            current_question="Q1?",
            started_at=_clock()().isoformat(),
            created_at=_clock()().isoformat(),
        )
    )
    llm = _SchemaLLM(
        {
            InterviewTurnDecision: InterviewTurnDecision(done=True),
            Evaluation: Evaluation(
                competency_scores=[CompetencyScore(competency="Python", score=0.9)],
                overall_score=0.9,
            ),
            GrowthFeedback: GrowthFeedback(summary="Nice work.", strengths=["Python"]),
        }
    )
    decision = await submit_practice_turn(
        "p1",
        "final answer",
        caller_user_id="u1",
        sessions=sessions,
        data=data,
        llm=llm,
        clock=_clock(),
    )
    assert decision.done is True
    assert sessions.saved["p1"].status == "completed"
    assert len(data.saved_summaries) == 1
    user_id, summary = data.saved_summaries[0]
    assert user_id == "u1"
    assert summary["practice_id"] == "p1"
    assert summary["feedback"]["summary"] == "Nice work."
    # Detached: the persisted artifact carries no funnel identifiers.
    assert "comp_id" not in summary and "application_id" not in summary


async def test_submit_turn_ownership_and_state_guards():
    sessions, data, llm = _FakeSessions(), _FakeData(), _SchemaLLM({})
    with pytest.raises(NotFoundError):
        await submit_practice_turn(
            "nope", "a", caller_user_id="u1", sessions=sessions, data=data, llm=llm
        )
    await sessions.save(
        PracticeSession(
            practice_id="p1",
            user_id="owner",
            blueprint=_blueprint(),
            current_question="Q?",
        )
    )
    with pytest.raises(ForbiddenError):
        await submit_practice_turn(
            "p1", "a", caller_user_id="intruder", sessions=sessions, data=data, llm=llm
        )
    await sessions.save(
        PracticeSession(
            practice_id="p2", user_id="u1", status="completed", blueprint=_blueprint()
        )
    )
    with pytest.raises(ConflictError):
        await submit_practice_turn(
            "p2", "a", caller_user_id="u1", sessions=sessions, data=data, llm=llm
        )


async def test_get_feedback_returns_summary_else_409_or_404():
    sessions = _FakeSessions()
    summary = {"user_id": "u1", "practice_id": "p1", "feedback": {}, "role_label": "x"}
    data = _FakeData(summaries=[summary])
    assert (
        await get_practice_feedback(
            "p1", caller_user_id="u1", data=data, sessions=sessions
        )
        == summary
    )
    await sessions.save(
        PracticeSession(
            practice_id="p2", user_id="u1", status="in_progress", blueprint=_blueprint()
        )
    )
    with pytest.raises(ConflictError):
        await get_practice_feedback(
            "p2", caller_user_id="u1", data=data, sessions=sessions
        )
    with pytest.raises(NotFoundError):
        await get_practice_feedback(
            "ghost", caller_user_id="u1", data=data, sessions=sessions
        )


async def test_list_sessions_compact_owner_scoped_projection():
    data = _FakeData(
        summaries=[
            {
                "user_id": "u1",
                "practice_id": "p1",
                "role_label": "Backend",
                "created_at": "t1",
                "feedback": {"summary": "private"},
            },
            {
                "user_id": "u2",
                "practice_id": "p9",
                "role_label": "Other",
                "created_at": "t9",
            },
        ]
    )
    out = await list_practice_sessions(caller_user_id="u1", data=data)
    assert out == [{"practice_id": "p1", "role_label": "Backend", "created_at": "t1"}]
    assert "feedback" not in out[0]  # compact projection — no transcript/feedback leak


def test_detached_invariant_no_publisher_in_signatures():
    # The detached invariant at the type level: practice resources take NO publisher,
    # so emitting a funnel event is impossible by construction.
    for fn in (start_practice, submit_practice_turn, practice_mod._finalize):
        assert "publisher" not in inspect.signature(fn).parameters
