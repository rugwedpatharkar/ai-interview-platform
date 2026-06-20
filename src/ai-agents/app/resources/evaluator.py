"""Evaluator agent: interview transcript + competencies -> a scored Evaluation.

The prompt asks the LLM to ground every score in the transcript; this agent enforces
the numeric invariant (scores in 0.0..1.0) so a malformed score can never reach the
report or the funnel decision.
"""

from lib.logging import get_logger

from app.model.scoring import Evaluation
from app.resources._prompt_safety import UNTRUSTED_NOTICE, fence

log = get_logger(component="agent.evaluator")


def _prompt(transcript, competencies, jd_text):
    turns = "\n\n".join(
        f"[turn {i}] Q: {t.question}\nA: {t.answer}"
        for i, t in enumerate(transcript.turns)
    )
    return (
        "You are evaluating a candidate interview for a software/IT role. Score each "
        "competency from 0.0 to 1.0 with a one-line rationale grounded in the "
        "transcript. For each competency, also cite 1-2 short evidence snippets quoted "
        "from the transcript, each with the turn_index it came from (the [turn N] "
        "marker). Then give an overall score, key strengths, concerns, and a "
        "recommendation (advance / hold / reject). Judge only what the transcript "
        "supports.\n\n"
        f"{UNTRUSTED_NOTICE}\n\n"
        f"Competencies: {fence('competencies', ', '.join(competencies))}\n\n"
        f"Job description:\n{fence('jd', jd_text)}\n\n"
        f"Transcript:\n{fence('transcript', turns)}"
    )


def _validate(evaluation):
    if not 0.0 <= evaluation.overall_score <= 1.0:
        raise ValueError("overall_score must be within 0.0..1.0")
    for cs in evaluation.competency_scores:
        if not 0.0 <= cs.score <= 1.0:
            raise ValueError(f"competency score out of range: {cs.competency}")


def _prune_evidence(evaluation, n_turns):
    """Drop evidence whose turn_index is out of range — the LLM can hallucinate a turn
    that does not exist, and the report must never cite one."""
    for cs in evaluation.competency_scores:
        cs.evidence = [e for e in cs.evidence if 0 <= e.turn_index < n_turns]


async def evaluate_interview(transcript, competencies, jd_text, *, llm) -> Evaluation:
    if not transcript.turns:
        raise ValueError("transcript is empty — nothing to evaluate")
    evaluation = await llm.structured(
        _prompt(transcript, competencies, jd_text), Evaluation
    )
    _validate(evaluation)
    _prune_evidence(evaluation, len(transcript.turns))
    log.info("interview evaluated: overall={:.2f}", evaluation.overall_score)
    return evaluation
