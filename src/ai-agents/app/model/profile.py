from pydantic import BaseModel, Field


class ExperienceItem(BaseModel):
    company: str
    title: str
    summary: str = ""


class EducationItem(BaseModel):
    institution: str
    degree: str
    year: str = ""


class CandidateProfile(BaseModel):
    headline: str = ""
    skills: list[str] = Field(default_factory=list)
    experience: list[ExperienceItem] = Field(default_factory=list)
    education: list[EducationItem] = Field(default_factory=list)
    years_experience: float = 0.0
