from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str
    content: str = Field(max_length=8000)


class AssistantPlan(BaseModel):
    """Planner output: which scoped tool a chat turn routes to."""

    intent: Literal["kb_search", "status", "ranking", "chat"] = "chat"
    query: str = ""
    job_id: str = ""
    application_id: str = ""


class AssistantAnswer(BaseModel):
    text: str = ""
