"""resources/settings notification prefs — defaults, validation, self-scoped upsert."""

import pytest

from app.errors import ValidationError
from app.resources import settings


class _FakePrefs:
    def __init__(self):
        self._docs = {}

    async def get_by_user(self, user_id):
        return self._docs.get(user_id)

    async def upsert(self, user_id, fields):
        self._docs[user_id] = {**fields, "user_id": user_id}


@pytest.mark.asyncio
async def test_get_returns_safe_defaults_when_unset():
    out = await settings.get_notification_prefs("u1", prefs=_FakePrefs())
    assert out["digest"] == "off" and out["sms_critical"] is False
    assert out["email_categories"]["security"] is True
    assert out["quiet_hours"] is None


@pytest.mark.asyncio
async def test_set_persists_and_returns_doc():
    prefs = _FakePrefs()
    out = await settings.set_notification_prefs(
        "u1",
        {
            "email_categories": {"messages": False},
            "sms_critical": True,
            "digest": "weekly",
            "quiet_hours": {"start": "22:00", "end": "07:30", "tz": "Europe/Berlin"},
        },
        prefs=prefs,
    )
    assert out["digest"] == "weekly" and out["sms_critical"] is True
    assert out["email_categories"] == {"messages": False}
    assert out["quiet_hours"] == {
        "start": "22:00",
        "end": "07:30",
        "tz": "Europe/Berlin",
    }


@pytest.mark.asyncio
async def test_set_rejects_bad_digest():
    with pytest.raises(ValidationError):
        await settings.set_notification_prefs(
            "u1", {"digest": "hourly"}, prefs=_FakePrefs()
        )


@pytest.mark.asyncio
async def test_set_rejects_bad_quiet_hours_time():
    with pytest.raises(ValidationError):
        await settings.set_notification_prefs(
            "u1",
            {
                "digest": "off",
                "quiet_hours": {"start": "25:00", "end": "07:00", "tz": "UTC"},
            },
            prefs=_FakePrefs(),
        )


@pytest.mark.asyncio
async def test_set_rejects_bad_timezone():
    with pytest.raises(ValidationError):
        await settings.set_notification_prefs(
            "u1",
            {
                "digest": "off",
                "quiet_hours": {"start": "22:00", "end": "07:00", "tz": "Mars/Phobos"},
            },
            prefs=_FakePrefs(),
        )
