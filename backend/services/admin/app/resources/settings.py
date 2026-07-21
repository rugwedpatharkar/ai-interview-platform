"""Self-scoped account settings — notification preferences (first SettingsService cut).

The caller is the token (no target user_id in any request). Sessions / 2FA / password +
email change land additively on the same service. `digest`, quiet-hours `HH:MM`, and a
real IANA `tz` are validated at the boundary; absent prefs read as safe defaults.
"""

import re
import secrets
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from jose import JWTError
from lib.logging import bind_ids, get_logger, log_context
from lib.security import hash_password, verify_password
from pydantic import EmailStr, TypeAdapter
from pydantic import ValidationError as PydanticValidationError

from app.errors import (
    ConflictError,
    InvalidCredentialsError,
    InvalidTokenError,
    NotFoundError,
    RateLimitedError,
    ValidationError,
)
from app.model.audit import AuditLog
from app.model.notification_prefs import _default_categories

log = get_logger(component="settings.resources")

_DIGESTS = {"off", "daily", "weekly"}
_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_RECOVERY_CODE_COUNT = 10
_MIN_PASSWORD = 8  # there is no backend register min-length today; this defines it
_CHPW_LIMIT = 5
_CHPW_WINDOW = 300  # seconds
_EMAIL_CHANGE_TTL = 86400  # 24h, matches the verification token


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
    async with log_context(
        log, "resource.settings.get_notification_prefs", **bind_ids(user_id=user_id)
    ):
        doc = await prefs.get_by_user(user_id)
        return _dto(doc or {})


async def set_notification_prefs(user_id, payload, *, prefs):
    async with log_context(
        log, "resource.settings.set_notification_prefs", **bind_ids(user_id=user_id)
    ):
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
    # Stage an encrypted TOTP secret (disabled until VerifyTotp); return URI+secret.
    async with log_context(
        log, "resource.settings.setup_totp", **bind_ids(user_id=user_id)
    ):
        user = await users.get(user_id)
        secret = totp.new_secret()
        await users.update_fields(
            user_id, {"totp_secret": secretbox.encrypt(secret), "totp_enabled": False}
        )
        uri = totp.provisioning_uri(secret, account=(user or {}).get("email", ""))
        return {"provisioning_uri": uri, "secret": secret}


async def verify_totp(user_id, code, *, users, totp, secretbox):
    # Confirm a code against the staged secret -> enable + issue recovery codes.
    async with log_context(
        log, "resource.settings.verify_totp", **bind_ids(user_id=user_id)
    ):
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
    # Disable 2FA on a valid TOTP code OR an unused recovery code.
    async with log_context(
        log, "resource.settings.disable_totp", **bind_ids(user_id=user_id)
    ):
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


async def change_password(
    user_id,
    current_password,
    new_password,
    current_sid,
    *,
    users,
    sessions,
    limiter=None,
    audit=None,
):
    # Self-service password change. SSO-only accounts (blank hash) can't; the current
    # password must verify; the new one meets the min length; then OTHER sessions are
    # revoked (keep-current via the caller's sid).
    async with log_context(
        log, "resource.settings.change_password", **bind_ids(user_id=user_id)
    ):
        if limiter is not None:
            hit = await limiter.hit(f"chpw:{user_id}", _CHPW_LIMIT, _CHPW_WINDOW)
            if not hit.allowed:
                raise RateLimitedError(hit.retry_after)
        user = await users.get(user_id)
        if not user or not user.get("password_hash"):
            raise ValidationError("password change is unavailable for SSO accounts")
        if not verify_password(current_password, user["password_hash"]):
            raise ValidationError("current password is incorrect")
        if len(new_password) < _MIN_PASSWORD:
            raise ValidationError(
                f"password must be at least {_MIN_PASSWORD} characters"
            )
        await users.update_fields(
            user_id, {"password_hash": hash_password(new_password)}
        )
        if current_sid:
            await sessions.revoke_all_except(user_id, current_sid)
        else:
            await sessions.revoke_user(user_id)
        if audit is not None:
            await audit.insert(
                AuditLog(entity="user", entity_id=user_id, action="password_changed")
            )
        return {"ok": True}


