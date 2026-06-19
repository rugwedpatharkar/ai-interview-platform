"""gRPC-web translator tests — drive the real AuthServicer over the ASGI app.

The wire helpers here are an independent implementation of the gRPC-web framing, so a
framing bug in app/routes/grpcweb.py can't be masked by reusing its own encoder.
"""

import struct

import httpx
import pytest
from lib.redis import RateLimiter
from lib.security import RefreshSessionStore, TokenService

from app.infra.notifier import LoggingNotifier
from app.routes.auth import AuthServicer
from app.routes.grpcweb import GrpcWebASGI
from app.routes.pb import auth_pb2, auth_pb2_grpc

SECRET = "test-secret-" + "x" * 32
_SVC = "/admin.auth.v1.AuthService"


def _app(fakes, **kwargs):
    app = GrpcWebASGI(**kwargs)
    auth_pb2_grpc.add_AuthServiceServicer_to_server(
        AuthServicer(
            users=fakes["users"],
            companies=fakes["companies"],
            tokens=TokenService(SECRET),
            sessions=RefreshSessionStore(fakes["redis"]),
            limiter=RateLimiter(fakes["redis"]),
            notifier=LoggingNotifier(),
            refresh_ttl_seconds=1209600,
        ),
        app,
    )
    return app


def _frame(msg_bytes):
    return b"\x00" + struct.pack(">I", len(msg_bytes)) + msg_bytes


def _frames(body):
    out, i = [], 0
    while i + 5 <= len(body):
        flag = body[i]
        (n,) = struct.unpack(">I", body[i + 1 : i + 5])
        out.append((flag, body[i + 5 : i + 5 + n]))
        i += 5 + n
    return out


def _data_and_status(body):
    data, status = None, None
    for flag, payload in _frames(body):
        if flag & 0x80:
            for line in payload.decode().replace("\r\n", "\n").splitlines():
                if line.startswith("grpc-status:"):
                    status = int(line.split(":", 1)[1])
        else:
            data = payload
    return data, status


async def _call(app, method, request, *, metadata=None):
    transport = httpx.ASGITransport(app=app)
    headers = {"content-type": "application/grpc-web+proto", **(metadata or {})}
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        return await client.post(
            f"{_SVC}/{method}",
            content=_frame(request.SerializeToString()),
            headers=headers,
        )


@pytest.mark.asyncio
async def test_unary_roundtrip_register_then_login(fakes):
    app = _app(fakes)
    resp = await _call(
        app,
        "RegisterCompany",
        auth_pb2.RegisterCompanyRequest(
            company_name="Acme", email="boss@acme.com", password="pw123456"
        ),
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/grpc-web+proto"
    data, status = _data_and_status(resp.content)
    assert status == 0
    user = auth_pb2.UserResponse.FromString(data)
    assert user.role == "company_admin"
    assert user.comp_id

    resp = await _call(
        app,
        "Login",
        auth_pb2.LoginRequest(email="boss@acme.com", password="pw123456"),
    )
    data, status = _data_and_status(resp.content)
    assert status == 0
    assert auth_pb2.TokenResponse.FromString(data).access_token


@pytest.mark.asyncio
async def test_domain_error_becomes_trailer_status(fakes):
    app = _app(fakes)
    await _call(
        app,
        "RegisterCandidate",
        auth_pb2.RegisterCandidateRequest(email="c@x.com", password="pw123456"),
    )
    resp = await _call(
        app, "Login", auth_pb2.LoginRequest(email="c@x.com", password="wrong123")
    )
    assert resp.status_code == 200  # gRPC-web carries errors in-band
    data, status = _data_and_status(resp.content)
    assert data is None
    assert status == 16  # UNAUTHENTICATED


@pytest.mark.asyncio
async def test_authorization_metadata_flows_to_servicer(fakes):
    app = _app(fakes)
    await _call(
        app,
        "RegisterCompany",
        auth_pb2.RegisterCompanyRequest(
            company_name="Acme", email="a@acme.com", password="pw123456"
        ),
    )
    login = await _call(
        app, "Login", auth_pb2.LoginRequest(email="a@acme.com", password="pw123456")
    )
    token = auth_pb2.TokenResponse.FromString(_data_and_status(login.content)[0])
    resp = await _call(
        app,
        "Me",
        auth_pb2.MeRequest(),
        metadata={"authorization": f"Bearer {token.access_token}"},
    )
    data, status = _data_and_status(resp.content)
    assert status == 0
    assert auth_pb2.IdentityResponse.FromString(data).role == "company_admin"


@pytest.mark.asyncio
async def test_unknown_method_is_unimplemented(fakes):
    app = _app(fakes)
    resp = await _call(app, "DoesNotExist", auth_pb2.MeRequest())
    assert resp.status_code == 200
    _, status = _data_and_status(resp.content)
    assert status == 12  # UNIMPLEMENTED


@pytest.mark.asyncio
async def test_cors_preflight(fakes):
    app = _app(fakes)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        resp = await client.request(
            "OPTIONS", f"{_SVC}/Login", headers={"origin": "https://app.example"}
        )
    assert resp.status_code in (200, 204)
    assert resp.headers["access-control-allow-origin"] == "https://app.example"
    assert "POST" in resp.headers["access-control-allow-methods"]
    # Origin-reflected ACAO must carry Vary: Origin so caches don't cross origins.
    assert resp.headers["vary"] == "origin"


@pytest.mark.asyncio
async def test_compression_flag_is_unimplemented(fakes):
    app = _app(fakes)
    transport = httpx.ASGITransport(app=app)
    msg = auth_pb2.MeRequest().SerializeToString()
    compressed = b"\x01" + struct.pack(">I", len(msg)) + msg
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        resp = await client.post(
            f"{_SVC}/Me",
            content=compressed,
            headers={"content-type": "application/grpc-web+proto"},
        )
    _, status = _data_and_status(resp.content)
    assert status == 12  # UNIMPLEMENTED — compression not supported


@pytest.mark.asyncio
async def test_oversized_body_is_resource_exhausted(fakes):
    app = _app(fakes, max_message_bytes=8)
    resp = await _call(
        app,
        "RegisterCompany",
        auth_pb2.RegisterCompanyRequest(
            company_name="Acme", email="a@b.com", password="pw123456"
        ),
    )
    _, status = _data_and_status(resp.content)
    assert status == 8  # RESOURCE_EXHAUSTED


@pytest.mark.asyncio
async def test_short_frame_is_invalid_argument(fakes):
    app = _app(fakes)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        resp = await client.post(
            f"{_SVC}/Me",
            content=b"\x00\x00",
            headers={"content-type": "application/grpc-web+proto"},
        )
    _, status = _data_and_status(resp.content)
    assert status == 3  # INVALID_ARGUMENT


@pytest.mark.asyncio
async def test_cors_allowlist_omits_disallowed_origin(fakes):
    app = _app(fakes, allow_origin="https://app.example")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        ok = await client.request(
            "OPTIONS", f"{_SVC}/Login", headers={"origin": "https://app.example"}
        )
        bad = await client.request(
            "OPTIONS", f"{_SVC}/Login", headers={"origin": "https://evil.example"}
        )
    assert ok.headers["access-control-allow-origin"] == "https://app.example"
    assert "access-control-allow-origin" not in bad.headers
