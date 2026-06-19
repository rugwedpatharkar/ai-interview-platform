import pytest

from app.model.interview import (
    CompetencyArea,
    InterviewBlueprint,
    InterviewTurnDecision,
    Transcript,
    TranscriptTurn,
)
from app.resources.interviewer import next_question


def _blueprint():
    return InterviewBlueprint(
        competencies=[CompetencyArea(name="Concurrency", why="core")]
    )


async def test_asks_next_question(fake_llm):
    decision = InterviewTurnDecision(done=False, question="Explain async/await")
    result = await next_question(_blueprint(), Transcript(), llm=fake_llm(decision))
    assert result.done is False
    assert result.question == "Explain async/await"


async def test_caps_at_max_questions(fake_llm):
    transcript = Transcript(turns=[TranscriptTurn(question="q", answer="a")] * 3)
    # The LLM would keep asking, but the cap ends it without consulting the LLM.
    result = await next_question(
        _blueprint(),
        transcript,
        llm=fake_llm(InterviewTurnDecision(question="more?")),
        max_questions=3,
    )
    assert result.done is True


async def test_respects_llm_done(fake_llm):
    result = await next_question(
        _blueprint(), Transcript(), llm=fake_llm(InterviewTurnDecision(done=True))
    )
    assert result.done is True


async def test_rejects_empty_non_done_decision(fake_llm):
    bad = InterviewTurnDecision(done=False, question="   ")
    with pytest.raises(ValueError):
        await next_question(_blueprint(), Transcript(), llm=fake_llm(bad))
