from datetime import UTC, datetime

from pydantic import BaseModel, Field


class TestCase(BaseModel):
    stdin: str = ""
    expected_stdout: str = ""


class TypedQuestion(BaseModel):
    id: str
    prompt: str
    accepted: list[str] = Field(default_factory=list)  # normalized-match answer key


class CodingTask(BaseModel):
    job_id: str
    title: str = ""
    prompt: str = ""
    languages: list[str] = Field(default_factory=lambda: ["python"])
    starter_code: str = ""
    sample_cases: list[TestCase] = Field(default_factory=list)  # shown to candidate
    hidden_cases: list[TestCase] = Field(default_factory=list)  # grading — never sent
    typed_questions: list[TypedQuestion] = Field(default_factory=list)
    cpu_seconds: int = 2
    wall_seconds: int = 5


class CodingAttempt(BaseModel):
    application_id: str
    comp_id: str
    candidate_user_id: str
    job_id: str
    cases_passed: int
    cases_total: int
    typed_correct: int
    typed_total: int
    passed: bool
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
