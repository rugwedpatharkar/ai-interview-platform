from datetime import UTC, datetime

from pydantic import BaseModel, Field


class AptitudeConfig(BaseModel):
    topics: list = Field(default_factory=list)
    num_questions: int = 10
    time_limit_min: int = 20
    pass_threshold: int = 60


class Job(BaseModel):
    comp_id: str
    title: str
    jd_text: str = ""
    location: str | None = None
    experience_level: str | None = None
    openings: int = 1
    status: str = "draft"  # draft -> published -> paused -> closed -> archived
    aptitude_config: AptitudeConfig = Field(default_factory=AptitudeConfig)
    required_topics: list = Field(default_factory=list)
    time_budget_min: int = 30
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
