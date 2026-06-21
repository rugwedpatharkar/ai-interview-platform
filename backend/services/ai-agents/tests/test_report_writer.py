from app.model.profile import CandidateProfile
from app.model.scoring import CompetencyScore, Evaluation, Evidence, InterviewReport
from app.resources.report_writer import write_report


async def test_writes_narrative_from_llm(fake_llm):
    evaluation = Evaluation(overall_score=0.82, recommendation="advance")
    profile = CandidateProfile(headline="Backend Engineer")
    llm_report = InterviewReport(executive_summary="Strong candidate", highlights=["x"])
    report = await write_report(evaluation, profile, llm=fake_llm(llm_report))
    assert report.executive_summary == "Strong candidate"
    assert report.highlights == ["x"]


async def test_score_and_recommendation_come_from_evaluation(fake_llm):
    evaluation = Evaluation(overall_score=0.82, recommendation="advance")
    profile = CandidateProfile()
    # LLM emits a contradictory score/recommendation; the agent must override both.
    llm_report = InterviewReport(overall_score=0.1, recommendation="reject")
    report = await write_report(evaluation, profile, llm=fake_llm(llm_report))
    assert report.overall_score == 0.82
    assert report.recommendation == "advance"


async def test_competency_scores_carry_through_with_evidence(fake_llm):
    # The recruiter-facing report must carry the per-competency breakdown + evidence
    # verbatim from the Evaluation — the LLM narrative cannot invent or omit it.
    evaluation = Evaluation(
        overall_score=0.8,
        recommendation="advance",
        competency_scores=[
            CompetencyScore(
                competency="python",
                score=0.9,
                evidence=[Evidence(quote="it yields control", turn_index=0)],
            )
        ],
    )
    profile = CandidateProfile()
    report = await write_report(evaluation, profile, llm=fake_llm(InterviewReport()))
    assert report.competency_scores[0].competency == "python"
    assert report.competency_scores[0].evidence[0].quote == "it yields control"