async def request_email_change(
    user_id,
    new_email,
    current_password,
    *,
    users,
    tokens,
    notifier,
    nonces=None,
    audit=None,
):
    """Stage a new email + send a single-use confirm link to it. Requires the
    current password (stolen access token alone is not enough). Also notifies the
    OLD address so a compromised account can react.

    The new address is only swapped in once VerifyEmailChange consumes the link
    (the new email is never trusted from the token — it's read from `pending_email`).
    """
    async with log_context(
        log, "resource.settings.request_email_change", **bind_ids(user_id=user_id)
    ):
        new_email = (new_email or "").strip().lower()
        try:
            TypeAdapter(EmailStr).validate_python(new_email)
        except PydanticValidationError as exc:
            raise ValidationError("invalid email address") from exc
        user = await users.get(user_id)
        if not user:
            raise NotFoundError("User not found")
        # SSO-only accounts have no password to challenge; refuse email change from
        # this path (the OAuth provider already owns the email).
        stored_hash = user.get("password_hash", "")
        if not stored_hash:
            raise InvalidCredentialsError(
                "email change requires password login (SSO account)"
            )
        if not verify_password(current_password or "", stored_hash):
            log.warning("email change denied: bad password for user_id={}", user_id)
            raise InvalidCredentialsError("invalid password")
        if await users.get_by_email(new_email):
            raise ConflictError("Email already registered")
        await users.update_fields(user_id, {"pending_email": new_email})
        jti = uuid4().hex
        token = tokens.verification_token(sub=user_id, jti=jti)
        if nonces is not None:
            await nonces.allow(jti, _EMAIL_CHANGE_TTL)
        await notifier.send_email(
            new_email, "Confirm your new email", f"/verify-email?token={token}"
        )
        # Security alert to the CURRENT address: a compromised access token now
        # can't silently move the account to an attacker-controlled inbox.
        old_email = user.get("email")
        if old_email:
            try:
                await notifier.send_email(
                    old_email,
                    "Someone requested an email change on your account",
                    f"If this wasn't you, sign in and change your password now. "
                    f"New address requested: {new_email}",
                )
            except Exception:
                log.exception("email change: old-address notify failed for {}", user_id)
        if audit is not None:
            await audit.insert(
                AuditLog(
                    entity="user",
                    entity_id=user_id,
                    action="email_change_requested",
                )
            )
        return {"ok": True}


async def verify_email_change(token, *, users, tokens, nonces=None, audit=None):
    # Confirm a staged email change. NOT caller-gated (the link is the proof); the
    # single-use nonce blocks replay. Swaps `email = pending_email` from the DB.
    async with log_context(log, "resource.settings.verify_email_change", **bind_ids()):
        try:
            claims = tokens.decode(token)
        except JWTError as exc:
            raise InvalidTokenError("Invalid token") from exc
        if claims.get("purpose") != "email_verify":
            raise InvalidTokenError("Wrong token purpose")
        if nonces is not None and not await nonces.consume(claims.get("jti", "")):
            raise InvalidTokenError("Token already used or expired")
        user = await users.get(claims["sub"])
        if not user or user.get("erased"):
            raise NotFoundError("User not found")
        pending = user.get("pending_email", "")
        if not pending:
            raise ValidationError("no pending email change")
        other = await users.get_by_email(pending)
        if other and str(other["_id"]) != claims["sub"]:
            raise ConflictError("Email already registered")
        await users.update_fields(
            claims["sub"],
            {"email": pending, "pending_email": "", "email_verified": True},
        )
        if audit is not None:
            await audit.insert(
                AuditLog(entity="user", entity_id=claims["sub"], action="email_changed")
            )
        return {"ok": True}


async def list_sessions(user_id, current_sid, *, sessions):
    # The caller's active refresh sessions; `current` marks the caller's own device.
    async with log_context(
        log, "resource.settings.list_sessions", **bind_ids(user_id=user_id)
    ):
        rows = await sessions.list_for_user(user_id)
        return [
            {
                "jti": r["jti"],
                "ip": r["meta"].get("ip", ""),
                "user_agent": r["meta"].get("user_agent", ""),
                "created_at": r["meta"].get("created_at", ""),
                "last_seen": r["meta"].get("last_seen", ""),
                "current": r["jti"] == current_sid,
            }
            for r in rows
        ]


async def revoke_session(user_id, jti, *, sessions):
    # Revoke one of the caller's own sessions. A jti not in their set -> NotFound
    # (no cross-user revoke, and no existence leak).
    async with log_context(
        log, "resource.settings.revoke_session", **bind_ids(user_id=user_id)
    ):
        rows = await sessions.list_for_user(user_id)
        if jti not in {r["jti"] for r in rows}:
            raise NotFoundError("session not found")
        await sessions.revoke(jti)
        return {"ok": True}


async def revoke_all_sessions(user_id, current_sid, *, sessions):
    # Log out everywhere else — revoke all the caller's sessions but the current.
    async with log_context(
        log, "resource.settings.revoke_all_sessions", **bind_ids(user_id=user_id)
    ):
        await sessions.revoke_all_except(user_id, current_sid)
        return {"ok": True}
