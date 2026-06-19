import pytest
from jose import JWTError
from lib.security import TokenService, hash_password, verify_password

SECRET = "test-secret-" + "x" * 32


def test_password_roundtrip():
    h = hash_password("s3cret")
    assert h != "s3cret"
    assert verify_password("s3cret", h) is True
    assert verify_password("wrong", h) is False


def test_long_password_not_truncated():
    # Two 100-char passwords sharing a 72-byte prefix must NOT collide.
    a = "A" * 100
    b = "A" * 72 + "B" * 28
    assert verify_password(b, hash_password(a)) is False


def test_access_token_claims():
    svc = TokenService(SECRET)
    claims = svc.decode(
        svc.access_token(sub="u1", role="recruiter", comp_id="c1", jti="j1")
    )
    assert claims["sub"] == "u1"
    assert claims["role"] == "recruiter"
    assert claims["comp_id"] == "c1"
    assert claims["jti"] == "j1"
    assert claims["type"] == "access"


def test_verification_token_purpose():
    svc = TokenService(SECRET)
    claims = svc.decode(svc.verification_token(sub="u1"))
    assert claims["purpose"] == "email_verify"


def test_reset_token_purpose():
    svc = TokenService(SECRET)
    claims = svc.decode(svc.reset_token(sub="u1"))
    assert claims["purpose"] == "password_reset"
    assert claims["sub"] == "u1"


def test_empty_secret_rejected():
    with pytest.raises(ValueError):
        TokenService("")


def test_refresh_token_type():
    svc = TokenService(SECRET)
    claims = svc.decode(svc.refresh_token(sub="u1", jti="r1"), expected_type="refresh")
    assert claims["type"] == "refresh"
    assert claims["jti"] == "r1"


def test_decode_rejects_wrong_type():
    svc = TokenService(SECRET)
    access = svc.access_token(sub="u1", role="recruiter", comp_id="c1", jti="j1")
    with pytest.raises(JWTError):
        svc.decode(access, expected_type="refresh")
