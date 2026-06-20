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


def _servicer():
    return SettingsServicer(prefs=_FakePrefs(), tokens=TokenService(SECRET))


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
