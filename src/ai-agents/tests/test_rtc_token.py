"""RTC join-token minter: the JWT is room-scoped and decodable with the right claims.

The /rtc-token transport is covered over gRPC in test_grpc_services.py; this file keeps
the resource-level minter tests.
"""

import jwt  # PyJWT — already a dep via lib.security

from app.resources.voice.rtc_token import mint_join_token

_API_KEY = "devkey"
_API_SECRET = "s" * 32  # 32-char secret satisfies livekit-api minimum


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
    video = jwt.decode(tok, _API_SECRET, algorithms=["HS256"])["video"]
    assert video["canPublish"] is True
    assert video["canSubscribe"] is True
    assert video["canPublishData"] is True


def test_mint_token_uses_caller_identity():
    tok = mint_join_token(
        "interview-b2", "alice", api_key=_API_KEY, api_secret=_API_SECRET
    )
    claims = jwt.decode(tok, _API_SECRET, algorithms=["HS256"])
    assert claims["sub"] == "alice"
