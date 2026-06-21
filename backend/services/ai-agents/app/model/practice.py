"""Practice models — the detached, candidate-private mock-interview surface.

By type these carry NO comp_id / job_id / application_id: practice never reaches the
funnel and is never shown to an employer. `GrowthFeedback` has no score / recommendation
field, so a hire/reject verdict cannot leak — the detached invariant at the type level.
"""

from pydantic import BaseModel, Field

from app.model.interview import InterviewBlueprint, Transcript


class GrowthFeedback(BaseModel):
    """Private, unscored growth feedback — strengths / gaps / suggested topics only."""

    summary: str = ""
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    suggested_topics: list[str] = Field(default_factory=list)


class PracticeSession(BaseModel):
    """In-flight practice run (Redis), keyed by practice_id — no funnel identifiers."""

    practice_id: str
    user_id: str = ""
    role_label: str = ""
    jd_text: str = ""  # synthesized-or-pasted JD; needed at finalize to evaluate
    blueprint: InterviewBlueprint = Field(default_factory=InterviewBlueprint)
    transcript: Transcript = Field(default_factory=Transcript)
    current_question: str = ""
    started_at: str = ""  # ISO; anchors the time-budget clock
    created_at: str = ""  # ISO; history sort key
    status: str = "in_progress"  # in_progress | completed


class PracticeSummary(BaseModel):
    """Finalized growth artifact (Mongo practice_sessions), keyed by user_id."""

    practice_id: str
    user_id: str = ""
    role_label: str = ""
    created_at: str = ""
    evaluation_summary: str = ""
    feedback: GrowthFeedback = Field(default_factory=GrowthFeedback)
