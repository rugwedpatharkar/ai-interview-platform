from datetime import UTC, datetime

from pydantic import BaseModel, Field


class AptitudeConfig(BaseModel):
    topics: list = Field(default_factory=list)
    num_questions: int = 10
    time_limit_min: int = 20
    pass_threshold: int = 60
    gate_mode: str = "auto"  # auto (HIGH proctor signals auto-terminate) | advisory


class Job(BaseModel):
    comp_id: str
    title: str = Field(max_length=200)
    jd_text: str = Field(default="", max_length=50_000)
    location: str | None = None
    experience_level: str | None = None
    # Marketplace display fields (all optional, additive; legacy jobs read null/empty).
    city: str | None = None
    region: str | None = None
    country: str | None = None
    remote_mode: str | None = None  # remote | hybrid | onsite
    employment_type: str | None = None  # full_time | contract | internship
    salary_min: int = 0
    salary_max: int = 0
    salary_currency: str | None = None  # ISO 4217, e.g. "USD"
    skills: list = Field(default_factory=list)  # lowercased + de-duped on write
    openings: int = 1
    status: str = "draft"  # draft -> published -> paused -> closed -> archived
    aptitude_config: AptitudeConfig = Field(default_factory=AptitudeConfig)
    required_topics: list = Field(default_factory=list)
    time_budget_min: int = 30
    posted_at: datetime | None = None  # stamped at the draft -> published flip
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
