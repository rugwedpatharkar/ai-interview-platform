import pytest

from app.errors import ValidationError
from app.resources import preferences


class _Prefs:
    def __init__(self):
        self.docs = {}

    async def get_by_user(self, uid):
        return self.docs.get(uid)

    async def upsert(self, uid, fields):
        self.docs[uid] = {**fields, "user_id": uid}


def _id(uid="u1"):
    return {"id": uid, "role": "candidate", "comp_id": "c1"}


async def test_get_returns_defaults_when_absent():
    out = await preferences.get_appearance(_id(), prefs=_Prefs())
    assert out["mode"] == "system" and out["accent"] == "cyan"
    assert out["base"] == "midnight" and out["accent_hue"] is None


async def test_update_then_get_roundtrips():
    p = _Prefs()
    await preferences.update_appearance(
        _id(),
        {"mode": "dark", "base": "mint", "accent": "custom", "accent_hue": 300},
        prefs=p,
    )
    out = await preferences.get_appearance(_id(), prefs=p)
    assert out["base"] == "mint" and out["accent_hue"] == 300


async def test_update_rejects_bad_enum():
    with pytest.raises(ValidationError):
        await preferences.update_appearance(_id(), {"mode": "plaid"}, prefs=_Prefs())


async def test_scoped_to_token_user():
    p = _Prefs()
    await preferences.update_appearance(_id("u1"), {"mode": "dark"}, prefs=p)
    # u2 never set theirs → gets defaults, not u1's.
    assert (await preferences.get_appearance(_id("u2"), prefs=p))["mode"] == "system"
