from pydantic import BaseModel, Field


class CompetencyScore(BaseModel):
    competency: str
    score: float  # 0.0 .. 1.0
    rationale: str = ""


class Evaluation(BaseModel):
    competency_scores: list[CompetencyScore] = Field(default_factory=list)
    overall_score: float = 0.0  # 0.0 .. 1.0
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    recommendation: str = ""  # advance | hold | reject


class InterviewReport(BaseModel):
    executive_summary: str = ""
    highlights: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    overall_score: float = 0.0  # authoritative copy of Evaluation.overall_score
    recommendation: str = ""  # authoritative copy of Evaluation.recommendation


class MatchRationale(BaseModel):
    """Matcher LLM output: reasons only (the score is computed from embeddings)."""

    reasons: list[str] = Field(default_factory=list)


class MatchResult(BaseModel):
    score: float = 0.0  # 0.0 .. 1.0 (profile<->JD fit)
    reasons: list[str] = Field(default_factory=list)
