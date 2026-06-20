import grpc
import pytest
from lib.redis import RateLimiter
from lib.schemas import Role
from lib.security import (
    RefreshSessionStore,
    SingleUseTokenStore,
    TokenService,
    hash_password,
)

from app.infra.notifier import LoggingNotifier
from app.model.auth import User
from app.routes.auth import AuthServicer, _client_ip
from app.routes.pb import auth_pb2

SECRET = "test-secret-" + "x" * 32


class _Aborted(Exception):
    def __init__(self, code, details):
        super().__init__(details)
        self.code = code


class FakeContext:
    """Minimal grpc.aio ServicerContext stand-in for direct servicer calls."""

    def __init__(self, metadata=None, peer="ipv4:1.2.3.4:1"):
        self._md = metadata or []
        self._peer = peer

    def invocation_metadata(self):
        return self._md

    def peer(self):
        return self._peer

    async def abort(self, code, details):
        raise _Aborted(code, details)


def _servicer(fakes):
    return AuthServicer(
        users=fakes["users"],
        companies=fakes["companies"],
        tokens=TokenService(SECRET),
        sessions=RefreshSessionStore(fakes["redis"]),
        limiter=RateLimiter(fakes["redis"]),
        notifier=LoggingNotifier(),
        refresh_ttl_seconds=1209600,
    )


@pytest.mark.asyncio
async def test_register_login_me_flow(fakes):
    svc = _servicer(fakes)
    ctx = FakeContext()
    reg = await svc.RegisterCompany(
        auth_pb2.RegisterCompanyRequest(
            company_name="Acme", email="boss@acme.com", password="pw123456"
        ),
        ctx,
    )
    assert reg.role == "company_admin"
    assert reg.comp_id
    tok = await svc.Login(
        auth_pb2.LoginRequest(email="boss@acme.com", password="pw123456"), ctx
    )
    assert tok.access_token and tok.refresh_token
    me_ctx = FakeContext(metadata=[("authorization", f"Bearer {tok.access_token}")])
    ident = await svc.Me(auth_pb2.MeRequest(), me_ctx)
    assert ident.role == "company_admin"
    assert ident.comp_id


@pytest.mark.asyncio
async def test_duplicate_email_already_exists(fakes):
    svc = _servicer(fakes)
    req = auth_pb2.RegisterCompanyRequest(
        company_name="A", email="dup@x.com", password="pw123456"
    )
    await svc.RegisterCompany(req, FakeContext())
    with pytest.raises(_Aborted) as ei:
        await svc.RegisterCompany(req, FakeContext())
    assert ei.value.code == grpc.StatusCode.ALREADY_EXISTS


@pytest.mark.asyncio
async def test_login_wrong_password_unauthenticated(fakes):
    svc = _servicer(fakes)
    await svc.RegisterCandidate(
        auth_pb2.RegisterCandidateRequest(email="c@x.com", password="pw123456"),
        FakeContext(),
    )
    with pytest.raises(_Aborted) as ei:
        await svc.Login(
            auth_pb2.LoginRequest(email="c@x.com", password="nope1234"), FakeContext()
        )
    assert ei.value.code == grpc.StatusCode.UNAUTHENTICATED


@pytest.mark.asyncio
async def test_me_requires_auth(fakes):
    svc = _servicer(fakes)
    with pytest.raises(_Aborted) as ei:
        await svc.Me(auth_pb2.MeRequest(), FakeContext())
    assert ei.value.code == grpc.StatusCode.UNAUTHENTICATED


@pytest.mark.asyncio
async def test_me_with_invalid_token_is_unauthenticated(fakes):
    # An expired/garbage token must abort UNAUTHENTICATED (not INVALID_ARGUMENT) so that
    # the FE gRPC-web transport refreshes-and-retries instead of hard-failing the call.
    svc = _servicer(fakes)
    ctx = FakeContext(metadata=[("authorization", "Bearer not.a.valid.token")])
    with pytest.raises(_Aborted) as ei:
        await svc.Me(auth_pb2.MeRequest(), ctx)
    assert ei.value.code == grpc.StatusCode.UNAUTHENTICATED


@pytest.mark.asyncio
async def test_refresh_and_logout_rpc(fakes):
    svc = _servicer(fakes)
    ctx = FakeContext()
    await svc.RegisterCompany(
        auth_pb2.RegisterCompanyRequest(
            company_name="Acme", email="boss@acme.com", password="pw123456"
        ),
        ctx,
    )
    tok = await svc.Login(
        auth_pb2.LoginRequest(email="boss@acme.com", password="pw123456"), ctx
    )
    rotated = await svc.Refresh(
        auth_pb2.RefreshRequest(refresh_token=tok.refresh_token), ctx
    )
    assert rotated.access_token
    assert rotated.refresh_token != tok.refresh_token
    out = await svc.Logout(
        auth_pb2.LogoutRequest(refresh_token=rotated.refresh_token), ctx
    )
    assert out.ok is True


@pytest.mark.asyncio
async def test_refresh_reuse_aborts(fakes):
    svc = _servicer(fakes)
    ctx = FakeContext()
    await svc.RegisterCompany(
        auth_pb2.RegisterCompanyRequest(
            company_name="Acme", email="b@acme.com", password="pw123456"
        ),
        ctx,
    )
    tok = await svc.Login(
        auth_pb2.LoginRequest(email="b@acme.com", password="pw123456"), ctx
    )
    await svc.Refresh(auth_pb2.RefreshRequest(refresh_token=tok.refresh_token), ctx)
    with pytest.raises(_Aborted) as ei:
        await svc.Refresh(auth_pb2.RefreshRequest(refresh_token=tok.refresh_token), ctx)
    assert ei.value.code == grpc.StatusCode.INVALID_ARGUMENT


