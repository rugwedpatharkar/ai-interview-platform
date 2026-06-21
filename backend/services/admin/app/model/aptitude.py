from datetime import UTC, datetime

from pydantic import BaseModel, Field


class AptitudeAttempt(BaseModel):
    application_id: str
    comp_id: str
    candidate_user_id: str
    job_id: str
    score: int
    passed: bool
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AptitudeDelivery(BaseModel):
    """Records the per-candidate served question order + the delivery clock-start.

    Written once when the candidate first fetches the test, so re-fetches are stable and
    submission can (a) enforce the time limit and (b) map positional answers back to the
    original questions despite per-candidate randomization."""

    application_id: str
    comp_id: str
    job_id: str
    order: list[int]  # permutation of original question indices, in served order
    delivered_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
