from datetime import UTC, datetime

from pydantic import BaseModel, Field


class CandidateProfile(BaseModel):
    user_id: str
    resume_key: str | None = None
    resume_uploaded: bool = False
    parsed: bool = False
    confirmed: bool = False
    full_name: str | None = None
    age: int | None = None
    willing_to_relocate: bool = False
    job_preference: str | None = None  # hybrid | remote | onsite
    education: list = Field(default_factory=list, max_length=50)
    experience: list = Field(default_factory=list, max_length=50)
    skills: list = Field(default_factory=list, max_length=100)
    location: str | None = None
    experience_level: str | None = None
    completeness: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
