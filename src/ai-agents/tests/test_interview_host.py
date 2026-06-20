from datetime import UTC, datetime, timedelta

import pytest

from app.errors import ConflictError, ForbiddenError, NotFoundError
from app.model.interview import (
    CompetencyArea,
    InterviewBlueprint,
    InterviewSession,
    InterviewTurnDecision,
)
from app.resources.interview_host import abandon_stale, start_interview, submit_turn


def _setup():
    return {
        "comp_id": "c1",
        "job_id": "j1",
        "candidate_user_id": "u1",
        "jd_text": "Backend role",
        "profile": {"headline": "Engineer", "skills": ["python"]},
        "state": "interview_pending",
    }


def _session(**kw):
    base = {
        "application_id": "a1",
        "comp_id": "c1",
        "candidate_user_id": "u1",
        "blueprint": InterviewBlueprint(competencies=[CompetencyArea(name="python")]),
    }
    return InterviewSession(**{**base, **kw})


async def test_start_interview_builds_plan_and_first_question(
    fake_llm_by_schema, fake_data, fake_sessions
):
    blueprint = InterviewBlueprint(competencies=[CompetencyArea(name="python")])
    first = InterviewTurnDecision(done=False, question="Explain async")
    llm = fake_llm_by_schema(
        {InterviewBlueprint: blueprint, InterviewTurnDecision: first}
    )
    sessions = fake_sessions()
    question = await start_interview(
        "a1",
        caller_user_id="u1",
        data=fake_data(interview_setup=_setup()),
        sessions=sessions,
        llm=llm,
    )
    assert question == "Explain async"
    assert sessions.saved["a1"].current_question == "Explain async"
    assert sessions.saved["a1"].comp_id == "c1"


async def test_start_interview_missing_setup_raises(fake_llm, fake_data, fake_sessions):
    with pytest.raises(NotFoundError):
        await start_interview(
            "missing",
            caller_user_id="u1",
            data=fake_data(),
            sessions=fake_sessions(),
            llm=fake_llm(None),
        )


async def test_start_interview_rejects_non_owner(fake_llm, fake_data, fake_sessions):
    with pytest.raises(ForbiddenError):
        await start_interview(
            "a1",
            caller_user_id="someone-else",
            data=fake_data(interview_setup=_setup()),
            sessions=fake_sessions(),
            llm=fake_llm(None),
        )


async def test_start_interview_rejects_wrong_state(fake_llm, fake_data, fake_sessions):
    # Aptitude not yet passed → the interview must not be startable (BE-#5).
    setup = {**_setup(), "state": "aptitude_pending"}
    with pytest.raises(ConflictError):
        await start_interview(
            "a1",
            caller_user_id="u1",
            data=fake_data(interview_setup=setup),
            sessions=fake_sessions(),
            llm=fake_llm(None),
        )


async def test_submit_turn_asks_next_question(
    fake_llm_by_schema, fake_data, fake_publisher, fake_sessions
):
    sessions = fake_sessions()
    sessions.saved["a1"] = _session(current_question="Q1")
    llm = fake_llm_by_schema(
        {InterviewTurnDecision: InterviewTurnDecision(done=False, question="Q2")}
    )
    result = await submit_turn(
        "a1",
        "my answer",
        caller_user_id="u1",
        sessions=sessions,
        data=fake_data(),
        publisher=fake_publisher(),
        llm=llm,
    )
    assert result.question == "Q2"
    assert sessions.saved["a1"].transcript.turns[0].answer == "my answer"


async def test_submit_turn_finalizes_on_done(
    fake_llm_by_schema, fake_data, fake_publisher, fake_sessions
):
    sessions = fake_sessions()
    sessions.saved["a1"] = _session(
        job_id="j1", candidate_user_id="u1", current_question="last?"
    )
    llm = fake_llm_by_schema({InterviewTurnDecision: InterviewTurnDecision(done=True)})
    data = fake_data()
    pub = fake_publisher()
    result = await submit_turn(
        "a1",
        "final answer",
        caller_user_id="u1",
        sessions=sessions,
        data=data,
        publisher=pub,
        llm=llm,
    )
    assert result.done is True
    assert sessions.saved["a1"].status == "completed"
    assert "a1" in data.saved_interviews
    assert (
        "interview.completed",
        {"application_id": "a1", "comp_id": "c1"},
    ) in pub.events


async def test_start_interview_records_started_at(
    fake_llm_by_schema, fake_data, fake_sessions
):
    blueprint = InterviewBlueprint(competencies=[CompetencyArea(name="python")])
    llm = fake_llm_by_schema(
        {
            InterviewBlueprint: blueprint,
            InterviewTurnDecision: InterviewTurnDecision(done=False, question="Q1"),
        }
    )
    sessions = fake_sessions()
    start = datetime(2026, 1, 1, tzinfo=UTC)
    await start_interview(
        "a1",
        caller_user_id="u1",
        data=fake_data(interview_setup=_setup()),
        sessions=sessions,
        llm=llm,
        clock=lambda: start,
    )
    assert sessions.saved["a1"].started_at == start.isoformat()


