"""Interview-scheduling models — funnel-adjacent, with their own status + version CAS.

Scheduling never writes funnel state. `InterviewSlots` is an append-only proposal
history (one `open` per application); `InterviewBooking` is the single current booking
per application (the 1:1 invariant the compare-and-swap relies on). Every persisted
instant is UTC — the viewer's zone is applied only at render, never here.
"""

from datetime import UTC, datetime

from pydantic import BaseModel, Field


def _utcnow() -> datetime:
    return datetime.now(UTC)


class ProposedSlot(BaseModel):
    start_at: datetime  # UTC
    duration_minutes: int = 60


class InterviewSlots(BaseModel):
    """An offered set of times for an application. status: open | superseded."""

    application_id: str
    comp_id: str = ""
    slots: list[ProposedSlot] = Field(default_factory=list)
    location: str = ""
    note: str = ""
    status: str = "open"
    created_at: datetime = Field(default_factory=_utcnow)


class InterviewBooking(BaseModel):
    """The one current booking per application; `version` is the CAS counter that makes
    the candidate's pick first-write-wins."""

    application_id: str
    comp_id: str = ""
    candidate_user_id: str = ""
    status: str = "proposed"  # proposed | booked | completed | cancelled
    chosen_start_at: datetime | None = None
    chosen_duration_minutes: int = 0
    location: str = ""
    note: str = ""
    cancelled_by: str = ""
    version: int = 0
    reminded_24h: bool = False
    reminded_1h: bool = False
    created_at: datetime = Field(default_factory=_utcnow)
