"""Transport seam tests — Interviewer driven over a FakeTransport (PHASE_1 §10.3)."""

from datetime import UTC, datetime, timedelta

from app.model.interview import (
    CompetencyArea,
    InterviewBlueprint,
    InterviewTurnDecision,
)
from app.resources.transport import conduct_interview


class FakeTransport:
    """Scripted candidate for offline interview-loop tests."""

    def __init__(self, answers):
        self._answers = iter(answers)
        self.questions = []

    async def ask(self, question):
        self.questions.append(question)
        return next(self._answers, "")


class _ScriptedLLM:
    def __init__(self, decisions):
        self._it = iter(decisions)

    async def structured(self, prompt, schema):
        return next(self._it)


class _Clock:
    def __init__(self, times):
        self._times = list(times)
        self._i = 0

    def __call__(self):
        t = self._times[min(self._i, len(self._times) - 1)]
        self._i += 1
        return t


def _blueprint(minutes=30):
    return InterviewBlueprint(
        competencies=[CompetencyArea(name="python"), CompetencyArea(name="async")],
        time_budget_min=minutes,
    )


async def test_conduct_interview_covers_plan_over_transport():
    llm = _ScriptedLLM(
        [
            InterviewTurnDecision(done=False, question="Q-python"),
            InterviewTurnDecision(done=False, question="Q-async"),
            InterviewTurnDecision(done=True),
        ]
    )
    transport = FakeTransport(["ans-python", "ans-async"])
    transcript = await conduct_interview(_blueprint(), transport, llm=llm)
    assert transport.questions == ["Q-python", "Q-async"]
    assert [t.answer for t in transcript.turns] == ["ans-python", "ans-async"]


async def test_conduct_interview_stops_on_time_budget():
    # The LLM would keep asking; the clock crosses the 1-min budget after turn 1.
    llm = _ScriptedLLM(
        [InterviewTurnDecision(done=False, question=f"Q{i}") for i in range(8)]
    )
    transport = FakeTransport([f"a{i}" for i in range(8)])
    start = datetime(2026, 1, 1, tzinfo=UTC)
    clock = _Clock([start, start + timedelta(minutes=2)])
    transcript = await conduct_interview(
        _blueprint(minutes=1), transport, llm=llm, clock=clock
    )
    assert len(transcript.turns) == 1


async def test_conduct_interview_respects_max_questions():
    # A never-done LLM → the max_questions cap terminates the loop.
    llm = _ScriptedLLM(
        [InterviewTurnDecision(done=False, question=f"Q{i}") for i in range(20)]
    )
    transport = FakeTransport([f"a{i}" for i in range(20)])
    transcript = await conduct_interview(
        _blueprint(), transport, llm=llm, max_questions=3
    )
    assert len(transcript.turns) == 3
