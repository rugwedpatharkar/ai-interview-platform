from datetime import UTC, datetime

from pydantic import BaseModel, Field


class AuditLog(BaseModel):
    entity: str  # e.g. "application"
    entity_id: str
    action: str  # the event / transition that occurred
    comp_id: str | None = None
    from_state: str | None = None
    to_state: str | None = None
    at: datetime = Field(default_factory=lambda: datetime.now(UTC))
