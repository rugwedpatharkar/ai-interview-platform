"""Interviewer agent: a STATELESS turn function for the live interview.

Given the blueprint and the transcript so far, it returns the next question or signals
done. State (the transcript) is owned by the host (Redis checkpointer) — the agent holds
nothing between turns. A hard `max_questions` cap guarantees the interview terminates
even if the model never volunteers to stop.
"""

from lib.logging import get_logger

from app.model.interview import InterviewTurnDecision
from app.resources._prompt_safety import UNTRUSTED_NOTICE, fence

log = get_logger(component="agent.interviewer")


def _prompt(blueprint, transcript):
    plan = "\n".join(f"- {c.name}: {c.why}" for c in blueprint.competencies)
    asked = "\n\n".join(f"Q: {t.question}\nA: {t.answer}" for t in transcript.turns)
    return (
        "You are conducting a technical interview. Follow the plan, adapting to the "
        "candidate's answers — probe weak spots, move on once a competency is covered. "
        "Return the single next question, or done=true if the plan is sufficiently "
        "covered.\n\n"
        f"{UNTRUSTED_NOTICE}\n\n"
        f"Plan:\n{fence('plan', plan)}\n\n"
        f"Interview so far:\n{fence('transcript', asked or '(no questions yet)')}"
    )


async def next_question(
    blueprint, transcript, *, llm, max_questions=8
) -> InterviewTurnDecision:
    if len(transcript.turns) >= max_questions:
        log.info("interview hit max_questions={}, ending", max_questions)
        return InterviewTurnDecision(done=True)
    decision = await llm.structured(
        _prompt(blueprint, transcript), InterviewTurnDecision
    )
    if not decision.done and not decision.question.strip():
        raise ValueError("interviewer returned neither a question nor done")
    return decision
