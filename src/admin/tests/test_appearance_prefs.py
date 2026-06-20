import pytest

from app.model.appearance_prefs import DEFAULTS, AppearancePrefs


def test_defaults():
    assert (DEFAULTS.mode, DEFAULTS.base, DEFAULTS.accent) == (
        "system",
        "midnight",
        "cyan",
    )
    assert DEFAULTS.accent_hue is None


def test_custom_hue_clamped_mod_360():
    p = AppearancePrefs.from_dict(
        {"mode": "dark", "base": "azure", "accent": "custom", "accent_hue": 420}
    )
    assert p.accent_hue == 60


def test_hue_ignored_when_not_custom():
    p = AppearancePrefs.from_dict({"accent": "cyan", "accent_hue": 200})
    assert p.accent_hue is None


def test_rejects_unknown_enum():
    with pytest.raises(ValueError):
        AppearancePrefs.from_dict({"mode": "neon"})


def test_to_dict_round_trips():
    payload = {"mode": "dark", "base": "mint", "accent": "custom", "accent_hue": 300}
    assert AppearancePrefs.from_dict(payload).to_dict() == payload
