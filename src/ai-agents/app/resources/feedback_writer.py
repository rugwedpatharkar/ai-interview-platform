"""Practice feedback writer: an interview Evaluation -> private GrowthFeedback.

`_classify` deterministically buckets competencies by score band BEFORE the LLM phrases
them, so the growth framing is grounded in the numeric evaluation while the numbers (and
any advance/hold/reject recommendation) never reach the candidate — GrowthFeedback has
no score field by type. Reuses the interview Evaluator's output; adds no new scoring.
"""

from lib.logging import get_logger

from app.model.practice import GrowthFeedback
from app.resources._prompt_safety import UNTRUSTED_NOTICE, fence

log = get_logger(component="resource.feedback_writer")

# Competency score bands: at/above STRENGTH is a strength, below GAP is a growth area,
# the middle is neutral (neither). Encouraging-but-honest framing.
_STRENGTH_BAND = 0.70
_GAP_BAND = 0.50


def _classify(evaluation):
    """Bucket competencies into (strengths, gaps) by score band — pure, no LLM."""
    strengths = [
        cs.competency
        for cs in evaluation.competency_scores
        if cs.score >= _STRENGTH_BAND
    ]
    gaps = [
        cs.competency for cs in evaluation.competency_scores if cs.score < _GAP_BAND
    ]
    return strengths, gaps


def _prompt(strengths, gaps):
    strong = ", ".join(strengths) or "(none stood out)"
    weak = ", ".join(gaps) or "(none flagged)"
    return (
        "Write private, encouraging growth feedback for a candidate's practice "
        "interview. Give a 2-3 sentence summary of how they did, then phrase their "
        "stronger areas and the areas to grow, and suggest concrete topics to study "
        "next. This is for the candidate's own development — never a hiring verdict, "
        "numeric score, or pass/fail.\n\n"
        f"{UNTRUSTED_NOTICE}\n\n"
        f"Stronger areas: {fence('strengths', strong)}\n"
        f"Areas to grow: {fence('gaps', weak)}"
    )


async def build_feedback(evaluation, *, llm) -> GrowthFeedback:
    strengths, gaps = _classify(evaluation)
    feedback = await llm.structured(_prompt(strengths, gaps), GrowthFeedback)
    log.info(
        "practice feedback built: {} strengths, {} gaps",
        len(feedback.strengths),
        len(feedback.gaps),
    )
    return feedback
