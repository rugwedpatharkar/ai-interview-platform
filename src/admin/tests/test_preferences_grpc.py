"""PreferencesService over gRPC-web: auth, defaults, round-trip, validation."""

import struct

import httpx
import pytest
from lib.grpcweb import GrpcWebASGI
from lib.security import TokenService

from app.routes.pb import preferences_pb2, preferences_pb2_grpc
from app.routes.preferences import PreferencesServicer

_SECRET = "test-secret-" + "x" * 32
_SVC = "/admin.preferences.v1.PreferencesService"


class _Prefs:
    def __init__(self):
        self.docs = {}

    async def get_by_user(self, uid):
        return self.docs.get(uid)

    async def upsert(self, uid, fields):
        self.docs[uid] = {**fields, "user_id": uid}


def _app(prefs=None):
    grpc_app = GrpcWebASGI()
    preferences_pb2_grpc.add_PreferencesServiceServicer_to_server(
        PreferencesServicer(
            preferences=prefs or _Prefs(), tokens=TokenService(_SECRET)
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


def _auth(sub="u1", role="candidate"):
    token = TokenService(_SECRET).access_token(sub, role, "c1", "j1")
    return {"authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_get_requires_auth():
    resp = await _call(_app(), "GetAppearance", preferences_pb2.GetAppearanceRequest())
    _, status = _ds(resp.content)
    assert status == 16  # UNAUTHENTICATED


@pytest.mark.asyncio
async def test_get_returns_defaults_for_fresh_user():
    resp = await _call(
        _app(),
        "GetAppearance",
        preferences_pb2.GetAppearanceRequest(),
        metadata=_auth(),
    )
    data, status = _ds(resp.content)
    assert status == 0
    out = preferences_pb2.Appearance.FromString(data)
    assert out.mode == "system" and out.base == "midnight" and out.accent == "cyan"
    assert out.accent_hue == 0


@pytest.mark.asyncio
async def test_update_then_get_round_trips():
    prefs = _Prefs()
    upd = await _call(
        _app(prefs),
        "UpdateAppearance",
        preferences_pb2.Appearance(
            mode="dark", base="mint", accent="custom", accent_hue=300
        ),
        metadata=_auth(),
    )
    data, status = _ds(upd.content)
    assert status == 0
    assert preferences_pb2.Appearance.FromString(data).accent_hue == 300
    got = await _call(
        _app(prefs),
        "GetAppearance",
        preferences_pb2.GetAppearanceRequest(),
        metadata=_auth(),
    )
    out = preferences_pb2.Appearance.FromString(_ds(got.content)[0])
    assert out.base == "mint" and out.accent == "custom" and out.accent_hue == 300


@pytest.mark.asyncio
async def test_update_bad_enum_invalid_argument():
    resp = await _call(
        _app(),
        "UpdateAppearance",
        preferences_pb2.Appearance(mode="plaid", base="midnight", accent="cyan"),
        metadata=_auth(),
    )
    _, status = _ds(resp.content)
    assert status == 3  # INVALID_ARGUMENT
