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
