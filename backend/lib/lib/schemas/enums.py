from enum import StrEnum


class Role(StrEnum):
    company_admin = "company_admin"
    recruiter = "recruiter"
    hiring_manager = "hiring_manager"
    candidate = "candidate"


class ApplicationState(StrEnum):
    """The funnel's application states — the single vocabulary for the state machine."""

    applied = "applied"
    aptitude_pending = "aptitude_pending"
    gated_out = "gated_out"
    interview_pending = "interview_pending"
    interviewed = "interviewed"
    scored = "scored"
    shortlisted = "shortlisted"
    rejected = "rejected"
    hired = "hired"
    withdrawn = "withdrawn"
    expired = "expired"
    abandoned = "abandoned"


class FunnelEvent(StrEnum):
    """Routing keys that drive funnel transitions (`{domain}.{action}`)."""

    application_created = "application.created"
    aptitude_graded = "aptitude.graded"
    gate_override = "gate.override"
    interview_completed = "interview.completed"
    scoring_completed = "scoring.completed"
    recruiter_decision = "recruiter.decision"
    application_withdrawn = "application.withdrawn"
    application_expired = "application.expired"
    interview_abandoned = "interview.abandoned"
