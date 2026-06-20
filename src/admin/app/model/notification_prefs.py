from datetime import datetime

from pydantic import BaseModel, Field

# Stable category keys (mirror the FE EMAIL_CATEGORIES); default all-on.
EMAIL_CATEGORIES = ("application_updates", "messages", "security", "marketing")


def _default_categories() -> dict:
    return dict.fromkeys(EMAIL_CATEGORIES, True)


class QuietHours(BaseModel):
    start: str = ""  # "HH:MM"
    end: str = ""
    tz: str = ""  # IANA tz


class NotificationPrefs(BaseModel):
    user_id: str
    email_categories: dict = Field(default_factory=_default_categories)
    sms_critical: bool = False
    digest: str = "off"  # off | daily | weekly
    quiet_hours: QuietHours | None = None
    updated_at: datetime | None = None
