"""Settings validation: a configured OAuth provider must carry every required key, so a
misconfiguration fails fast at startup rather than 500-ing mid-callback."""

import pytest

from app.config import _check_oauth_providers

_FULL = {
    "authorize_url": "a",
    "token_url": "t",
    "userinfo_url": "u",
    "client_id": "c",
    "client_secret": "s",
    "redirect_uri": "r",
    "scope": "openid email",
}


def test_oauth_provider_config_accepts_complete():
    assert _check_oauth_providers({"google": _FULL}) == {"google": _FULL}


def test_oauth_provider_config_rejects_missing_keys():
    with pytest.raises(ValueError):
        _check_oauth_providers({"google": {"client_id": "x"}})


def test_oauth_provider_config_empty_is_fine():
    assert _check_oauth_providers({}) == {}


def test_settings_rate_limit_defaults():
    from app.config import Settings

    s = Settings()
    assert s.login_limit == 5
    assert s.login_window_seconds == 900
    assert s.oauth_limit == 10
    assert s.oauth_window_seconds == 900
    assert s.refresh_limit == 30
    assert s.refresh_window_seconds == 900


def test_settings_rate_limit_rejects_non_positive():
    import pytest
    from pydantic import ValidationError

    from app.config import Settings

    with pytest.raises(ValidationError):
        Settings(login_limit=0)
    with pytest.raises(ValidationError):
        Settings(oauth_limit=-1)
    with pytest.raises(ValidationError):
        Settings(refresh_limit=0)
