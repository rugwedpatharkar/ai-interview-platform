from datetime import UTC, datetime

from pydantic import BaseModel, Field


class MessageThread(BaseModel):
    application_id: str  # 1:1 with the application (the authz anchor)
    comp_id: str
    candidate_user_id: str
    recruiter_user_id: str = ""  # set on the first recruiter send
    job_title: str = ""  # denormalized for the inbox row
    company_name: str = ""
    last_message_at: datetime | None = None
    last_snippet: str = ""
    unread_candidate: int = 0
    unread_recruiter: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Message(BaseModel):
    thread_id: str
    comp_id: str
    application_id: str
    sender_role: str  # "candidate" | "recruiter"
    sender_user_id: str
    body: str
    read_at: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
