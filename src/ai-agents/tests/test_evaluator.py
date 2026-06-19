import pytest

from app.model.interview import Transcript, TranscriptTurn
from app.model.scoring import CompetencyScore, Evaluation
from app.resources.evaluator import evaluate_interview


def _transcript():
    return Transcript(
        turns=[
            TranscriptTurn(question="async?", answer="it yields control"),
            TranscriptTurn(question="hard bug?", answer="a race condition"),
        ]
    )


async def test_scores_interview(fake_llm):
    canned = Evaluation(
        competency_scores=[CompetencyScore(competency="python", score=0.8)],
        overall_score=0.75,
        strengths=["clear communication"],
        recommendation="advance",
    )
    result = await evaluate_interview(
        _transcript(), ["python"], "JD", llm=fake_llm(canned)
    )
    assert result.recommendation == "advance"
    assert result.competency_scores[0].competency == "python"


async def test_rejects_empty_transcript(fake_llm):
    with pytest.raises(ValueError):
        await evaluate_interview(
            Transcript(), ["python"], "JD", llm=fake_llm(Evaluation())
        )


async def test_rejects_out_of_range_score(fake_llm):
    bad = Evaluation(overall_score=1.5)
    with pytest.raises(ValueError):
        await evaluate_interview(_transcript(), ["python"], "JD", llm=fake_llm(bad))
