import pytest
from lib.redis import RateLimiter
from lib.schemas import Role
from lib.security import (
    RefreshSessionStore,
    SingleUseTokenStore,
    TokenService,
    hash_password,
)

from app.config import get_settings
from app.errors import (
    ConflictError,
    ForbiddenError,
    InvalidCredentialsError,
    InvalidTokenError,
    NotFoundError,
    RateLimitedError,
)
from app.infra.notifier import LoggingNotifier
from app.model.auth import User
from app.resources import auth

SECRET = "test-secret-" + "x" * 32


def _services(fakes):
    return {
        "users": fakes["users"],
        "companies": fakes["companies"],
        "tokens": TokenService(SECRET),
        "notifier": LoggingNotifier(),
        "sessions": RefreshSessionStore(fakes["redis"]),
        "limiter": RateLimiter(fakes["redis"]),
    }


@pytest.mark.asyncio
async def test_register_company(fakes):
    s = _services(fakes)
    out = await auth.register_company(
        "Acme",
        "boss@acme.com",
        "pw123456",
        companies=s["companies"],
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    assert out["role"] == "company_admin"
    assert out["comp_id"]
    assert out["email_verified"] is False
    assert s["notifier"].sent[0][0] == "boss@acme.com"


@pytest.mark.asyncio
async def test_register_company_duplicate(fakes):
    s = _services(fakes)
    kw = {
        "companies": s["companies"],
        "users": s["users"],
        "tokens": s["tokens"],
        "notifier": s["notifier"],
    }
    await auth.register_company("Acme", "dup@x.com", "pw123456", **kw)
    with pytest.raises(ConflictError):
        await auth.register_company("Acme", "dup@x.com", "pw123456", **kw)


@pytest.mark.asyncio
async def test_register_candidate_has_no_comp(fakes):
    s = _services(fakes)
    out = await auth.register_candidate(
        "c@x.com",
        "pw123456",
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    assert out["role"] == "candidate"
    assert out["comp_id"] is None


@pytest.mark.asyncio
async def test_verify_email(fakes):
    s = _services(fakes)
    await auth.register_company(
        "Acme",
        "v@acme.com",
        "pw123456",
        companies=s["companies"],
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    token = s["notifier"].sent[0][2].split("token=")[1]
    out = await auth.verify_email(token, users=s["users"], tokens=s["tokens"])
    assert out["email_verified"] is True


@pytest.mark.asyncio
async def test_verify_wrong_purpose(fakes):
    s = _services(fakes)
    bad = s["tokens"].access_token(sub="u1", role="candidate", comp_id=None, jti="j1")
    with pytest.raises(InvalidTokenError):
        await auth.verify_email(bad, users=s["users"], tokens=s["tokens"])


@pytest.mark.asyncio
async def test_login_and_identity(fakes):
    s = _services(fakes)
    await auth.register_company(
        "Acme",
        "boss@acme.com",
        "pw123456",
        companies=s["companies"],
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    out = await auth.login(
        "boss@acme.com",
        "pw123456",
        ip="1.2.3.4",
        users=s["users"],
        tokens=s["tokens"],
        sessions=s["sessions"],
        limiter=s["limiter"],
        refresh_ttl_seconds=1209600,
    )
    assert out["access_token"] and out["refresh_token"]
    ident = auth.identity_from_token(out["access_token"], tokens=s["tokens"])
    assert ident["role"] == "company_admin"
    assert ident["comp_id"]


@pytest.mark.asyncio
async def test_login_wrong_password(fakes):
    s = _services(fakes)
    await auth.register_candidate(
        "c@x.com",
        "pw123456",
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    with pytest.raises(InvalidCredentialsError):
        await auth.login(
            "c@x.com",
            "nope1234",
            ip="1.2.3.4",
            users=s["users"],
            tokens=s["tokens"],
            sessions=s["sessions"],
            limiter=s["limiter"],
            refresh_ttl_seconds=100,
        )


@pytest.mark.asyncio
async def test_login_lockout(fakes):
    s = _services(fakes)
    await auth.register_company(
        "Acme",
        "boss@acme.com",
        "pw123456",
        companies=s["companies"],
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    for _ in range(5):
        with pytest.raises(InvalidCredentialsError):
            await auth.login(
                "boss@acme.com",
                "wrongpw1",
                ip="1.2.3.4",
                users=s["users"],
                tokens=s["tokens"],
                sessions=s["sessions"],
                limiter=s["limiter"],
                refresh_ttl_seconds=100,
            )
    with pytest.raises(RateLimitedError):
        await auth.login(
            "boss@acme.com",
            "pw123456",
            ip="1.2.3.4",
            users=s["users"],
            tokens=s["tokens"],
            sessions=s["sessions"],
            limiter=s["limiter"],
            refresh_ttl_seconds=100,
        )


@pytest.mark.asyncio
async def test_login_empty_password_hash_fails_closed(fakes):
    # An SSO-only (or GDPR-erased) account has an empty password_hash; a password login
    # must fail as invalid creds — not raise inside bcrypt — and still count against the
    # per-account lockout so it can't be used to evade the limiter.
    s = _services(fakes)
    await fakes["users"].insert(
        User(email="sso@x.com", password_hash="", role=Role.candidate)
    )
    # The per-account counter trips only once it EXCEEDS the limit, and increments after
    # the gate check, so LIMIT+1 failed attempts are needed before the next call locks.
    for i in range(get_settings().login_limit + 1):
        with pytest.raises(InvalidCredentialsError):
            await auth.login(
                "sso@x.com",
                "anything1",
                ip=f"9.9.9.{i}",  # vary IP so the per-account gate is what trips
                users=s["users"],
                tokens=s["tokens"],
                sessions=s["sessions"],
                limiter=s["limiter"],
                refresh_ttl_seconds=100,
            )
    with pytest.raises(RateLimitedError):
        await auth.login(
            "sso@x.com",
            "anything1",
            ip="9.9.9.250",
            users=s["users"],
            tokens=s["tokens"],
            sessions=s["sessions"],
            limiter=s["limiter"],
            refresh_ttl_seconds=100,
        )


@pytest.mark.asyncio
async def test_successful_login_resets_account_counter(fakes):
    s = _services(fakes)
    await auth.register_company(
        "Acme",
        "boss@acme.com",
        "pw123456",
        companies=s["companies"],
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    with pytest.raises(InvalidCredentialsError):
        await auth.login(
            "boss@acme.com",
            "wrongpw1",
            ip="9.9.9.9",
            users=s["users"],
            tokens=s["tokens"],
            sessions=s["sessions"],
            limiter=s["limiter"],
            refresh_ttl_seconds=100,
        )
    assert "rl:login:acct:boss@acme.com" in fakes["redis"].kv  # failure counted
    await auth.login(
        "boss@acme.com",
        "pw123456",
        ip="9.9.9.9",
        users=s["users"],
        tokens=s["tokens"],
        sessions=s["sessions"],
        limiter=s["limiter"],
        refresh_ttl_seconds=100,
    )
    assert "rl:login:acct:boss@acme.com" not in fakes["redis"].kv  # reset on success


@pytest.mark.asyncio
async def test_account_lockout_key_is_normalized(fakes):
    s = _services(fakes)
    with pytest.raises(InvalidCredentialsError):
        await auth.login(
            "MixedCase@X.com",
            "whatever",
            ip="9.9.9.9",
            users=s["users"],
            tokens=s["tokens"],
            sessions=s["sessions"],
            limiter=s["limiter"],
            refresh_ttl_seconds=100,
        )
    assert "rl:login:acct:mixedcase@x.com" in fakes["redis"].kv


@pytest.mark.asyncio
async def test_verify_token_is_single_use(fakes):
    s = _services(fakes)
    nonces = SingleUseTokenStore(fakes["redis"])
    await auth.register_candidate(
        "c@x.com",
        "pw123456",
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
        nonces=nonces,
    )
    token = s["notifier"].sent[-1][2].split("token=", 1)[1]
    out = await auth.verify_email(
        token, users=s["users"], tokens=s["tokens"], nonces=nonces
    )
    assert out["email_verified"] is True
    with pytest.raises(InvalidTokenError):  # replay of a consumed token is rejected
        await auth.verify_email(
            token, users=s["users"], tokens=s["tokens"], nonces=nonces
        )


@pytest.mark.asyncio
async def test_reset_password_rejected_for_erased_user(fakes):
    s = _services(fakes)
    out = await auth.register_candidate(
        "c@x.com",
        "pw123456",
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    await s["users"].anonymize(out["id"])  # tombstone the account
    token = s["tokens"].reset_token(sub=out["id"])
    with pytest.raises(NotFoundError):
        await auth.reset_password(
            token,
            "newpw1234",
            users=s["users"],
            tokens=s["tokens"],
            sessions=s["sessions"],
        )


@pytest.mark.asyncio
async def test_login_writes_audit(fakes):
    s = _services(fakes)
    await auth.register_company(
        "Acme",
        "boss@acme.com",
        "pw123456",
        companies=s["companies"],
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    await auth.login(
        "boss@acme.com",
        "pw123456",
        ip="1.1.1.1",
        users=s["users"],
        tokens=s["tokens"],
        sessions=s["sessions"],
        limiter=s["limiter"],
        refresh_ttl_seconds=100,
        audit=fakes["audit"],
    )
    assert any(r["action"] == "login" for r in fakes["audit"].records)


@pytest.mark.asyncio
async def test_email_case_normalized_on_register_and_login(fakes):
    s = _services(fakes)
    await auth.register_candidate(
        "User@X.com ",
        "pw123456",
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    # A case/space variant is the SAME account: a re-register conflicts, login resolves.
    with pytest.raises(ConflictError):
        await auth.register_candidate(
            "user@x.com",
            "pw999999",
            users=s["users"],
            tokens=s["tokens"],
            notifier=s["notifier"],
        )
    out = await auth.login(
        "  USER@x.com",
        "pw123456",
        ip="1.2.3.4",
        users=s["users"],
        tokens=s["tokens"],
        sessions=s["sessions"],
        limiter=s["limiter"],
        refresh_ttl_seconds=100,
    )
    assert out["access_token"]


@pytest.mark.asyncio
async def test_reset_password_writes_audit(fakes):
    s = _services(fakes)
    out = await auth.register_candidate(
        "c@x.com",
        "pw123456",
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    token = s["tokens"].reset_token(sub=out["id"])
    await auth.reset_password(
        token,
        "newpw1234",
        users=s["users"],
        tokens=s["tokens"],
        sessions=s["sessions"],
        audit=fakes["audit"],
    )
    assert any(r["action"] == "password_reset" for r in fakes["audit"].records)


async def _login_company(s, email="boss@acme.com"):
    await auth.register_company(
        "Acme",
        email,
        "pw123456",
        companies=s["companies"],
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    return await auth.login(
        email,
        "pw123456",
        ip="1.2.3.4",
        users=s["users"],
        tokens=s["tokens"],
        sessions=s["sessions"],
        limiter=s["limiter"],
        refresh_ttl_seconds=100,
    )


@pytest.mark.asyncio
async def test_refresh_rotates_and_detects_reuse(fakes):
    s = _services(fakes)
    first = await _login_company(s)
    r1 = first["refresh_token"]
    rotated = await auth.refresh(
        r1,
        users=s["users"],
        tokens=s["tokens"],
        sessions=s["sessions"],
        refresh_ttl_seconds=100,
    )
    assert rotated["access_token"]
    assert rotated["refresh_token"] != r1
    # Reusing the rotated-away token is detected and revokes the whole family.
    with pytest.raises(InvalidTokenError):
        await auth.refresh(
            r1,
            users=s["users"],
            tokens=s["tokens"],
            sessions=s["sessions"],
            refresh_ttl_seconds=100,
        )
    with pytest.raises(InvalidTokenError):
        await auth.refresh(
            rotated["refresh_token"],
            users=s["users"],
            tokens=s["tokens"],
            sessions=s["sessions"],
            refresh_ttl_seconds=100,
        )


@pytest.mark.asyncio
async def test_logout_revokes_refresh(fakes):
    s = _services(fakes)
    out = await _login_company(s)
    res = await auth.logout(
        out["refresh_token"], tokens=s["tokens"], sessions=s["sessions"]
    )
    assert res["ok"] is True
    with pytest.raises(InvalidTokenError):
        await auth.refresh(
            out["refresh_token"],
            users=s["users"],
            tokens=s["tokens"],
            sessions=s["sessions"],
            refresh_ttl_seconds=100,
        )


@pytest.mark.asyncio
async def test_invite_recruiter(fakes):
    s = _services(fakes)
    admin = await _login_company(s)
    invited = await auth.invite_recruiter(
        admin["access_token"],
        "rec@acme.com",
        "pw123456",
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    assert invited["role"] == "recruiter"
    assert invited["comp_id"]  # inherits the admin's company


@pytest.mark.asyncio
async def test_invite_recruiter_requires_company_admin(fakes):
    s = _services(fakes)
    await auth.register_candidate(
        "c@x.com",
        "pw123456",
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    cand = await auth.login(
        "c@x.com",
        "pw123456",
        ip="9.9.9.9",
        users=s["users"],
        tokens=s["tokens"],
        sessions=s["sessions"],
        limiter=s["limiter"],
        refresh_ttl_seconds=100,
    )
    with pytest.raises(ForbiddenError):
        await auth.invite_recruiter(
            cand["access_token"],
            "x@acme.com",
            "pw123456",
            users=s["users"],
            tokens=s["tokens"],
            notifier=s["notifier"],
        )


@pytest.mark.asyncio
async def test_forgot_password_is_uniform(fakes):
    s = _services(fakes)
    await _login_company(s)  # registers boss@acme.com
    r1 = await auth.forgot_password(
        "boss@acme.com", users=s["users"], tokens=s["tokens"], notifier=s["notifier"]
    )
    assert r1["ok"] is True
    assert s["notifier"].sent[-1][0] == "boss@acme.com"
    before = len(s["notifier"].sent)
    r2 = await auth.forgot_password(
        "nobody@x.com", users=s["users"], tokens=s["tokens"], notifier=s["notifier"]
    )
    assert r2["ok"] is True
    assert len(s["notifier"].sent) == before  # no email for unknown account


@pytest.mark.asyncio
async def test_reset_password_changes_pw_and_revokes_sessions(fakes):
    s = _services(fakes)
    login_out = await _login_company(s)
    await auth.forgot_password(
        "boss@acme.com", users=s["users"], tokens=s["tokens"], notifier=s["notifier"]
    )
    reset_tok = s["notifier"].sent[-1][2].split("token=")[1]
    res = await auth.reset_password(
        reset_tok,
        "newpw1234",
        users=s["users"],
        tokens=s["tokens"],
        sessions=s["sessions"],
    )
    assert res["ok"] is True
    with pytest.raises(InvalidTokenError):
        await auth.refresh(
            login_out["refresh_token"],
            users=s["users"],
            tokens=s["tokens"],
            sessions=s["sessions"],
            refresh_ttl_seconds=100,
        )
    relogin = await auth.login(
        "boss@acme.com",
        "newpw1234",
        ip="2.2.2.2",
        users=s["users"],
        tokens=s["tokens"],
        sessions=s["sessions"],
        limiter=s["limiter"],
        refresh_ttl_seconds=100,
    )
    assert relogin["access_token"]


# ---------------------------------------------------------------------------
# resend_verification
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_resend_verification_sends_to_unverified_user(fakes):
    s = _services(fakes)
    await auth.register_candidate(
        "unverified@x.com",
        "pw123456",
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    before = len(s["notifier"].sent)
    result = await auth.resend_verification(
        "unverified@x.com",
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    assert result["ok"] is True
    assert len(s["notifier"].sent) == before + 1
    assert s["notifier"].sent[-1][0] == "unverified@x.com"


@pytest.mark.asyncio
async def test_resend_verification_no_send_for_verified_user(fakes):
    s = _services(fakes)
    await auth.register_candidate(
        "verified@x.com",
        "pw123456",
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    # Manually mark as verified.
    user = await fakes["users"].get_by_email("verified@x.com")
    await fakes["users"].set_email_verified(user["_id"])
    before = len(s["notifier"].sent)
    result = await auth.resend_verification(
        "verified@x.com",
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    assert result["ok"] is True
    assert len(s["notifier"].sent) == before  # no additional email


@pytest.mark.asyncio
async def test_resend_verification_no_send_for_unknown_email(fakes):
    s = _services(fakes)
    before = len(s["notifier"].sent)
    result = await auth.resend_verification(
        "ghost@x.com",
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    assert result["ok"] is True
    assert len(s["notifier"].sent) == before  # no email sent


@pytest.mark.asyncio
async def test_resend_verification_rate_limited(fakes):
    s = _services(fakes)
    await auth.register_candidate(
        "rl@x.com",
        "pw123456",
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    kw = {
        "users": s["users"],
        "tokens": s["tokens"],
        "notifier": s["notifier"],
        "limiter": s["limiter"],
        "ip": "7.7.7.7",
    }
    s_cfg = get_settings()
    for _ in range(s_cfg.resend_limit):
        await auth.resend_verification("rl@x.com", **kw)
    with pytest.raises(RateLimitedError):
        await auth.resend_verification("rl@x.com", **kw)


# --- Login MFA branch + VerifyTotpLogin (L1.5) ---


class _FakeTotp:
    """Deterministic: the only valid code for secret 'S' is '123456'."""

    def verify(self, secret, code):
        return secret == "S" and code == "123456"


class _FakeBox:
    def decrypt(self, token):
        return token.removeprefix("enc:")


async def _seed_2fa_user(fakes, *, recovery=None):
    return await fakes["users"].insert(
        User(
            email="mfa@x.com",
            password_hash=hash_password("pw123456"),
            role=Role.candidate,
            totp_enabled=True,
            totp_secret="enc:S",
            recovery_codes=recovery or [],
        )
    )


@pytest.mark.asyncio
async def test_login_2fa_off_returns_tokens_byte_for_byte(fakes):
    s = _services(fakes)
    await auth.register_candidate(
        "plain@x.com",
        "pw123456",
        users=s["users"],
        tokens=s["tokens"],
        notifier=s["notifier"],
    )
    out = await auth.login(
        "plain@x.com",
        "pw123456",
        ip="1.1.1.1",
        users=s["users"],
        tokens=s["tokens"],
        sessions=s["sessions"],
        limiter=s["limiter"],
        refresh_ttl_seconds=100,
    )
    # The 2FA-off response is unchanged: tokens, no mfa fields.
    assert set(out) == {"access_token", "refresh_token", "token_type"}
    assert out["access_token"] and out["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_2fa_on_returns_mfa_challenge_not_tokens(fakes):
    s = _services(fakes)
    await _seed_2fa_user(fakes)
    nonces = SingleUseTokenStore(fakes["redis"])
    out = await auth.login(
        "mfa@x.com",
        "pw123456",
        ip="1.1.1.1",
        users=s["users"],
        tokens=s["tokens"],
        sessions=s["sessions"],
        limiter=s["limiter"],
        refresh_ttl_seconds=100,
        nonces=nonces,
    )
    assert out["mfa_required"] is True and out["mfa_token"]
    assert out["access_token"] == "" and out["refresh_token"] == ""


@pytest.mark.asyncio
async def test_verify_totp_login_completes_with_code(fakes):
    s = _services(fakes)
    await _seed_2fa_user(fakes)
    nonces = SingleUseTokenStore(fakes["redis"])
    challenge = await auth.login(
        "mfa@x.com",
        "pw123456",
        ip="1.1.1.1",
        users=s["users"],
        tokens=s["tokens"],
        sessions=s["sessions"],
        limiter=s["limiter"],
        refresh_ttl_seconds=100,
        nonces=nonces,
    )
    out = await auth.verify_totp_login(
        challenge["mfa_token"],
        "123456",
        users=s["users"],
        tokens=s["tokens"],
        sessions=s["sessions"],
        nonces=nonces,
        totp=_FakeTotp(),
        secretbox=_FakeBox(),
        refresh_ttl_seconds=100,
    )
    assert out["access_token"] and out["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_verify_totp_login_wrong_code_rejected(fakes):
    s = _services(fakes)
    await _seed_2fa_user(fakes)
    nonces = SingleUseTokenStore(fakes["redis"])
    challenge = await auth.login(
        "mfa@x.com",
        "pw123456",
        ip="1.1.1.1",
        users=s["users"],
        tokens=s["tokens"],
        sessions=s["sessions"],
        limiter=s["limiter"],
        refresh_ttl_seconds=100,
        nonces=nonces,
    )
    with pytest.raises(InvalidCredentialsError):
        await auth.verify_totp_login(
            challenge["mfa_token"],
            "000000",
            users=s["users"],
            tokens=s["tokens"],
            sessions=s["sessions"],
            nonces=nonces,
            totp=_FakeTotp(),
            secretbox=_FakeBox(),
            refresh_ttl_seconds=100,
        )


@pytest.mark.asyncio
async def test_verify_totp_login_replayed_challenge_rejected(fakes):
    s = _services(fakes)
    await _seed_2fa_user(fakes)
    nonces = SingleUseTokenStore(fakes["redis"])
    challenge = await auth.login(
        "mfa@x.com",
        "pw123456",
        ip="1.1.1.1",
        users=s["users"],
        tokens=s["tokens"],
        sessions=s["sessions"],
        limiter=s["limiter"],
        refresh_ttl_seconds=100,
        nonces=nonces,
    )
    kw = {
        "users": s["users"],
        "tokens": s["tokens"],
        "sessions": s["sessions"],
        "nonces": nonces,
        "totp": _FakeTotp(),
        "secretbox": _FakeBox(),
        "refresh_ttl_seconds": 100,
    }
    await auth.verify_totp_login(challenge["mfa_token"], "123456", **kw)
    with pytest.raises(InvalidTokenError):  # nonce already consumed
        await auth.verify_totp_login(challenge["mfa_token"], "123456", **kw)


@pytest.mark.asyncio
async def test_verify_totp_login_recovery_code_consumed(fakes):
    s = _services(fakes)
    uid = await _seed_2fa_user(fakes, recovery=[hash_password("rescue1")])
    nonces = SingleUseTokenStore(fakes["redis"])
    challenge = await auth.login(
        "mfa@x.com",
        "pw123456",
        ip="1.1.1.1",
        users=s["users"],
        tokens=s["tokens"],
        sessions=s["sessions"],
        limiter=s["limiter"],
        refresh_ttl_seconds=100,
        nonces=nonces,
    )
    out = await auth.verify_totp_login(
        challenge["mfa_token"],
        "rescue1",
        users=s["users"],
        tokens=s["tokens"],
        sessions=s["sessions"],
        nonces=nonces,
        totp=_FakeTotp(),
        secretbox=_FakeBox(),
        refresh_ttl_seconds=100,
    )
    assert out["access_token"]  # logged in via the recovery code
    assert (await fakes["users"].get(uid))["recovery_codes"] == []  # one-time, consumed
