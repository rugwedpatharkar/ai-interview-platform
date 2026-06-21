"""Team models — per-job member scoping (scaffolding; enforcement deferred).

`MemberJobAssignment` records that a hiring-manager/recruiter seat is scoped to specific
jobs. The model + its index ship now so the collection is ready; the enforcement (gating
applicant/messaging access by assignment) is a deferred follow-on.
"""

from datetime import UTC, datetime

from pydantic import BaseModel, Field


class MemberJobAssignment(BaseModel):
    user_id: str
    job_id: str
    comp_id: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
