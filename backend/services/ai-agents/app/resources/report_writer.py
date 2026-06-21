"""Report-Writer agent: Evaluation + CandidateProfile -> a recruiter-facing report.

The narrative (summary, highlights, risks) is the LLM's, but the score and
recommendation are authoritative from the Evaluation and are copied through verbatim —
so the human-readable report can never contradict the funnel's actual decision.
"""

from lib.logging import get_logger

from app.model.scoring import InterviewReport
from app.resources._prompt_safety import UNTRUSTED_NOTICE, fence

log = get_logger(component="agent.report_writer")


def _prompt(evaluation, profile):
    scores = "\n".join(
        f"- {cs.competency}: {cs.score:.2f} ({cs.rationale})"
        for cs in evaluation.competency_scores
    )
    return (
        "Write a concise recruiter-facing interview report for this candidate. Provide "
        "an executive summary, the strongest highlights, the key risks, and a clear "
        "next step. Base it only on the evaluation below — do not invent new facts.\n\n"
        f"{UNTRUSTED_NOTICE}\n\n"
        f"Candidate: {fence('headline', profile.headline)}\n"
        f"Overall score: {evaluation.overall_score:.2f}\n"
        f"Recommendation: {evaluation.recommendation}\n\n"
        f"Competency scores:\n{fence('scores', scores)}\n\n"
        f"Strengths: {fence('strengths', ', '.join(evaluation.strengths))}\n"
        f"Concerns: {fence('concerns', ', '.join(evaluation.concerns))}"
    )


async def write_report(evaluation, profile, *, llm) -> InterviewReport:
    report = await llm.structured(_prompt(evaluation, profile), InterviewReport)
    report.overall_score = evaluation.overall_score
    report.recommendation = evaluation.recommendation
    # Carry the per-competency breakdown + evidence through verbatim — the narrative is
    # the LLM's, but the scored competencies are authoritative from the Evaluation.
    report.competency_scores = evaluation.competency_scores
    log.info("report written: recommendation={}", report.recommendation)
    return report
