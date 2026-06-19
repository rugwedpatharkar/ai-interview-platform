"""SSO oauth_login: CSRF state check, new-email auto-provision, known-email link."""

import pytest
from lib.redis import RateLimiter
from lib.schemas import Role
from lib.security import RefreshSessionStore, TokenService
from starlette.testclient import TestClient

from app.config import get_settings
from app.errors import InvalidTokenError, RateLimitedError
from app.infra.oauth import FakeOAuthClient, HttpOAuthClient
from app.model.auth import User
from app.resources.auth import oauth_login
from app.routes.oauth import create_oauth_app


class _FakeStates:
    def __init__(self, valid):
        self._valid = set(valid)

    async def consume(self, state):
        ok = state in self._valid
        self._valid.discard(state)
        return ok


def _common(fakes):
    return {
        "users": fakes["users"],
        "tokens": TokenService("s" * 40),
        "sessions": RefreshSessionStore(fakes["redis"]),
        "limiter": RateLimiter(fakes["redis"]),
        "ip": "1.2.3.4",
        "refresh_ttl_seconds": 60,
    }


@pytest.mark.asyncio
async def test_oauth_state_mismatch_rejected(fakes):
    with pytest.raises(InvalidTokenError):
        await oauth_login(
            "google",
            "code",
            "bad",
            oauth_client=FakeOAuthClient("a@x.com"),
            states=_FakeStates([]),
            **_common(fakes),
        )


@pytest.mark.asyncio
async def test_oauth_unverified_email_rejected(fakes):
    with pytest.raises(InvalidTokenError):
        await oauth_login(
            "google",
            "code",
            "good",
            oauth_client=FakeOAuthClient("x@y.com", verified=False),
            states=_FakeStates(["good"]),
            **_common(fakes),
        )


@pytest.mark.asyncio
async def test_oauth_new_email_creates_verified_candidate(fakes):
    out = await oauth_login(
        "google",
        "code",
        "good",
        oauth_client=FakeOAuthClient("new@x.com"),
        states=_FakeStates(["good"]),
        **_common(fakes),
    )
    assert out["token_type"] == "bearer"
    assert out["access_token"]
    user = await fakes["users"].get_by_email("new@x.com")
    assert user is not None
    assert user["email_verified"] is True


@pytest.mark.asyncio
async def test_oauth_callback_rate_limited(fakes):
    # The per-IP gate is checked before the CSRF state, so even state-rejected callbacks
    # count — a flood from one IP is throttled rather than free to guess live states.
    limiter = RateLimiter(fakes["redis"])
    kw = {
        "oauth_client": FakeOAuthClient("a@x.com"),
        "users": fakes["users"],
        "tokens": TokenService("s" * 40),
        "sessions": RefreshSessionStore(fakes["redis"]),
        "limiter": limiter,
        "refresh_ttl_seconds": 60,
    }
    for _ in range(get_settings().oauth_limit):
        with pytest.raises(InvalidTokenError):
            await oauth_login(
                "google", "c", "bad", ip="5.5.5.5", states=_FakeStates([]), **kw
            )
    with pytest.raises(RateLimitedError):
        await oauth_login(
            "google", "c", "bad", ip="5.5.5.5", states=_FakeStates([]), **kw
        )


@pytest.mark.asyncio
async def test_oauth_writes_audit(fakes):
    await oauth_login(
        "google",
        "code",
        "good",
        oauth_client=FakeOAuthClient("aud@x.com"),
        states=_FakeStates(["good"]),
        audit=fakes["audit"],
        **_common(fakes),
    )
    assert any(r["action"] == "oauth_login" for r in fakes["audit"].records)


@pytest.mark.asyncio
async def test_oauth_known_email_links(fakes):
    await fakes["users"].insert(
        User(email="known@x.com", password_hash="h", role=Role.candidate)
    )
    out = await oauth_login(
        "google",
        "code",
        "good",
        oauth_client=FakeOAuthClient("known@x.com"),
        states=_FakeStates(["good"]),
        **_common(fakes),
    )
    assert out["access_token"]
    assert await fakes["users"].get_by_email("known@x.com") is not None


def _oauth_app(
    fakes, *, email="new@x.com", valid_state="good", authorize=None, cors_origins=None
):
    return create_oauth_app(
        {
            "oauth_client": FakeOAuthClient(email),
            "users": fakes["users"],
            "tokens": TokenService("s" * 40),
            "sessions": RefreshSessionStore(fakes["redis"]),
            "states": _FakeStates([valid_state]),
            "redis": fakes["redis"],
            "limiter": RateLimiter(fakes["redis"]),
            "audit": fakes["audit"],
            "trusted_proxy": False,
            "refresh_ttl_seconds": 60,
            "authorize": authorize or {},
            "frontend_redirect": "http://fe/callback",
            "allowed_redirects": ["http://fe/callback"],
            "cors_origins": cors_origins or ["http://fe"],
        }
    )


def test_callback_redirects_with_tokens(fakes):
    client = TestClient(_oauth_app(fakes))
    resp = client.get(
        "/auth/oauth/callback?provider=google&code=c&state=good",
        follow_redirects=False,
    )
    assert resp.status_code in (302, 307)
    assert "access_token" in resp.headers["location"]


