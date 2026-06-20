"""Self-scoped account settings — notification preferences (first SettingsService cut).

The caller is the token (no target user_id in any request). Sessions / 2FA / password +
email change land additively on the same service. `digest`, quiet-hours `HH:MM`, and a
real IANA `tz` are validated at the boundary; absent prefs read as safe defaults.
"""

import re
import secrets
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from lib.security import hash_password, verify_password

from app.errors import ValidationError
from app.model.notification_prefs import _default_categories

_DIGESTS = {"off", "daily", "weekly"}
_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_RECOVERY_CODE_COUNT = 10


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


def _gen_recovery_code() -> str:
    return secrets.token_hex(5)  # 10 hex chars


async def setup_totp(user_id, *, users, totp, secretbox):
    """Stage an encrypted TOTP secret (disabled until VerifyTotp); return URI+secret."""
    user = await users.get(user_id)
    secret = totp.new_secret()
    await users.update_fields(
        user_id, {"totp_secret": secretbox.encrypt(secret), "totp_enabled": False}
    )
    uri = totp.provisioning_uri(secret, account=(user or {}).get("email", ""))
    return {"provisioning_uri": uri, "secret": secret}


async def verify_totp(user_id, code, *, users, totp, secretbox):
    """Confirm a code against the staged secret -> enable + issue recovery codes."""
    user = await users.get(user_id)
    enc = (user or {}).get("totp_secret", "")
    if not enc:
        raise ValidationError("set up 2FA first")
    if not totp.verify(secretbox.decrypt(enc), code):
        raise ValidationError("invalid code")
    codes = [_gen_recovery_code() for _ in range(_RECOVERY_CODE_COUNT)]
    await users.update_fields(
        user_id,
        {"totp_enabled": True, "recovery_codes": [hash_password(c) for c in codes]},
    )
    return {"enabled": True, "recovery_codes": codes}


async def disable_totp(user_id, code, *, users, totp, secretbox):
    """Disable 2FA on a valid TOTP code OR an unused recovery code."""
    user = await users.get(user_id)
    if not (user or {}).get("totp_enabled"):
        raise ValidationError("2FA is not enabled")
    secret = secretbox.decrypt(user.get("totp_secret", ""))
    code = (code or "").strip()
    recovery_match = any(
        verify_password(code, h) for h in user.get("recovery_codes", [])
    )
    if not totp.verify(secret, code) and not recovery_match:
        raise ValidationError("invalid code")
    await users.update_fields(
        user_id, {"totp_secret": "", "totp_enabled": False, "recovery_codes": []}
    )
    return {"ok": True}
