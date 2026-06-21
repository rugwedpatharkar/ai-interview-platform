from typing import Annotated

from pydantic import BaseModel, Field

from app.model._caps import clip

# Caps clip (not reject) the resume-parser LLM output so an adversarial/garbage resume
# can't bloat the stored profile — see app/model/_caps.py.
_Label = Annotated[str, clip(200)]


class ExperienceItem(BaseModel):
    company: _Label
    title: _Label
    summary: Annotated[str, clip(1000)] = ""


class EducationItem(BaseModel):
    institution: _Label
    degree: _Label
    year: Annotated[str, clip(20)] = ""


class CandidateProfile(BaseModel):
    headline: Annotated[str, clip(300)] = ""
    skills: Annotated[list[_Label], clip(100)] = Field(default_factory=list)
    experience: Annotated[list[ExperienceItem], clip(50)] = Field(default_factory=list)
    education: Annotated[list[EducationItem], clip(50)] = Field(default_factory=list)
    years_experience: float = 0.0
