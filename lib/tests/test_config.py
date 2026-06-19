import pytest
from lib.config import BaseServiceSettings
from pydantic import ValidationError


def test_s3_settings_defaults(monkeypatch):
    for var in (
        "S3_ENDPOINT_URL",
        "S3_REGION",
        "S3_BUCKET",
        "STORAGE_PRESIGN_TTL_SECONDS",
    ):
        monkeypatch.delenv(var, raising=False)
    s = BaseServiceSettings()
    assert s.s3_endpoint_url is None
    assert s.s3_region == "auto"
    assert s.s3_bucket == "interview-platform"
    assert s.storage_presign_ttl_seconds == 900


def test_auth_token_ttls():
    s = BaseServiceSettings()
    assert s.access_token_minutes == 15
    assert s.refresh_token_minutes == 10080  # shortened to 7 days


def test_rejects_weak_jwt_secret():
    with pytest.raises(ValidationError):
        BaseServiceSettings(jwt_secret="short")


def test_allows_empty_and_strong_secret():
    # Empty is allowed (TokenService fails closed at construction); 32+ chars are fine.
    assert BaseServiceSettings(jwt_secret="").jwt_secret == ""
    strong = "x" * 32
    assert BaseServiceSettings(jwt_secret=strong).jwt_secret == strong
