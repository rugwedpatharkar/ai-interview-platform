from datetime import UTC, datetime

from pydantic import BaseModel, Field


class AlertFilters(BaseModel):
    location: str = ""
    remote_mode: str = ""
    employment_type: str = ""
    experience_level: str = ""
    skills: list = Field(default_factory=list)


class JobAlert(BaseModel):
    candidate_user_id: str
    keyword: str = ""
    filters: AlertFilters = Field(default_factory=AlertFilters)
    frequency: str = "daily"  # daily | weekly
    last_run_at: datetime | None = None  # written by the sweep; unset until first run
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
