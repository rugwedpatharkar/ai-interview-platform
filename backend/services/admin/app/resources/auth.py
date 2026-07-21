"""Auth business logic — transport-agnostic resource functions.

Each function takes its collaborators (repos, token service, session store, rate
limiter, notifier) as explicit arguments, returns a plain dict, and raises an
`app.errors` domain error on failure. The routes layer (gRPC) maps those errors to
status codes and the dicts to proto messages — it performs no logic of its own.
"""

from uuid import uuid4

from jose import JWTError
from lib.logging import bind_ids, get_logger, log_context
from lib.schemas import Role
from lib.security import hash_password, verify_password
from pydantic import ValidationError as PydanticValidationError
from pymongo.errors import DuplicateKeyError

from app.config import get_settings
from app.errors import (
    ConflictError,
    ForbiddenError,
    InvalidCredentialsError,
    InvalidTokenError,
    NotFoundError,
    RateLimitedError,
    ValidationError,
)
from app.model.audit import AuditLog
from app.model.auth import Company, User

log = get_logger(component="auth.resources")


def _build_user(**fields) -> User:
    """Construct a User, converting model-validation failures (e.g. a malformed or
    reserved-domain email at the registration boundary) into a domain ValidationError
    so the gRPC layer returns INVALID_ARGUMENT — not an uncaught-exception INTERNAL."""
    try:
        return User(**fields)
    except PydanticValidationError as exc:
        raise ValidationError("Invalid email address") from exc


VERIFY_NONCE_TTL = 86400  # 24h, matches the verification token
RESET_NONCE_TTL = 3600  # 1h, matches the reset token
_MFA_NONCE_TTL = 300  # 5m, matches the mfa_token TTL


async def _send_verification(notifier, tokens, user_id, email, nonces=None):
    jti = uuid4().hex if nonces is not None else None
    token = tokens.verification_token(sub=user_id, jti=jti)
    if nonces is not None:
        await nonces.allow(jti, VERIFY_NONCE_TTL)
    await notifier.send_email(email, "Verify your email", f"/verify?token={token}")


async def register_company(
    company_name, email, password, *, companies, users, tokens, notifier, nonces=None
):
    async with log_context(log, "resource.auth.register_company", **bind_ids()):
        email = email.strip().lower()  # normalize so case/space can't mint a duplicate
        if await users.get_by_email(email):
            log.info("register_company rejected: email already registered")
            raise ConflictError("Email already registered")
        comp_id = await companies.insert(Company(name=company_name))
        try:
            user_id = await users.insert(
                _build_user(
                    email=email,
                    password_hash=hash_password(password),
                    role=Role.company_admin,
                    comp_id=comp_id,
                    status="active",  # the founding admin is active from creation
                )
            )
        except DuplicateKeyError as exc:
            log.warning("register_company: duplicate email under concurrency")
            raise ConflictError("Email already registered") from exc
        await _send_verification(notifier, tokens, user_id, email, nonces)
        log.info("company registered: comp_id={} user_id={}", comp_id, user_id)
        return {
            "id": user_id,
            "email": email,
            "role": Role.company_admin.value,
            "comp_id": comp_id,
            "email_verified": False,
        }


async def register_candidate(email, password, *, users, tokens, notifier, nonces=None):
    async with log_context(log, "resource.auth.register_candidate", **bind_ids()):
        email = email.strip().lower()  # normalize so case/space can't mint a duplicate
        if await users.get_by_email(email):
            log.info("register_candidate rejected: email already registered")
            raise ConflictError("Email already registered")
        try:
            user_id = await users.insert(
                _build_user(
                    email=email,
                    password_hash=hash_password(password),
                    role=Role.candidate,
                )
            )
        except DuplicateKeyError as exc:
            log.warning("register_candidate: duplicate email under concurrency")
            raise ConflictError("Email already registered") from exc
        await _send_verification(notifier, tokens, user_id, email, nonces)
        log.info("candidate registered: user_id={}", user_id)
        return {
            "id": user_id,
            "email": email,
            "role": Role.candidate.value,
            "comp_id": None,
            "email_verified": False,
        }


