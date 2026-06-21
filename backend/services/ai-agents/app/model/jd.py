from pydantic import BaseModel, Field


class JdDraft(BaseModel):
    jd_text: str = ""
    suggestions: list[str] = Field(default_factory=list)
