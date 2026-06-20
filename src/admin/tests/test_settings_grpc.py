"""SettingsService over gRPC-web: ChangePassword + email-change wiring + status."""

import struct

import httpx
import pytest
from lib.grpcweb import GrpcWebASGI
from lib.security import TokenService, hash_password

from app.routes.pb import settings_pb2, settings_pb2_grpc
from app.routes.settings import SettingsServicer

_SECRET = "test-secret-" + "x" * 32
_SVC = "/admin.settings.v1.SettingsService"


class _FakeUsers:
    def __init__(self, users):
        self.docs = {u["_id"]: u for u in users}

    async def get(self, user_id):
        return self.docs.get(user_id)

    async def get_by_email(self, email):
        return next((u for u in self.docs.values() if u.get("email") == email), None)

    async def update_fields(self, user_id, fields):
        self.docs[user_id].update(fields)


class _FakeSessions:
    def __init__(self, rows=None):
        self._rows = rows or []
        self.revoked = []

    async def list_for_user(self, user_id):
        return list(self._rows)

    async def revoke(self, jti):
        self.revoked.append(jti)

    async def revoke_all_except(self, user_id, current_jti):
        pass

    async def revoke_user(self, user_id):
        pass


class _FakeNotifier:
    def __init__(self):
        self.emails = []

    async def send_email(self, to, subject, body):
        self.emails.append((to, subject, body))


class _FakeNonces:
    def __init__(self):
        self.allowed = set()
        self.consumed = set()

    async def allow(self, jti, ttl):
        self.allowed.add(jti)

    async def consume(self, jti):
        if jti in self.consumed or jti not in self.allowed:
            return False
        self.consumed.add(jti)
        return True


class _FakeAudit:
    async def insert(self, entry):
        pass


def _app(users, *, nonces=None, notifier=None, sessions=None):
    grpc_app = GrpcWebASGI()
    settings_pb2_grpc.add_SettingsServiceServicer_to_server(
        SettingsServicer(
            prefs=None,
            tokens=TokenService(_SECRET),
            users=users,
            sessions=sessions or _FakeSessions(),
            nonces=nonces or _FakeNonces(),
            notifier=notifier or _FakeNotifier(),
            audit=_FakeAudit(),
        ),
        grpc_app,
    )
    return grpc_app


def _frame(b):
    return b"\x00" + struct.pack(">I", len(b)) + b


def _ds(body):
    data, status, i = None, None, 0
    while i + 5 <= len(body):
        flag = body[i]
        (n,) = struct.unpack(">I", body[i + 1 : i + 5])
        p = body[i + 5 : i + 5 + n]
        if flag & 0x80:
            for line in p.decode().replace("\r\n", "\n").splitlines():
                if line.startswith("grpc-status:"):
                    status = int(line.split(":", 1)[1])
        else:
            data = p
        i += 5 + n
    return data, status


async def _call(app, method, req, *, metadata=None):
    transport = httpx.ASGITransport(app=app)
    headers = {"content-type": "application/grpc-web+proto", **(metadata or {})}
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        return await client.post(
            f"{_SVC}/{method}", content=_frame(req.SerializeToString()), headers=headers
        )


def _auth(uid="u1"):
    token = TokenService(_SECRET).access_token(uid, "candidate", None, "j1", sid="sid1")
    return {"authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_change_password_requires_auth():
    users = _FakeUsers([{"_id": "u1", "password_hash": hash_password("old12345")}])
    resp = await _call(
        _app(users),
        "ChangePassword",
        settings_pb2.ChangePasswordRequest(
            current_password="old12345", new_password="newpass123"
        ),
    )
    _, status = _ds(resp.content)
    assert status == 16  # UNAUTHENTICATED


@pytest.mark.asyncio
async def test_change_password_happy():
    user = {"_id": "u1", "password_hash": hash_password("old12345")}
    resp = await _call(
        _app(_FakeUsers([user])),
        "ChangePassword",
        settings_pb2.ChangePasswordRequest(
            current_password="old12345", new_password="newpass123"
        ),
        metadata=_auth(),
    )
    data, status = _ds(resp.content)
    assert status == 0
    assert settings_pb2.OkResponse.FromString(data).ok is True


@pytest.mark.asyncio
async def test_change_password_wrong_current_invalid_argument():
    user = {"_id": "u1", "password_hash": hash_password("old12345")}
    resp = await _call(
        _app(_FakeUsers([user])),
        "ChangePassword",
        settings_pb2.ChangePasswordRequest(
            current_password="WRONG", new_password="newpass123"
        ),
        metadata=_auth(),
    )
    _, status = _ds(resp.content)
    assert status == 3  # INVALID_ARGUMENT


@pytest.mark.asyncio
async def test_verify_email_change_is_pre_auth():
    user = {"_id": "u1", "email": "old@b.co", "pending_email": "new@b.co"}
    nonces = _FakeNonces()
    token = TokenService(_SECRET).verification_token(sub="u1", jti="n1")
    await nonces.allow("n1", 100)
    users = _FakeUsers([user])
    # No Authorization header — the single-use link is the proof.
    resp = await _call(
        _app(users, nonces=nonces),
        "VerifyEmailChange",
        settings_pb2.VerifyEmailChangeRequest(token=token),
    )
    data, status = _ds(resp.content)
    assert status == 0
    assert settings_pb2.OkResponse.FromString(data).ok is True
    assert users.docs["u1"]["email"] == "new@b.co"


@pytest.mark.asyncio
async def test_list_sessions_marks_caller_current():
    sessions = _FakeSessions(
        rows=[
            {"jti": "sid1", "meta": {"ip": "1.1.1.1", "user_agent": "FF"}},
            {"jti": "other", "meta": {"ip": "2.2.2.2", "user_agent": "Chr"}},
        ]
    )
    app = _app(_FakeUsers([{"_id": "u1"}]), sessions=sessions)
    resp = await _call(
        app, "ListSessions", settings_pb2.ListSessionsRequest(), metadata=_auth()
    )
    data, status = _ds(resp.content)
    assert status == 0
    out = settings_pb2.ListSessionsResponse.FromString(data)
    assert {s.jti: s.current for s in out.sessions} == {"sid1": True, "other": False}


@pytest.mark.asyncio
async def test_revoke_foreign_session_not_found():
    sessions = _FakeSessions(rows=[{"jti": "sid1", "meta": {}}])
    app = _app(_FakeUsers([{"_id": "u1"}]), sessions=sessions)
    resp = await _call(
        app,
        "RevokeSession",
        settings_pb2.RevokeSessionRequest(jti="not-mine"),
        metadata=_auth(),
    )
    _, status = _ds(resp.content)
    assert status == 5  # NOT_FOUND