async def verify_email(token, *, users, tokens, nonces=None):
    async with log_context(log, "resource.auth.verify_email", **bind_ids()):
        try:
            claims = tokens.decode(token)
        except JWTError as exc:
            log.warning("verify: invalid token")
            raise InvalidTokenError("Invalid token") from exc
        if claims.get("purpose") != "email_verify":
            log.warning("verify: wrong token purpose")
            raise InvalidTokenError("Wrong token purpose")
        if nonces is not None and not await nonces.consume(claims.get("jti", "")):
            log.warning("verify: token already used or expired")
            raise InvalidTokenError("Token already used or expired")
        user = await users.get(claims["sub"])
        if not user or user.get("erased"):
            log.warning("verify: user not found")
            raise NotFoundError("User not found")
        await users.set_email_verified(claims["sub"])
        # A pending company member (recruiter / hiring_manager invited via TeamService)
        # becomes active once they verify; candidates have no comp_id and stay as-is.
        if user.get("comp_id"):
            await users.set_status(claims["sub"], "active")
        log.info("email verified: user_id={}", claims["sub"])
        return {
            "id": claims["sub"],
            "email": user["email"],
            "role": str(user["role"]),
            "comp_id": user.get("comp_id"),
            "email_verified": True,
        }


async def login(
    email,
    password,
    *,
    ip,
    user_agent="",
    users,
    tokens,
    sessions,
    limiter,
    refresh_ttl_seconds,
    audit=None,
    nonces=None,
):
    async with log_context(log, "resource.auth.login", **bind_ids()):
        email = (
            email.strip().lower()
        )  # normalize so the lockout key + lookup always agree
        s = get_settings()
        acct_key = f"login:acct:{email}"
        ip_hit = await limiter.hit(
            f"login:ip:{ip}", s.login_limit, s.login_window_seconds
        )
        acct = await limiter.peek(acct_key, s.login_limit)
        if not ip_hit.allowed or not acct.allowed:
            retry_after = max(ip_hit.retry_after, acct.retry_after)
            log.warning("login throttled: ip={} (per-ip and/or per-account)", ip)
            raise RateLimitedError(retry_after)
        user = await users.get_by_email(email)
        if (
            not user
            or not user.get("password_hash")
            or not verify_password(password, user["password_hash"])
        ):
            # Count only FAILED attempts against the account so a legitimate user's
            # correct logins never burn the lockout budget; the per-IP gate is the
            # primary control. An empty password_hash (SSO-only / erased account)
            # fails closed here rather than raising inside bcrypt — and still counts,
            # so it can't evade the lockout.
            await limiter.hit(acct_key, s.login_limit, s.login_window_seconds)
            log.warning("login failed: invalid or unset credentials")
            raise InvalidCredentialsError("Invalid credentials")
        await limiter.reset(acct_key)
        user_id = str(user["_id"])
        if user.get("totp_enabled"):
            # 2FA on: hand back a short-lived single-use challenge instead of tokens;
            # the caller completes via VerifyTotpLogin. The 2FA-off path is unchanged.
            mfa_jti = uuid4().hex
            mfa_token = tokens.mfa_token(sub=user_id, jti=mfa_jti)
            if nonces is not None:
                await nonces.allow(mfa_jti, _MFA_NONCE_TTL)
            log.info("login: 2FA required for user_id={}", user_id)
            return {
                "mfa_required": True,
                "mfa_token": mfa_token,
                "access_token": "",
                "refresh_token": "",
                "token_type": "",
            }
        refresh_jti = uuid4().hex
        access = tokens.access_token(
            sub=user_id,
            role=str(user["role"]),
            comp_id=user.get("comp_id"),
            jti=uuid4().hex,
            sid=refresh_jti,
            email=user.get("email"),
        )
        refresh = tokens.refresh_token(sub=user_id, jti=refresh_jti)
        await sessions.allow(
            user_id, refresh_jti, refresh_ttl_seconds, ip=ip, user_agent=user_agent
        )
        if audit is not None:
            await audit.insert(
                AuditLog(entity="user", entity_id=user_id, action="login")
            )
        log.info("login ok: user_id={}", user_id)
        return {
            "access_token": access,
            "refresh_token": refresh,
            "token_type": "bearer",
        }


