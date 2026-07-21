from datetime import UTC, datetime, timedelta

from pydantic import BaseModel, Field

# GDPR-style consent expiry — after this window the record is stale and callers
# should re-collect. 365 days matches the audit-log retention TTL.
CONSENT_MAX_AGE_DAYS = 365


class ConsentRecord(BaseModel):
    user_id: str
    scope: str  # data_processing | automated_evaluation
    terms_version: str
    granted_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


def is_consent_current(record: dict, now: datetime | None = None) -> bool:
    """A consent row is CURRENT iff granted less than CONSENT_MAX_AGE_DAYS ago.
    Callers gating on 'has the user consented?' should filter list_consent through
    this — a v1 record from two years ago should not silently count as valid.
    """
    now = now or datetime.now(UTC)
    granted = record.get("granted_at")
    if not isinstance(granted, datetime):
        return False
    return (now - granted) < timedelta(days=CONSENT_MAX_AGE_DAYS)
