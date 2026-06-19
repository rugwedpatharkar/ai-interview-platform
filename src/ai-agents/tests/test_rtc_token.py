"""Tests for the RTC join-token minter and the /rtc-token endpoint.

Token minter tests: prove the JWT is room-scoped and decodable with the right claims.
Endpoint tests: prove ownership enforcement (401/403/404/503) and the happy-path 200.
"""

import jwt  # PyJWT — already a dep via lib.security
import pytest
from fastapi.testclient import TestClient
from lib.security import TokenService

from app.model.interview import (
    CompetencyArea,
    InterviewBlueprint,
    InterviewSession,
)
from app.resources.voice.rtc_token import mint_join_token
from app.routes.interview_api import create_app

_SECRET = "test-secret"
_API_KEY = "devkey"
_API_SECRET = "s" * 32  # 32-char secret satisfies livekit-api minimum


# ---------------------------------------------------------------------------
# Token minter tests
# ---------------------------------------------------------------------------


def test_mint_token_is_room_scoped_and_decodable():
    tok = mint_join_token(
        "interview-a1", "u1", api_key=_API_KEY, api_secret=_API_SECRET, ttl_seconds=900
    )
    claims = jwt.decode(tok, _API_SECRET, algorithms=["HS256"])
    assert claims["video"]["room"] == "interview-a1"
    assert claims["video"]["roomJoin"] is True
    assert claims["sub"] == "u1"


def test_mint_token_encodes_all_grants():
    tok = mint_join_token(
        "interview-x", "uid42", api_key=_API_KEY, api_secret=_API_SECRET, ttl_seconds=60
    )
    claims = jwt.decode(tok, _API_SECRET, algorithms=["HS256"])
    video = claims["video"]
    assert video["canPublish"] is True
    assert video["canSubscribe"] is True
    assert video["canPublishData"] is True


def test_mint_token_uses_caller_identity():
    tok = mint_join_token(
        "interview-b2", "alice", api_key=_API_KEY, api_secret=_API_SECRET
    )
    claims = jwt.decode(tok, _API_SECRET, algorithms=["HS256"])
    assert claims["sub"] == "alice"


# ---------------------------------------------------------------------------
# Helpers for endpoint tests
# ---------------------------------------------------------------------------


def _access_token(user_id: str) -> str:
    return TokenService(secret=_SECRET).access_token(user_id, "candidate", None, "j1")


class _FakeSettings:
    """Minimal settings stub that carries only the LiveKit config fields."""

    def __init__(self, *, key: str = _API_KEY, secret: str = _API_SECRET):
        self.livekit_url = "ws://localhost:7880"
        self.livekit_api_key = key
        self.livekit_api_secret = secret
        self.voice_rtc_token_ttl_seconds = 900


def _session(candidate_user_id: str = "u1") -> InterviewSession:
    return InterviewSession(
        application_id="a1",
        comp_id="c1",
        candidate_user_id=candidate_user_id,
        current_question="Q1",
        blueprint=InterviewBlueprint(competencies=[CompetencyArea(name="python")]),
    )


def _client(*, sessions=None, settings=None):
    """Build a TestClient with just enough deps for the /rtc-token route."""

    class _Tokens:
        def decode(self, token, expected_type):
            return TokenService(secret=_SECRET).decode(
                token, expected_type=expected_type
            )

    class _MinimalSessions:
        def __init__(self, store=None):
            self.saved = store or {}

        async def get(self, application_id):
            return self.saved.get(application_id)

    deps = {
        "tokens": _Tokens(),
        "sessions": sessions if sessions is not None else _MinimalSessions(),
        "settings": settings if settings is not None else _FakeSettings(),
        # stubs for other deps the router imports but this route doesn't use
        "data": None,
        "capability": None,
        "publisher": None,
        "llm": None,
    }
    return TestClient(create_app(deps))


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------


def test_rtc_token_requires_auth():
    """No bearer token -> 401."""
    client = _client()
    assert client.post("/interview/a1/rtc-token").status_code == 401


def test_rtc_token_404_when_no_session():
    """Session doesn't exist -> 404 even for a valid bearer."""
    client = _client()  # sessions store is empty
    resp = client.post(
        "/interview/a1/rtc-token",
        headers={"Authorization": f"Bearer {_access_token('u1')}"},
    )
    assert resp.status_code == 404


def test_rtc_token_403_when_wrong_user():
    """Session exists but caller is not the owner -> 403."""

    class _Sessions:
        async def get(self, _):
            return _session(candidate_user_id="u1")

    client = _client(sessions=_Sessions())
    resp = client.post(
        "/interview/a1/rtc-token",
        headers={"Authorization": f"Bearer {_access_token('intruder')}"},
    )
    assert resp.status_code == 403


def test_rtc_token_503_when_keys_unset():
    """Keys blank -> 503 (voice not configured); secret must not be exposed."""

    class _Sessions:
        async def get(self, _):
            return _session(candidate_user_id="u1")

    settings_no_keys = _FakeSettings(key="", secret="")
    client = _client(sessions=_Sessions(), settings=settings_no_keys)
    resp = client.post(
        "/interview/a1/rtc-token",
        headers={"Authorization": f"Bearer {_access_token('u1')}"},
    )
    assert resp.status_code == 503
    # Ensure the (empty) secret is not echoed in the response body
    assert "secret" not in resp.text.lower()


def test_rtc_token_200_returns_url_token_room():
    """Happy path: owner gets {url, token, room} with a valid JWT."""

    class _Sessions:
        async def get(self, _):
            return _session(candidate_user_id="u1")

    client = _client(sessions=_Sessions())
    resp = client.post(
        "/interview/a1/rtc-token",
        headers={"Authorization": f"Bearer {_access_token('u1')}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["url"] == "ws://localhost:7880"
    assert body["room"] == "interview-a1"
    # Token must be a decodable JWT scoped to the right room + identity
    claims = jwt.decode(body["token"], _API_SECRET, algorithms=["HS256"])
    assert claims["video"]["room"] == "interview-a1"
    assert claims["sub"] == "u1"


@pytest.mark.parametrize("app_id", ["abc123", "def456"])
def test_rtc_token_room_derived_from_path_parameter(app_id):
    """Room name in the JWT matches the URL's application_id."""

    class _Sessions:
        async def get(self, aid):
            # Return a session for whatever application_id is requested
            return InterviewSession(
                application_id=aid,
                comp_id="c1",
                candidate_user_id="u1",
                current_question="Q1",
                blueprint=InterviewBlueprint(
                    competencies=[CompetencyArea(name="python")]
                ),
            )

    client = _client(sessions=_Sessions())
    resp = client.post(
        f"/interview/{app_id}/rtc-token",
        headers={"Authorization": f"Bearer {_access_token('u1')}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["room"] == f"interview-{app_id}"
    claims = jwt.decode(body["token"], _API_SECRET, algorithms=["HS256"])
    assert claims["video"]["room"] == f"interview-{app_id}"