async def verify_totp_login(
    mfa_token,
    code,
    *,
    users,
    tokens,
    sessions,
    nonces,
    totp,
    secretbox,
    refresh_ttl_seconds,
    ip="",
    user_agent="",
):
    async with log_context(log, "resource.auth.verify_totp_login", **bind_ids()):
        # Complete a 2FA login: validate the single-use mfa challenge, verify a TOTP
        # code OR consume an unused recovery code, then mint access + refresh.
        # Pre-auth (no caller identity) — the mfa_token from Login is the proof.
        try:
            claims = tokens.decode(mfa_token)
        except JWTError as exc:
            raise InvalidTokenError("Invalid token") from exc
        if claims.get("purpose") != "mfa":
            raise InvalidTokenError("Wrong token purpose")
        if nonces is not None and not await nonces.consume(claims.get("jti", "")):
            raise InvalidTokenError("MFA challenge already used or expired")
        user = await users.get(claims["sub"])
        if not user or not user.get("totp_enabled"):
            raise InvalidCredentialsError("2FA is not available")
        user_id = str(user["_id"])
        secret = secretbox.decrypt(user.get("totp_secret", ""))
        code = (code or "").strip()
        if not totp.verify(secret, code):
            matched = next(
                (h for h in user.get("recovery_codes", []) if verify_password(code, h)),
                None,
            )
            if matched is None:
                raise InvalidCredentialsError("invalid code")
            # Atomic $pull ensures exactly-once consumption: two concurrent verifies
            # with the same code both match the read-copy, but only one $pull removes
            # it. The loser sees modified_count == 0 and is rejected as a reuse.
            if not await users.consume_recovery_code(user_id, matched):
                raise InvalidCredentialsError("invalid code")
        refresh_jti = uuid4().hex
        access = tokens.access_token(
            sub=user_id,
            role=str(user["role"]),
            comp_id=user.get("comp_id"),
            jti=uuid4().hex,
            sid=refresh_jti,
            email=user.get("email"),
        )
        refresh = tokens.refresh_token(sub=user_id, jti=refresh_jti)
        await sessions.allow(
            user_id, refresh_jti, refresh_ttl_seconds, ip=ip, user_agent=user_agent
        )
        log.info("2FA login completed: user_id={}", user_id)
        return {
            "access_token": access,
            "refresh_token": refresh,
            "token_type": "bearer",
        }


def identity_from_token(token, *, tokens):
    try:
        claims = tokens.decode(token, expected_type="access")
    except JWTError as exc:
        log.warning("identity: invalid access token")
        raise InvalidTokenError("Invalid token") from exc
    return {
        "id": claims["sub"],
        "role": str(claims["role"]),
        "comp_id": claims.get("comp_id"),
        "sid": claims.get(
            "sid"
        ),  # the caller's refresh-session jti (None on old tokens)
    }


async def refresh(
    refresh_token,
    *,
    users,
    tokens,
    sessions,
    refresh_ttl_seconds,
    ip="",
    user_agent="",
    limiter=None,
):
    async with log_context(log, "resource.auth.refresh", **bind_ids()):
        # Per-IP throttle: a leaked/guessed refresh token can otherwise be hammered
        # without any gate. Same knobs as the OAuth cookie-refresh path.
        if limiter is not None and ip:
            s = get_settings()
            hit = await limiter.hit(
                f"refresh:ip:{ip}", s.refresh_limit, s.refresh_window_seconds
            )
            if not hit.allowed:
                log.warning("refresh throttled: ip={}", ip)
                raise RateLimitedError(hit.retry_after)
        try:
            claims = tokens.decode(refresh_token, expected_type="refresh")
        except JWTError as exc:
            log.warning("refresh: invalid refresh token")
            raise InvalidTokenError("Invalid refresh token") from exc
        jti, sub = claims["jti"], claims["sub"]
        if not await sessions.is_active(jti):
            log.warning(
                "refresh: reuse detected; revoking session family for user={}", sub
            )
            await sessions.revoke_user(sub)
            raise InvalidTokenError("Refresh token is no longer active")
        user = await users.get(sub)
        if not user:
            await sessions.revoke(jti)
            raise NotFoundError("User not found")
        new_jti = uuid4().hex
        access = tokens.access_token(
            sub=sub,
            role=str(user["role"]),
            comp_id=user.get("comp_id"),
            jti=uuid4().hex,
            sid=new_jti,
            email=user.get("email"),
        )
        new_refresh = tokens.refresh_token(sub=sub, jti=new_jti)
        await sessions.allow(
            sub, new_jti, refresh_ttl_seconds, ip=ip, user_agent=user_agent
        )
        await sessions.revoke(jti)
        log.info("token refreshed: user_id={}", sub)
        return {
            "access_token": access,
            "refresh_token": new_refresh,
            "token_type": "bearer",
        }