async def test_submit_turn_finalizes_when_time_budget_exhausted(
    fake_llm_by_schema, fake_data, fake_publisher, fake_sessions
):
    sessions = fake_sessions()
    start = datetime(2026, 1, 1, tzinfo=UTC)
    sessions.saved["a1"] = _session(
        job_id="j1",
        candidate_user_id="u1",
        current_question="Q",
        started_at=start.isoformat(),
        blueprint=InterviewBlueprint(
            competencies=[CompetencyArea(name="python")], time_budget_min=10
        ),
    )
    # The LLM would keep going, but the clock is past the 10-min budget → finalize.
    llm = fake_llm_by_schema(
        {InterviewTurnDecision: InterviewTurnDecision(done=False, question="Q2")}
    )
    data = fake_data()
    pub = fake_publisher()
    result = await submit_turn(
        "a1",
        "answer",
        caller_user_id="u1",
        sessions=sessions,
        data=data,
        publisher=pub,
        llm=llm,
        clock=lambda: start + timedelta(minutes=11),
    )
    assert result.done is True
    assert sessions.saved["a1"].status == "completed"
    assert "a1" in data.saved_interviews


async def test_submit_turn_missing_session_raises(
    fake_llm, fake_data, fake_publisher, fake_sessions
):
    with pytest.raises(NotFoundError):
        await submit_turn(
            "missing",
            "answer",
            caller_user_id="u1",
            sessions=fake_sessions(),
            data=fake_data(),
            publisher=fake_publisher(),
            llm=fake_llm(None),
        )


async def test_submit_turn_rejects_non_owner(
    fake_llm, fake_data, fake_publisher, fake_sessions
):
    sessions = fake_sessions()
    sessions.saved["a1"] = _session(current_question="Q1")
    with pytest.raises(ForbiddenError):
        await submit_turn(
            "a1",
            "answer",
            caller_user_id="intruder",
            sessions=sessions,
            data=fake_data(),
            publisher=fake_publisher(),
            llm=fake_llm(None),
        )


async def test_abandon_stale_emits_for_over_budget(
    fake_data, fake_publisher, fake_sessions
):
    sessions = fake_sessions()
    start = datetime(2026, 1, 1, tzinfo=UTC)
    sessions.saved["a1"] = _session(
        application_id="a1",
        job_id="j1",
        candidate_user_id="u1",
        current_question="Q",
        started_at=start.isoformat(),
        blueprint=InterviewBlueprint(
            competencies=[CompetencyArea(name="python")], time_budget_min=10
        ),
    )
    # A healthy session whose clock hasn't started must be left alone.
    sessions.saved["a2"] = _session(application_id="a2", current_question="Q2")
    data = fake_data()
    pub = fake_publisher()
    n = await abandon_stale(
        sessions=sessions,
        data=data,
        publisher=pub,
        clock=lambda: start + timedelta(minutes=11),
    )
    assert n == 1
    assert sessions.saved["a1"].status == "abandoned"
    assert sessions.saved["a2"].status == "in_progress"
    assert (
        "interview.abandoned",
        {"application_id": "a1", "comp_id": "c1"},
    ) in pub.events


class _BoomPublisher:
    async def publish(self, key, payload):
        raise RuntimeError("broker down")


async def test_abandon_stale_keeps_in_progress_if_publish_fails(
    fake_data, fake_sessions
):
    # The status flip is the last step; a publish failure must leave the session
    # in-progress so the next sweep re-picks it (no silently lost abandonment).
    sessions = fake_sessions()
    start = datetime(2026, 1, 1, tzinfo=UTC)
    sessions.saved["a1"] = _session(
        application_id="a1",
        job_id="j1",
        candidate_user_id="u1",
        current_question="Q",
        started_at=start.isoformat(),
        blueprint=InterviewBlueprint(
            competencies=[CompetencyArea(name="python")], time_budget_min=10
        ),
    )
    with pytest.raises(RuntimeError):
        await abandon_stale(
            sessions=sessions,
            data=fake_data(),
            publisher=_BoomPublisher(),
            clock=lambda: start + timedelta(minutes=11),
        )
    assert sessions.saved["a1"].status == "in_progress"


async def test_submit_turn_keeps_in_progress_if_publish_fails(
    fake_llm_by_schema, fake_data, fake_sessions
):
    # _finalize flips status LAST: a save/publish failure must leave the session
    # in-progress so the candidate's next /turn retries (no interview stuck unscored).
    sessions = fake_sessions()
    sessions.saved["a1"] = _session(
        job_id="j1", candidate_user_id="u1", current_question="last?"
    )
    llm = fake_llm_by_schema({InterviewTurnDecision: InterviewTurnDecision(done=True)})
    with pytest.raises(RuntimeError):
        await submit_turn(
            "a1",
            "final answer",
            caller_user_id="u1",
            sessions=sessions,
            data=fake_data(),
            publisher=_BoomPublisher(),
            llm=llm,
        )
    assert sessions.saved["a1"].status == "in_progress"


async def test_submit_turn_rejects_completed_session(
    fake_llm, fake_data, fake_publisher, fake_sessions
):
    sessions = fake_sessions()
    sessions.saved["a1"] = _session(current_question="last?", status="completed")
    pub = fake_publisher()
    with pytest.raises(ForbiddenError):  # double-submit must not re-finalize/re-emit
        await submit_turn(
            "a1",
            "late answer",
            caller_user_id="u1",
            sessions=sessions,
            data=fake_data(),
            publisher=pub,
            llm=fake_llm(InterviewTurnDecision(done=True)),
        )
    assert pub.events == []


def test_session_has_proctor_termination_marker():
    s = InterviewSession(application_id="a1")
    assert s.terminated_by_proctor == ""
    s.status = "terminated"  # the new terminal value is assignable
    assert s.status == "terminated"
