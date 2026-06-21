import grpc
import pytest
from lib.security import TokenService

from app.routes.pb import settings_pb2
from app.routes.settings import SettingsServicer

SECRET = "test-secret-" + "x" * 32


class _Aborted(Exception):
    def __init__(self, code, details):
        super().__init__(details)
        self.code = code


class FakeContext:
    def __init__(self, metadata=None):
        self._md = metadata or []

    def invocation_metadata(self):
        return self._md

    async def abort(self, code, details):
        raise _Aborted(code, details)


class _FakePrefs:
    def __init__(self):
        self._docs = {}

    async def get_by_user(self, user_id):
        return self._docs.get(user_id)

    async def upsert(self, user_id, fields):
        self._docs[user_id] = {**fields, "user_id": user_id}


def _md(uid="u1", role="candidate"):
    token = TokenService(SECRET).access_token(
        sub=uid, role=role, comp_id=None, jti="j1"
    )
    return FakeContext(metadata=[("authorization", f"Bearer {token}")])


class _FakeUsers:
    def __init__(self):
        self.doc = {"email": "a@b.co", "totp_enabled": False}

    async def get(self, user_id):
        return self.doc

    async def update_fields(self, user_id, fields):
        self.doc.update(fields)


class _FakeTotp:
    def new_secret(self):
        return "S"

    def provisioning_uri(self, secret, *, account):
        return f"otpauth://totp/{account}"

    def verify(self, secret, code):
        return code == "123456"


class _FakeBox:
    def encrypt(self, plain):
        return f"enc:{plain}"

    def decrypt(self, token):
        return token.removeprefix("enc:")


def _servicer(users=None):
    return SettingsServicer(
        prefs=_FakePrefs(),
        tokens=TokenService(SECRET),
        users=users or _FakeUsers(),
        totp=_FakeTotp(),
        secretbox=_FakeBox(),
    )


@pytest.mark.asyncio
async def test_get_defaults_then_set_roundtrip():
    svc = _servicer()
    got = await svc.GetNotificationPrefs(
        settings_pb2.GetNotificationPrefsRequest(), _md()
    )
    assert got.digest == "off" and got.email_categories["security"] is True

    req = settings_pb2.NotificationPrefs(sms_critical=True, digest="daily")
    req.email_categories["messages"] = False
    req.quiet_hours.start = "22:00"
    req.quiet_hours.end = "07:00"
    req.quiet_hours.tz = "UTC"
    out = await svc.SetNotificationPrefs(req, _md())
    assert out.digest == "daily" and out.sms_critical is True
    assert out.email_categories["messages"] is False
    assert out.quiet_hours.tz == "UTC"


@pytest.mark.asyncio
async def test_set_bad_digest_invalid_argument():
    with pytest.raises(_Aborted) as ei:
        await _servicer().SetNotificationPrefs(
            settings_pb2.NotificationPrefs(digest="hourly"), _md()
        )
    assert ei.value.code == grpc.StatusCode.INVALID_ARGUMENT


@pytest.mark.asyncio
async def test_totp_setup_then_verify_roundtrip():
    users = _FakeUsers()
    svc = _servicer(users)
    setup = await svc.SetupTotp(settings_pb2.SetupTotpRequest(), _md())
    assert setup.secret == "S" and "otpauth://" in setup.provisioning_uri
    out = await svc.VerifyTotp(settings_pb2.VerifyTotpRequest(code="123456"), _md())
    assert out.enabled is True and len(out.recovery_codes) == 10


@pytest.mark.asyncio
async def test_totp_verify_bad_code_invalid_argument():
    users = _FakeUsers()
    users.doc["totp_secret"] = "enc:S"
    with pytest.raises(_Aborted) as ei:
        await _servicer(users).VerifyTotp(
            settings_pb2.VerifyTotpRequest(code="000000"), _md()
        )
    assert ei.value.code == grpc.StatusCode.INVALID_ARGUMENT