@pytest.mark.asyncio
async def test_http_oauth_unknown_provider_raises():
    # An unconfigured provider must be a clean domain error (401), not a KeyError 500.
    with pytest.raises(InvalidTokenError):
        await HttpOAuthClient({}).exchange("nope", "code")


def test_callback_bad_state_redirects_with_error(fakes):
    # A failed callback bounces to the FE callback's #error branch, not a raw JSON 401.
    client = TestClient(_oauth_app(fakes))
    resp = client.get(
        "/auth/oauth/callback?provider=google&code=c&state=bad",
        follow_redirects=False,
    )
    assert resp.status_code in (302, 307)
    assert resp.headers["location"] == "http://fe/callback#error=auth_failed"
    # Error bounce must not leak the callback URL (code/state) via Referer.
    assert resp.headers["referrer-policy"] == "no-referrer"


def test_providers_lists_only_configured(fakes):
    app = _oauth_app(fakes, authorize={"google": {}, "microsoft": {}})
    resp = TestClient(app).get("/auth/oauth/providers")
    assert resp.status_code == 200
    assert resp.json()["providers"] == ["google", "microsoft"]


def test_authorize_unknown_provider_redirects_friendly(fakes):
    # No configured providers -> a button click bounces to a friendly error, not a 404.
    client = TestClient(_oauth_app(fakes))
    resp = client.get("/auth/oauth/authorize?provider=google", follow_redirects=False)
    assert resp.status_code in (302, 307)
    assert resp.headers["location"] == "http://fe/callback#error=unknown_provider"
    assert resp.headers["referrer-policy"] == "no-referrer"


def test_oauth_cookie_refresh_rotates_session(fakes):
    import asyncio

    tokens = TokenService("s" * 40)
    sessions = RefreshSessionStore(fakes["redis"])
    jti = "jti-sso-1"

    async def _seed():
        uid = await fakes["users"].insert(
            User(email="sso@x.com", password_hash="", role=Role.candidate)
        )
        await sessions.allow(uid, jti, 60)
        return uid

    uid = asyncio.run(_seed())
    refresh = tokens.refresh_token(sub=uid, jti=jti)
    app = create_oauth_app(
        {
            "oauth_client": FakeOAuthClient("sso@x.com"),
            "users": fakes["users"],
            "tokens": tokens,
            "sessions": sessions,
            "states": _FakeStates([]),
            "redis": fakes["redis"],
            "limiter": RateLimiter(fakes["redis"]),
            "trusted_proxy": False,
            "refresh_ttl_seconds": 60,
            "authorize": {},
            "frontend_redirect": "http://fe/callback",
            "allowed_redirects": [],
        }
    )
    resp = TestClient(app).post(
        "/auth/oauth/refresh", cookies={"refresh_token": refresh}
    )
    assert resp.status_code == 200
    assert resp.json()["access_token"]
    assert "refresh_token=" in resp.headers.get("set-cookie", "")


def test_oauth_cookie_refresh_no_cookie_is_401(fakes):
    resp = TestClient(_oauth_app(fakes)).post("/auth/oauth/refresh")
    assert resp.status_code == 401


def test_oauth_refresh_rate_limited(fakes):
    # The cookie-refresh must also be rate-limited; a flood from one IP gets 429. The
    # gate runs before the cookie check, so no-cookie calls count too.
    client = TestClient(_oauth_app(fakes))
    for _ in range(get_settings().refresh_limit):
        client.post("/auth/oauth/refresh")
    assert client.post("/auth/oauth/refresh").status_code == 429


def test_oauth_cors_preflight_allows_credentialed_fe_origin(fakes):
    # The credentialed cookie-refresh is cross-origin; the preflight must echo the FE
    # origin + allow credentials (no CORS would block the browser response).
    client = TestClient(_oauth_app(fakes))
    resp = client.options(
        "/auth/oauth/refresh",
        headers={
            "Origin": "http://fe",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert resp.status_code in (200, 204)
    assert resp.headers["access-control-allow-origin"] == "http://fe"
    assert resp.headers["access-control-allow-credentials"] == "true"


def test_oauth_cors_wildcard_drops_credentials(fakes):
    # A "*" origin must NOT carry credentials — else Starlette reflects ANY origin with
    # Allow-Credentials:true (a universal credentialed-CORS bypass).
    client = TestClient(_oauth_app(fakes, cors_origins=["*"]))
    resp = client.options(
        "/auth/oauth/refresh",
        headers={
            "Origin": "http://evil.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert resp.headers.get("access-control-allow-credentials") != "true"


def test_callback_keeps_refresh_in_cookie_not_url(fakes):
    client = TestClient(_oauth_app(fakes))
    resp = client.get(
        "/auth/oauth/callback?provider=google&code=c&state=good",
        follow_redirects=False,
    )
    assert resp.status_code in (302, 307)
    location = resp.headers["location"]
    assert "access_token" in location
    assert "refresh_token" not in location  # long-lived token never rides the URL
    cookie = resp.headers["set-cookie"]
    assert cookie.startswith("refresh_token=")
    assert "HttpOnly" in cookie
    assert "Secure" in cookie
    assert "samesite=lax" in cookie.lower()
    assert resp.headers["cache-control"] == "no-store"
    assert resp.headers["referrer-policy"] == "no-referrer"