async def logout(refresh_token, *, tokens, sessions):
    async with log_context(log, "resource.auth.logout", **bind_ids()):
        try:
            claims = tokens.decode(refresh_token, expected_type="refresh")
        except JWTError:
            log.info("logout: token already invalid (idempotent)")
            return {"ok": True}
        await sessions.revoke(claims["jti"])
        log.info("logout: revoked refresh jti for user_id={}", claims["sub"])
        return {"ok": True}


async def _invite_company_user(
    email,
    password,
    role,
    *,
    comp_id,
    invited_by,
    audit_action,
    users,
    tokens,
    notifier,
    nonces=None,
    audit=None,
):
    """Shared company-seat invite: create a `pending` member + send the verify email +
    audit. Used by `invite_recruiter` (legacy) and `TeamService.InviteMember`."""
    email = email.strip().lower()  # normalize so case/space can't mint a duplicate
    if await users.get_by_email(email):
        raise ConflictError("Email already registered")
    try:
        user_id = await users.insert(
            User(
                email=email,
                password_hash=hash_password(password),
                role=role,
                comp_id=comp_id,
                status="pending",
                invited_by=invited_by,
            )
        )
    except DuplicateKeyError as exc:
        raise ConflictError("Email already registered") from exc
    await _send_verification(notifier, tokens, user_id, email, nonces)
    if audit is not None:
        await audit.insert(
            AuditLog(
                entity="user",
                entity_id=user_id,
                action=audit_action,
                comp_id=comp_id,
            )
        )
    return {
        "id": user_id,
        "email": email,
        "role": role.value,
        "comp_id": comp_id,
        "email_verified": False,
    }


async def invite_recruiter(
    caller, email, password, *, users, tokens, notifier, nonces=None, audit=None
):
    """The route must validate the token via `caller_identity` first (so expired /
    invalid tokens abort with UNAUTHENTICATED, not INVALID_ARGUMENT) and pass the
    resulting caller dict here."""
    async with log_context(log, "resource.auth.invite_recruiter", **bind_ids()):
        if caller["role"] != Role.company_admin.value:
            log.warning("invite_recruiter denied: caller role={}", caller["role"])
            raise ForbiddenError("Only a company admin can invite recruiters")
        out = await _invite_company_user(
            email,
            password,
            Role.recruiter,
            comp_id=caller["comp_id"],
            invited_by=caller["id"],
            audit_action="recruiter_invited",
            users=users,
            tokens=tokens,
            notifier=notifier,
            nonces=nonces,
            audit=audit,
        )
        log.info(
            "recruiter invited: comp_id={} user_id={}", caller["comp_id"], out["id"]
        )
        return out


async def resend_verification(
    email, *, users, tokens, notifier, nonces=None, limiter=None, ip=None
):
    async with log_context(log, "resource.auth.resend_verification", **bind_ids()):
        # Re-send the email-verification link. Rate-limited by IP when `limiter`
        # and `ip` are provided. Always returns success so callers cannot enumerate
        # registered addresses or verification status.
        if limiter is not None and ip is not None:
            s = get_settings()
            hit = await limiter.hit(
                f"resend:ip:{ip}", s.resend_limit, s.resend_window_seconds
            )
            if not hit.allowed:
                log.warning("resend_verification throttled: ip={}", ip)
                raise RateLimitedError(hit.retry_after)
        email = email.strip().lower()
        user = await users.get_by_email(email)
        if user and not user.get("email_verified"):
            await _send_verification(notifier, tokens, str(user["_id"]), email, nonces)
            log.info("resend_verification: sent to existing unverified account")
        else:
            log.info("resend_verification: no-op (unknown or already-verified)")
        return {"ok": True}


async def forgot_password(
    email, *, users, tokens, notifier, nonces=None, limiter=None, ip=None
):
    async with log_context(log, "resource.auth.forgot_password", **bind_ids()):
        # Per-IP throttle: without this, an attacker mass-triggers reset emails against
        # a captured email list — spammy for users, wasteful for Redis nonces.
        if limiter is not None and ip:
            s = get_settings()
            hit = await limiter.hit(
                f"forgot:ip:{ip}", s.resend_limit, s.resend_window_seconds
            )
            if not hit.allowed:
                log.warning("forgot_password throttled: ip={}", ip)
                raise RateLimitedError(hit.retry_after)
        email = (
            email.strip().lower()
        )  # normalize so a case/space variant still resolves
        user = await users.get_by_email(email)
        if user:
            jti = uuid4().hex if nonces is not None else None
            token = tokens.reset_token(sub=str(user["_id"]), jti=jti)
            if nonces is not None:
                await nonces.allow(jti, RESET_NONCE_TTL)
            await notifier.send_email(
                email, "Reset your password", f"/reset?token={token}"
            )
            log.info("password reset requested for an existing account")
        else:
            log.info("password reset requested for unknown account (uniform response)")
        return {"ok": True}


