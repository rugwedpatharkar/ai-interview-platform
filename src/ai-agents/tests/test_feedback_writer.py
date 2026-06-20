from app.model.practice import GrowthFeedback
from app.model.scoring import CompetencyScore, Evaluation
from app.resources.feedback_writer import (
    _GAP_BAND,
    _STRENGTH_BAND,
    _classify,
    build_feedback,
)


def _evaluation():
    return Evaluation(
        competency_scores=[
            CompetencyScore(competency="System design", score=0.85),
            CompetencyScore(competency="Concurrency", score=0.30),
            CompetencyScore(competency="Testing", score=0.60),
        ],
        overall_score=0.6,
        strengths=["clear communicator"],
        concerns=["shaky on concurrency"],
        recommendation="hold",
    )


def test_classify_buckets_by_band():
    strengths, gaps = _classify(_evaluation())
    # >= 0.70 is a strength; < 0.50 is a gap; 0.60 is neither (the neutral middle).
    assert strengths == ["System design"]
    assert gaps == ["Concurrency"]


def test_classify_band_boundaries_inclusive_strength_exclusive_gap():
    ev = Evaluation(
        competency_scores=[
            CompetencyScore(competency="A", score=_STRENGTH_BAND),
            CompetencyScore(competency="B", score=_GAP_BAND),
        ]
    )
    strengths, gaps = _classify(ev)
    assert strengths == ["A"]  # exactly 0.70 counts as a strength
    assert gaps == []  # exactly 0.50 is neutral, not a gap


async def test_build_feedback_returns_llm_growth_grounded_in_buckets():
    captured = {}

    class _LLM:
        async def structured(self, prompt, schema):
            captured["prompt"] = prompt
            captured["schema"] = schema
            return GrowthFeedback(
                summary="You are progressing well.",
                strengths=["System design"],
                gaps=["Concurrency"],
                suggested_topics=["asyncio"],
            )

    out = await build_feedback(_evaluation(), llm=_LLM())
    assert isinstance(out, GrowthFeedback)
    assert out.summary == "You are progressing well."
    # The structured call requests GrowthFeedback (no score/recommendation by type).
    assert captured["schema"] is GrowthFeedback
    # Deterministic buckets reached the prompt — phrasing is grounded, not invented.
    assert "System design" in captured["prompt"]
    assert "Concurrency" in captured["prompt"]


def test_growth_feedback_has_no_verdict_fields():
    # The visual/contract guarantee at the type level: no score / recommendation.
    fields = set(GrowthFeedback.model_fields)
    assert fields == {"summary", "strengths", "gaps", "suggested_topics"}
