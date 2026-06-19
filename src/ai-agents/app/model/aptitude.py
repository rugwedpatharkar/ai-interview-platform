from pydantic import BaseModel, Field


class AptitudeQuestion(BaseModel):
    question: str
    options: list[str]
    correct_index: int
    topic: str


class AptitudeBank(BaseModel):
    questions: list[AptitudeQuestion] = Field(default_factory=list)