async def reset_password(
    token,
    new_password,
    *,
    users,
    tokens,
    sessions,
    nonces=None,
    audit=None,
    limiter=None,
    ip=None,
):
    async with log_context(log, "resource.auth.reset_password", **bind_ids()):
        # Per-IP throttle: bounds offline password-guessing-via-forced-reset floods.
        if limiter is not None and ip:
            s = get_settings()
            hit = await limiter.hit(
                f"reset:ip:{ip}", s.resend_limit, s.resend_window_seconds
            )
            if not hit.allowed:
                log.warning("reset_password throttled: ip={}", ip)
                raise RateLimitedError(hit.retry_after)
        try:
            claims = tokens.decode(token)
        except JWTError as exc:
            log.warning("reset: invalid token")
            raise InvalidTokenError("Invalid reset token") from exc
        if claims.get("purpose") != "password_reset":
            log.warning("reset: wrong token purpose")
            raise InvalidTokenError("Wrong token purpose")
        if nonces is not None and not await nonces.consume(claims.get("jti", "")):
            log.warning("reset: token already used or expired")
            raise InvalidTokenError("Token already used or expired")
        sub = claims["sub"]
        user = await users.get(sub)
        if not user or user.get("erased"):
            raise NotFoundError("User not found")
        await users.update(sub, {"password_hash": hash_password(new_password)})
        if audit is not None:
            await audit.insert(
                AuditLog(entity="user", entity_id=sub, action="password_reset")
            )
        await sessions.revoke_user(sub)
        log.info("password reset complete; sessions revoked for user_id={}", sub)
        return {"ok": True}


async def oauth_login(
    provider,
    code,
    state,
    *,
    ip,
    oauth_client,
    users,
    tokens,
    sessions,
    states,
    limiter,
    refresh_ttl_seconds,
    audit=None,
):
    async with log_context(log, "resource.auth.oauth_login", **bind_ids()):
        # SSO: rate-limit by IP, verify CSRF state, exchange the code for a verified
        # email, link/create the user, mint tokens like `login` (auto-provisions a
        # candidate).
        # Per-IP gate first: a callback flood must not get unlimited tries at guessing a
        # live CSRF state or hammering the provider's token endpoint.
        s = get_settings()
        hit = await limiter.hit(f"oauth:ip:{ip}", s.oauth_limit, s.oauth_window_seconds)
        if not hit.allowed:
            log.warning("oauth throttled: ip={}", ip)
            raise RateLimitedError(hit.retry_after)
        if not await states.consume(state):
            log.warning("oauth: invalid or expired state")
            raise InvalidTokenError("Invalid or expired OAuth state")
        email, verified = await oauth_client.exchange(provider, code)
        if not verified:
            log.warning("oauth: provider returned an unverified email")
            raise InvalidTokenError("OAuth email not verified by the provider")
        email = email.strip().lower()
        user = await users.get_by_email(email)
        if user is None:
            user_id = await users.insert(
                User(
                    email=email,
                    password_hash="",  # SSO-only account — no password login
                    role=Role.candidate,
                    email_verified=True,
                )
            )
            user = await users.get(user_id)
        user_id = str(user["_id"])
        refresh_jti = uuid4().hex
        access = tokens.access_token(
            sub=user_id,
            role=str(user["role"]),
            comp_id=user.get("comp_id"),
            jti=uuid4().hex,
            sid=refresh_jti,
            email=user.get("email"),
        )
        refresh = tokens.refresh_token(sub=user_id, jti=refresh_jti)
        await sessions.allow(user_id, refresh_jti, refresh_ttl_seconds)
        if audit is not None:
            await audit.insert(
                AuditLog(entity="user", entity_id=user_id, action="oauth_login")
            )
        log.info("oauth login ok: provider={} user_id={}", provider, user_id)
        return {
            "access_token": access,
            "refresh_token": refresh,
            "token_type": "bearer",
        }
