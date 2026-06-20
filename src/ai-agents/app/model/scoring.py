from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.model._caps import clip

Recommendation = Literal["advance", "hold", "reject"]

# Caps clip (not reject) LLM output so a hallucinated/adversarial response can't bloat a
# stored doc or stall a read — see app/model/_caps.py.
_Reason = Annotated[str, clip(300)]


class Evidence(BaseModel):
    """A transcript-grounded snippet backing a competency score."""

    quote: Annotated[str, clip(500)]
    turn_index: int = 0  # which Q/A turn the quote came from


class CompetencyScore(BaseModel):
    competency: Annotated[str, clip(200)]
    score: float  # 0.0 .. 1.0
    rationale: Annotated[str, clip(500)] = ""
    evidence: Annotated[list[Evidence], clip(5)] = Field(default_factory=list)


class Evaluation(BaseModel):
    competency_scores: Annotated[list[CompetencyScore], clip(30)] = Field(
        default_factory=list
    )
    overall_score: float = 0.0  # 0.0 .. 1.0
    strengths: Annotated[list[_Reason], clip(20)] = Field(default_factory=list)
    concerns: Annotated[list[_Reason], clip(20)] = Field(default_factory=list)
    recommendation: Recommendation = "hold"


class IntegritySummary(BaseModel):
    """Compact proctoring snapshot folded into the report at finalize time."""

    score: float = 0.0  # weighted sum of proctoring severities (higher = worse)
    flags: Annotated[list[_Reason], clip(50)] = Field(
        default_factory=list
    )  # distinct medium+ event types
    auto_terminated: bool = False  # a HIGH-severity signal ended the interview


class InterviewReport(BaseModel):
    executive_summary: Annotated[str, clip(3000)] = ""
    highlights: Annotated[list[_Reason], clip(20)] = Field(default_factory=list)
    risks: Annotated[list[_Reason], clip(20)] = Field(default_factory=list)
    # Authoritative copies from the Evaluation (carry per-competency evidence).
    competency_scores: Annotated[list[CompetencyScore], clip(30)] = Field(
        default_factory=list
    )
    overall_score: float = 0.0  # authoritative copy of Evaluation.overall_score
    recommendation: Recommendation = (
        "hold"  # authoritative copy of Evaluation.recommendation
    )
    integrity: IntegritySummary | None = None  # stamped from proctoring at finalize


class MatchRationale(BaseModel):
    """Matcher LLM output: reasons only (the score is computed from embeddings)."""

    reasons: Annotated[list[_Reason], clip(10)] = Field(default_factory=list)


class MatchResult(BaseModel):
    score: float = 0.0  # 0.0 .. 1.0 (profile<->JD fit)
    reasons: Annotated[list[_Reason], clip(10)] = Field(default_factory=list)
