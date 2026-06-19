from datetime import UTC, datetime

from pydantic import BaseModel, Field


class Application(BaseModel):
    comp_id: str
    job_id: str
    candidate_user_id: str
    # state machine: applied -> aptitude_pending -> [gate] -> interview_pending ->
    # interviewed -> scored -> {shortlisted|rejected|hired};
    # plus gated_out|expired|withdrawn|abandoned
    state: str = "applied"
    consent: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
