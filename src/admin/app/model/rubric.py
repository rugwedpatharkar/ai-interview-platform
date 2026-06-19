from pydantic import BaseModel, Field


class RubricCompetency(BaseModel):
    name: str
    weight: float = Field(1.0, ge=0)


class Rubric(BaseModel):
    comp_id: str
    name: str
    competencies: list[RubricCompetency] = Field(default_factory=list)
