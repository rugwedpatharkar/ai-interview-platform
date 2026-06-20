from typing import Literal

from pydantic import BaseModel, Field

Recommendation = Literal["advance", "hold", "reject"]


class Evidence(BaseModel):
    """A transcript-grounded snippet backing a competency score."""

    quote: str
    turn_index: int = 0  # which Q/A turn the quote came from


class CompetencyScore(BaseModel):
    competency: str
    score: float  # 0.0 .. 1.0
    rationale: str = ""
    evidence: list[Evidence] = Field(default_factory=list)


class Evaluation(BaseModel):
    competency_scores: list[CompetencyScore] = Field(default_factory=list)
    overall_score: float = 0.0  # 0.0 .. 1.0
    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)
    recommendation: Recommendation = "hold"


class IntegritySummary(BaseModel):
    """Compact proctoring snapshot folded into the report at finalize time."""

    score: float = 0.0  # weighted sum of proctoring severities (higher = worse)
    flags: list[str] = Field(default_factory=list)  # distinct medium+ event types
    auto_terminated: bool = False  # a HIGH-severity signal ended the interview


class InterviewReport(BaseModel):
    executive_summary: str = ""
    highlights: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    # Authoritative copies from the Evaluation (carry per-competency evidence).
    competency_scores: list[CompetencyScore] = Field(default_factory=list)
    overall_score: float = 0.0  # authoritative copy of Evaluation.overall_score
    recommendation: Recommendation = (
        "hold"  # authoritative copy of Evaluation.recommendation
    )
    integrity: IntegritySummary | None = None  # stamped from proctoring at finalize


class MatchRationale(BaseModel):
    """Matcher LLM output: reasons only (the score is computed from embeddings)."""

    reasons: list[str] = Field(default_factory=list)


class MatchResult(BaseModel):
    score: float = 0.0  # 0.0 .. 1.0 (profile<->JD fit)
    reasons: list[str] = Field(default_factory=list)
