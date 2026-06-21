from datetime import UTC, datetime

from pydantic import BaseModel, Field


class ConsentRecord(BaseModel):
    user_id: str
    scope: str  # data_processing | automated_evaluation
    terms_version: str
    granted_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
