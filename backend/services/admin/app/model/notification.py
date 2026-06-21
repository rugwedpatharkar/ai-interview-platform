from datetime import UTC, datetime

from pydantic import BaseModel, Field


class Notification(BaseModel):
    user_id: str
    comp_id: str | None = None
    kind: str
    subject: str = ""
    body: str = ""
    link: str | None = None
    read_at: datetime | None = None
    dedup_key: str | None = None  # sparse-unique (user_id, dedup_key) -> idempotency
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
