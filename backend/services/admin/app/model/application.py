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
    # Per-transition timing log ({state, at}); appended on each funnel CAS so
    # CompanyProfile / Analytics can derive stage timings (applied -> first decision).
    transitions: list = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
