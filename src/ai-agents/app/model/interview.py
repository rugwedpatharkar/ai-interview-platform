from pydantic import BaseModel, Field


class SourceCitation(BaseModel):
    url: str
    topic: str = ""
    snippet: str = ""


class CompetencyArea(BaseModel):
    name: str
    why: str = ""  # why this competency matters for the role
    seed_questions: list[str] = Field(default_factory=list)
    source_citations: list[SourceCitation] = Field(default_factory=list)


class InterviewBlueprint(BaseModel):
    competencies: list[CompetencyArea] = Field(default_factory=list)
    time_budget_min: int = 30
    source_citations: list[SourceCitation] = Field(default_factory=list)


class JobQuestionPlan(BaseModel):
    """Job-level RAG-grounded plan built on job.published; the interview adapts it."""

    job_id: str = ""
    competencies: list[CompetencyArea] = Field(default_factory=list)
    source_citations: list[SourceCitation] = Field(default_factory=list)


class TranscriptTurn(BaseModel):
    question: str
    answer: str


class Transcript(BaseModel):
    turns: list[TranscriptTurn] = Field(default_factory=list)


class InterviewTurnDecision(BaseModel):
    done: bool = False
    question: str = ""


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
    terminated_by_proctor: str = ""  # triggering HIGH event type when proctor-terminated
