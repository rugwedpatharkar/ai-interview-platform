"""LLM-output models clip over-long strings/lists (graceful, not rejecting)."""

from app.model.scoring import (
    CompetencyScore,
    Evaluation,
    Evidence,
    InterviewReport,
    MatchResult,
)


def test_competency_fields_clipped():
    cs = CompetencyScore(
        competency="x" * 999,
        score=0.5,
        rationale="r" * 5000,
        evidence=[Evidence(quote="q" * 5000)],
    )
    assert len(cs.competency) == 200
    assert len(cs.rationale) == 500
    assert len(cs.evidence[0].quote) == 500


def test_evaluation_lists_clipped():
    ev = Evaluation(
        competency_scores=[
            CompetencyScore(competency=f"c{i}", score=0.5) for i in range(100)
        ],
        strengths=["s" * 999] * 50,
        concerns=["c"] * 50,
    )
    assert len(ev.competency_scores) == 30
    assert len(ev.strengths) == 20 and len(ev.strengths[0]) == 300
    assert len(ev.concerns) == 20


def test_report_fields_clipped():
    r = InterviewReport(
        executive_summary="e" * 9999,
        highlights=["h"] * 99,
        competency_scores=[CompetencyScore(competency="c", score=0.5)] * 99,
    )
    assert len(r.executive_summary) == 3000
    assert len(r.highlights) == 20
    assert len(r.competency_scores) == 30


def test_match_reasons_clipped():
    m = MatchResult(score=0.5, reasons=["r" * 999] * 99)
    assert len(m.reasons) == 10 and len(m.reasons[0]) == 300


def test_blueprint_and_transcript_clipped():
    from app.model.interview import CompetencyArea, InterviewBlueprint, TranscriptTurn

    bp = InterviewBlueprint(
        competencies=[CompetencyArea(name=f"c{i}") for i in range(99)]
    )
    assert len(bp.competencies) == 30
    t = TranscriptTurn(question="q" * 9999, answer="a" * 99999)
    assert len(t.question) == 2000 and len(t.answer) == 32000


def test_profile_lists_clipped():
    from app.model.profile import CandidateProfile

    p = CandidateProfile(headline="h" * 999, skills=["s"] * 999)
    assert len(p.headline) == 300 and len(p.skills) == 100


def test_proctoring_meta_bounded():
    from app.model.proctoring import ProctoringEvent

    e = ProctoringEvent(
        type="tab_hidden", at="x" * 999, meta={str(i): "v" * 999 for i in range(99)}
    )
    assert len(e.at) == 64
    assert len(e.meta) == 20 and all(len(v) == 256 for v in e.meta.values())
