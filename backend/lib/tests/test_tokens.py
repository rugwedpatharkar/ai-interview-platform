from datetime import UTC, datetime, timedelta

import pytest
from jose import JWTError, jwt
from lib.security import TokenService

SECRET = "test-secret-" + "x" * 32


def test_access_token_roundtrip_carries_aud_and_iss():
    svc = TokenService(SECRET)
    token = svc.access_token(sub="u1", role="candidate", comp_id=None, jti="j1")
    claims = svc.decode(token, expected_type="access")
    assert claims["sub"] == "u1"
    assert claims["iss"] == "admin"
    assert claims["aud"] == "interview-platform"


def test_access_token_sid_claim_is_optional_and_additive():
    svc = TokenService(SECRET)
    # sid (the refresh-session id) is included only when supplied; callers unchanged.
    with_sid = svc.decode(
        svc.access_token("u1", "candidate", None, "j1", sid="s1"),
        expected_type="access",
    )
    assert with_sid["sid"] == "s1"
    without = svc.decode(
        svc.access_token("u1", "candidate", None, "j1"), expected_type="access"
    )
    assert "sid" not in without


def test_decode_rejects_foreign_audience():
    # A token signed with the same secret but a different audience must be rejected.
    now = datetime.now(UTC)
    forged = jwt.encode(
        {
            "sub": "u1",
            "iat": now,
            "exp": now + timedelta(minutes=5),
            "iss": "admin",
            "aud": "someone-else",
        },
        SECRET,
        algorithm="HS256",
    )
    with pytest.raises(JWTError):
        TokenService(SECRET).decode(forged)


def test_reset_token_expires_sooner_than_verify_token():
    svc = TokenService(SECRET)
    verify = svc.decode(svc.verification_token("u1"))
    reset = svc.decode(svc.reset_token("u1"))
    assert reset["exp"] < verify["exp"]


def test_mfa_token_carries_purpose_and_is_short_lived():
    svc = TokenService(SECRET)
    claims = svc.decode(svc.mfa_token("u1", "j1"))
    assert claims["purpose"] == "mfa"
    assert claims["sub"] == "u1" and claims["jti"] == "j1"
    # The MFA challenge is shorter-lived than a normal access token.
    access = svc.decode(
        svc.access_token("u1", "candidate", None, "j2"), expected_type="access"
    )
    assert claims["exp"] < access["exp"]
