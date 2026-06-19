"""Interview I/O transport seam — modality abstraction (text now, voice/video later).

The interview *brain* (Blueprint + Interviewer + time budget) is text-first but stays
modality-agnostic by talking to a `Transport`: `ask(question) -> answer`. Two consumers:

- Live (text): the HTTP `/turn` path in `interview_host` is the text adapter — the
  browser is the transport, one turn per request. Shares the time-budget rule.
- Server-driven / offline: `conduct_interview` loops over a `Transport`. It is the
  §10.3 harness (Interviewer vs a FakeTransport) and the seam P3/P4 drive: voice/video
  implement `Transport.ask`, no change to the interview logic (§11 exit criterion).
"""

from datetime import UTC, datetime
from typing import Protocol

from lib.logging import get_logger

from app.model.interview import Transcript, TranscriptTurn
from app.resources.interviewer import next_question

log = get_logger(component="resource.transport")


class Transport(Protocol):
    async def ask(self, question: str) -> str:
        """Deliver a question to the candidate and return their (text) answer."""
        ...


def _utcnow():
    return datetime.now(UTC)


async def conduct_interview(
    blueprint, transport, *, llm, clock=_utcnow, max_questions=8
):
    """Drive a full interview over a Transport until the plan is covered, the
    question cap is hit, or the time budget is spent. Returns the Transcript."""
    transcript = Transcript()
    started = clock()
    while True:
        decision = await next_question(
            blueprint, transcript, llm=llm, max_questions=max_questions
        )
        if decision.done:
            break
        answer = await transport.ask(decision.question)
        transcript.turns.append(
            TranscriptTurn(question=decision.question, answer=answer)
        )
        if (clock() - started).total_seconds() >= blueprint.time_budget_min * 60:
            log.info(
                "interview time budget reached after {} turns", len(transcript.turns)
            )
            break
    return transcript
