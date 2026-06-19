from app.model.profile import CandidateProfile
from app.model.scoring import Evaluation, InterviewReport
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
