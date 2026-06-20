import pytest
from pydantic import ValidationError

from app.model.interview import Transcript, TranscriptTurn
from app.model.scoring import CompetencyScore, Evaluation, Evidence
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


async def test_keeps_in_range_evidence(fake_llm):
    canned = Evaluation(
        competency_scores=[
            CompetencyScore(
                competency="python",
                score=0.8,
                evidence=[Evidence(quote="it yields control", turn_index=0)],
            )
        ],
        recommendation="advance",
    )
    result = await evaluate_interview(
        _transcript(), ["python"], "JD", llm=fake_llm(canned)
    )
    assert result.competency_scores[0].evidence[0].turn_index == 0
    assert result.competency_scores[0].evidence[0].quote == "it yields control"


async def test_drops_out_of_range_evidence(fake_llm):
    # The transcript has 2 turns (0, 1); turn_index 5 and -1 are hallucinated refs and
    # must be dropped so the report never cites a turn that does not exist.
    canned = Evaluation(
        competency_scores=[
            CompetencyScore(
                competency="python",
                score=0.8,
                evidence=[
                    Evidence(quote="real", turn_index=1),
                    Evidence(quote="hallucinated", turn_index=5),
                    Evidence(quote="negative", turn_index=-1),
                ],
            )
        ],
        recommendation="advance",
    )
    result = await evaluate_interview(
        _transcript(), ["python"], "JD", llm=fake_llm(canned)
    )
    kept = result.competency_scores[0].evidence
    assert [e.quote for e in kept] == ["real"]


def test_evaluation_rejects_invalid_recommendation():
    with pytest.raises(ValidationError):
        Evaluation(recommendation="maybe")


def test_evaluation_rejects_empty_recommendation():
    with pytest.raises(ValidationError):
        Evaluation(recommendation="")


def test_evaluation_accepts_valid_recommendations():
    for rec in ("advance", "hold", "reject"):
        e = Evaluation(recommendation=rec)
        assert e.recommendation == rec


def test_evaluation_defaults_to_hold():
    assert Evaluation().recommendation == "hold"
