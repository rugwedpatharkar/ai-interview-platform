"""resources/settings — notification prefs + TOTP 2FA (defaults + validation)."""

import pytest

from app.errors import ValidationError
from app.resources import settings


class _FakeUsers:
    def __init__(self, doc):
        self._doc = doc

    async def get(self, user_id):
        return self._doc

    async def update_fields(self, user_id, fields):
        self._doc.update(fields)


class _FakeTotp:
    """Deterministic stand-in: secret 'S', the only valid code is '123456'."""

    def new_secret(self):
        return "S"

    def provisioning_uri(self, secret, *, account):
        return f"otpauth://totp/{account}?secret={secret}"

    def verify(self, secret, code):
        return secret == "S" and code == "123456"


class _FakeBox:
    def encrypt(self, plain):
        return f"enc:{plain}"

    def decrypt(self, token):
        return token.removeprefix("enc:")


@pytest.mark.asyncio
async def test_totp_setup_stages_encrypted_secret_disabled():
    user = {"email": "a@b.co", "totp_enabled": False}
    users = _FakeUsers(user)
    out = await settings.setup_totp(
        "u1", users=users, totp=_FakeTotp(), secretbox=_FakeBox()
    )
    assert out["secret"] == "S" and "otpauth://" in out["provisioning_uri"]
    assert user["totp_secret"] == "enc:S" and user["totp_enabled"] is False


@pytest.mark.asyncio
async def test_totp_verify_enables_and_returns_recovery_codes():
    user = {"email": "a@b.co", "totp_secret": "enc:S", "totp_enabled": False}
    users = _FakeUsers(user)
    out = await settings.verify_totp(
        "u1", "123456", users=users, totp=_FakeTotp(), secretbox=_FakeBox()
    )
    assert out["enabled"] is True and len(out["recovery_codes"]) == 10
    assert user["totp_enabled"] is True
    assert (
        user["recovery_codes"] and user["recovery_codes"][0] != out["recovery_codes"][0]
    )


@pytest.mark.asyncio
async def test_totp_verify_bad_code_rejected():
    user = {"email": "a@b.co", "totp_secret": "enc:S", "totp_enabled": False}
    with pytest.raises(ValidationError):
        await settings.verify_totp(
            "u1",
            "000000",
            users=_FakeUsers(user),
            totp=_FakeTotp(),
            secretbox=_FakeBox(),
        )
    assert user["totp_enabled"] is False


@pytest.mark.asyncio
async def test_totp_disable_with_recovery_code():
    from lib.security import hash_password

    user = {
        "totp_secret": "enc:S",
        "totp_enabled": True,
        "recovery_codes": [hash_password("rescue1")],
    }
    users = _FakeUsers(user)
    out = await settings.disable_totp(
        "u1", "rescue1", users=users, totp=_FakeTotp(), secretbox=_FakeBox()
    )
    assert out["ok"] is True
    assert user["totp_enabled"] is False and user["totp_secret"] == ""


@pytest.mark.asyncio
async def test_totp_disable_bad_code_rejected():
    user = {"totp_secret": "enc:S", "totp_enabled": True, "recovery_codes": []}
    with pytest.raises(ValidationError):
        await settings.disable_totp(
            "u1", "nope", users=_FakeUsers(user), totp=_FakeTotp(), secretbox=_FakeBox()
        )
    assert user["totp_enabled"] is True


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
