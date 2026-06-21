from typing import Annotated

from pydantic import BaseModel, Field

from app.model._caps import clip

# Caps clip (not reject) LLM/candidate output so a hallucinated blueprint or a giant
# answer can't bloat the stored interview doc — see app/model/_caps.py.
_Label = Annotated[str, clip(200)]
_Text = Annotated[str, clip(2000)]


class SourceCitation(BaseModel):
    url: Annotated[str, clip(500)]
    topic: _Label = ""
    snippet: Annotated[str, clip(1000)] = ""


class CompetencyArea(BaseModel):
    name: _Label
    why: Annotated[str, clip(500)] = ""  # why this competency matters for the role
    seed_questions: Annotated[list[_Text], clip(10)] = Field(default_factory=list)
    source_citations: Annotated[list[SourceCitation], clip(20)] = Field(
        default_factory=list
    )


class InterviewBlueprint(BaseModel):
    competencies: Annotated[list[CompetencyArea], clip(30)] = Field(
        default_factory=list
    )
    time_budget_min: int = 30
    source_citations: Annotated[list[SourceCitation], clip(20)] = Field(
        default_factory=list
    )


class JobQuestionPlan(BaseModel):
    """Job-level RAG-grounded plan built on job.published; the interview adapts it."""

    job_id: str = ""
    competencies: Annotated[list[CompetencyArea], clip(30)] = Field(
        default_factory=list
    )
    source_citations: Annotated[list[SourceCitation], clip(20)] = Field(
        default_factory=list
    )


class TranscriptTurn(BaseModel):
    question: Annotated[str, clip(2000)]
    answer: Annotated[str, clip(32000)]  # matches the route's _MAX_ANSWER_CHARS


class Transcript(BaseModel):
    turns: Annotated[list[TranscriptTurn], clip(100)] = Field(default_factory=list)


class InterviewTurnDecision(BaseModel):
    done: bool = False
    question: Annotated[str, clip(2000)] = ""


class InterviewSession(BaseModel):
    application_id: str
    comp_id: str = ""
    job_id: str = ""
    candidate_user_id: str = ""
    blueprint: InterviewBlueprint = Field(default_factory=InterviewBlueprint)
    transcript: Transcript = Field(default_factory=Transcript)
    current_question: str = ""
    started_at: str = ""  # ISO; anchors the time-budget clock
    status: str = "in_progress"  # in_progress | completed | abandoned | terminated
    terminated_by_proctor: str = ""  # HIGH event type when proctor-terminated
