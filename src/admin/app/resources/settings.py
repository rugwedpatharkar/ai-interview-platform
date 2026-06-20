"""Self-scoped account settings — notification preferences (first SettingsService cut).

The caller is the token (no target user_id in any request). Sessions / 2FA / password +
email change land additively on the same service. `digest`, quiet-hours `HH:MM`, and a
real IANA `tz` are validated at the boundary; absent prefs read as safe defaults.
"""

import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.errors import ValidationError
from app.model.notification_prefs import _default_categories

_DIGESTS = {"off", "daily", "weekly"}
_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _valid_tz(tz: str) -> bool:
    try:
        ZoneInfo(tz)
        return True
    except (ZoneInfoNotFoundError, ValueError):
        return False


def _dto(doc: dict) -> dict:
    qh = doc.get("quiet_hours")
    return {
        "email_categories": doc.get("email_categories") or _default_categories(),
        "sms_critical": bool(doc.get("sms_critical", False)),
        "digest": doc.get("digest", "off"),
        "quiet_hours": (
            {
                "start": qh.get("start", ""),
                "end": qh.get("end", ""),
                "tz": qh.get("tz", ""),
            }
            if qh
            else None
        ),
    }


async def get_notification_prefs(user_id, *, prefs):
    doc = await prefs.get_by_user(user_id)
    return _dto(doc or {})


async def set_notification_prefs(user_id, payload, *, prefs):
    digest = payload.get("digest") or "off"
    if digest not in _DIGESTS:
        raise ValidationError("digest must be off, daily, or weekly")
    quiet_hours = payload.get("quiet_hours")
    if quiet_hours:
        start, end, tz = (
            quiet_hours.get("start", ""),
            quiet_hours.get("end", ""),
            quiet_hours.get("tz", ""),
        )
        if not _HHMM.match(start) or not _HHMM.match(end):
            raise ValidationError("quiet hours must be HH:MM")
        if not _valid_tz(tz):
            raise ValidationError("quiet hours tz must be a valid IANA timezone")
    fields = {
        "email_categories": payload.get("email_categories") or {},
        "sms_critical": bool(payload.get("sms_critical", False)),
        "digest": digest,
        "quiet_hours": quiet_hours or None,
    }
    await prefs.upsert(user_id, fields)
    return await get_notification_prefs(user_id, prefs=prefs)