@pytest.mark.asyncio
async def test_invite_recruiter_rpc(fakes):
    svc = _servicer(fakes)
    ctx = FakeContext()
    await svc.RegisterCompany(
        auth_pb2.RegisterCompanyRequest(
            company_name="Acme", email="admin@acme.com", password="pw123456"
        ),
        ctx,
    )
    tok = await svc.Login(
        auth_pb2.LoginRequest(email="admin@acme.com", password="pw123456"), ctx
    )
    md = FakeContext(metadata=[("authorization", f"Bearer {tok.access_token}")])
    invited = await svc.InviteRecruiter(
        auth_pb2.InviteRecruiterRequest(email="rec@acme.com", password="pw123456"), md
    )
    assert invited.role == "recruiter"
    assert invited.comp_id


@pytest.mark.asyncio
async def test_invite_recruiter_requires_auth(fakes):
    svc = _servicer(fakes)
    with pytest.raises(_Aborted) as ei:
        await svc.InviteRecruiter(
            auth_pb2.InviteRecruiterRequest(email="r@x.com", password="pw123456"),
            FakeContext(),
        )
    assert ei.value.code == grpc.StatusCode.UNAUTHENTICATED


@pytest.mark.asyncio
async def test_forgot_password_rpc_is_uniform(fakes):
    svc = _servicer(fakes)
    out = await svc.ForgotPassword(
        auth_pb2.ForgotPasswordRequest(email="nobody@x.com"), FakeContext()
    )
    assert out.ok is True


@pytest.mark.asyncio
async def test_reset_password_bad_token_aborts(fakes):
    svc = _servicer(fakes)
    with pytest.raises(_Aborted) as ei:
        await svc.ResetPassword(
            auth_pb2.ResetPasswordRequest(token="garbage", new_password="newpw1234"),
            FakeContext(),
        )
    assert ei.value.code == grpc.StatusCode.INVALID_ARGUMENT


def test_client_ip_ignores_forwarded_for_by_default():
    # No proxy in this deployment: X-Forwarded-For is attacker-controlled and must NOT
    # override the transport peer (else the per-IP login limit is trivially spoofable).
    ctx = FakeContext(metadata=[("x-forwarded-for", "9.9.9.9, 10.0.0.1")])
    assert _client_ip(ctx) == "ipv4:1.2.3.4:1"
    # Only a trusted proxy deployment opts into honoring the header.
    assert _client_ip(ctx, trusted_proxy=True) == "9.9.9.9"


def test_client_ip_falls_back_to_peer():
    # Native path / no proxy header: use the transport peer.
    assert _client_ip(FakeContext(peer="ipv4:1.2.3.4:1")) == "ipv4:1.2.3.4:1"


# --- MFA over the servicer (L1.5) ---


class _FakeTotp:
    def verify(self, secret, code):
        return secret == "S" and code == "123456"


class _FakeBox:
    def decrypt(self, token):
        return token.removeprefix("enc:")


def _servicer_2fa(fakes):
    return AuthServicer(
        users=fakes["users"],
        companies=fakes["companies"],
        tokens=TokenService(SECRET),
        sessions=RefreshSessionStore(fakes["redis"]),
        limiter=RateLimiter(fakes["redis"]),
        notifier=LoggingNotifier(),
        refresh_ttl_seconds=1209600,
        nonces=SingleUseTokenStore(fakes["redis"]),
        totp=_FakeTotp(),
        secretbox=_FakeBox(),
    )


async def _seed_2fa(fakes):
    await fakes["users"].insert(
        User(
            email="mfa@x.com",
            password_hash=hash_password("pw123456"),
            role=Role.candidate,
            totp_enabled=True,
            totp_secret="enc:S",
        )
    )


@pytest.mark.asyncio
async def test_2fa_off_login_returns_tokens_no_mfa_fields(fakes):
    svc = _servicer(fakes)
    ctx = FakeContext()
    await svc.RegisterCompany(
        auth_pb2.RegisterCompanyRequest(
            company_name="A", email="x@x.com", password="pw123456"
        ),
        ctx,
    )
    tok = await svc.Login(
        auth_pb2.LoginRequest(email="x@x.com", password="pw123456"), ctx
    )
    assert tok.access_token and tok.refresh_token
    assert tok.mfa_required is False and tok.mfa_token == ""  # proto defaults


@pytest.mark.asyncio
async def test_2fa_login_challenge_then_verify_completes(fakes):
    svc = _servicer_2fa(fakes)
    ctx = FakeContext()
    await _seed_2fa(fakes)
    tok = await svc.Login(
        auth_pb2.LoginRequest(email="mfa@x.com", password="pw123456"), ctx
    )
    assert tok.mfa_required is True and tok.mfa_token and tok.access_token == ""
    final = await svc.VerifyTotpLogin(
        auth_pb2.VerifyTotpLoginRequest(mfa_token=tok.mfa_token, code="123456"), ctx
    )
    assert final.access_token and final.refresh_token


@pytest.mark.asyncio
async def test_verify_totp_login_wrong_code_unauthenticated(fakes):
    svc = _servicer_2fa(fakes)
    ctx = FakeContext()
    await _seed_2fa(fakes)
    tok = await svc.Login(
        auth_pb2.LoginRequest(email="mfa@x.com", password="pw123456"), ctx
    )
    with pytest.raises(_Aborted) as e:
        await svc.VerifyTotpLogin(
            auth_pb2.VerifyTotpLoginRequest(mfa_token=tok.mfa_token, code="000000"), ctx
        )
    assert e.value.code == grpc.StatusCode.UNAUTHENTICATED
