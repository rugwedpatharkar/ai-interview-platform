"""Aptitude-Setter agent: JD + topics -> an auto-gradable MCQ bank.

The LLM is injected (any object with `async structured(prompt, schema)`), so the agent
is unit-tested offline with a fake LLM. The agent owns the prompt + validation; the
validation guarantees the bank is auto-gradable before it is persisted.
"""

from lib.logging import get_logger

from app.model.aptitude import AptitudeBank
from app.resources._prompt_safety import UNTRUSTED_NOTICE, fence

log = get_logger(component="agent.aptitude_setter")


def _prompt(jd_text, topics, num_questions):
    return (
        "You are an aptitude-test author for a software/IT hiring funnel.\n"
        f"Write exactly {num_questions} single-correct multiple-choice questions "
        "(4 options each), balanced across the given topics. Each question must have "
        "exactly one correct option (by index).\n\n"
        f"{UNTRUSTED_NOTICE}\n\n"
        f"Topics: {fence('topics', ', '.join(topics))}\n\n"
        f"Job description:\n{fence('jd', jd_text)}"
    )


def _validate(bank, num_questions):
    if len(bank.questions) != num_questions:
        raise ValueError(
            f"expected {num_questions} questions, got {len(bank.questions)}"
        )
    for q in bank.questions:
        if len(q.options) < 2:
            raise ValueError("each question needs at least 2 options")
        if not 0 <= q.correct_index < len(q.options):
            raise ValueError("correct_index out of range — not auto-gradable")


async def build_aptitude_bank(jd_text, topics, num_questions, *, llm) -> AptitudeBank:
    bank = await llm.structured(_prompt(jd_text, topics, num_questions), AptitudeBank)
    _validate(bank, num_questions)
    log.info("aptitude bank built: {} questions", len(bank.questions))
    return bank
