"""gRPC-web translator tests — drive the real AuthServicer over the ASGI app.

The wire helpers here are an independent implementation of the gRPC-web framing, so a
framing bug in lib/grpcweb.py can't be masked by reusing its own encoder.
"""

import asyncio
import base64
import struct

import grpc
import httpx
import pytest
from lib.grpcweb import GrpcWebASGI
from lib.redis import RateLimiter
from lib.security import RefreshSessionStore, TokenService

from app.config import get_settings
from app.infra.notifier import LoggingNotifier
from app.routes.auth import AuthServicer
from app.routes.pb import auth_pb2, auth_pb2_grpc

SECRET = "test-secret-" + "x" * 32
_SVC = "/admin.auth.v1.AuthService"


def _app(fakes, *, oauth_providers=None, **kwargs):
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
            oauth_providers=oauth_providers,
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


# --- server-streaming ----------------------------------------------------
# AuthService is all-unary, so register a synthetic unary_stream handler via the
# same registration surface the generated add_*_to_server helpers use. Identity
# (de)serializers let the behaviour yield raw frame payloads directly.
_STREAM_SVC = "test.stream.v1.Echo"


def _stream_app(behavior, **kwargs):
    app = GrpcWebASGI(**kwargs)
    handler = grpc.unary_stream_rpc_method_handler(
        behavior, request_deserializer=lambda b: b, response_serializer=lambda r: r
    )
    app.add_registered_method_handlers(_STREAM_SVC, {"Stream": handler})
    return app


async def _stream_call(app, content_type="application/grpc-web+proto"):
    content = _frame(b"go")
    if "text" in content_type:  # grpc-web-text base64s the request body too
        content = base64.b64encode(content)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        return await client.post(
            f"/{_STREAM_SVC}/Stream",
            content=content,
            headers={"content-type": content_type},
        )


def _stream_payloads(body):
    data, status = [], None
    for flag, payload in _frames(body):
        if flag & 0x80:
            for line in payload.decode().replace("\r\n", "\n").splitlines():
                if line.startswith("grpc-status:"):
                    status = int(line.split(":", 1)[1])
        else:
            data.append(payload)
    return data, status


@pytest.mark.asyncio
async def test_server_stream_emits_each_message_then_ok_trailer():
    async def behavior(request, context):
        for i in range(3):
            yield f"m{i}".encode()

    resp = await _stream_call(_stream_app(behavior))
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/grpc-web+proto"
    data, status = _stream_payloads(resp.content)
    assert data == [b"m0", b"m1", b"m2"]
    assert status == 0


@pytest.mark.asyncio
async def test_server_stream_midstream_error_keeps_frames_and_sets_trailer():
    async def behavior(request, context):
        yield b"m0"
        yield b"m1"
        raise RuntimeError("boom")

    resp = await _stream_call(_stream_app(behavior))
    data, status = _stream_payloads(resp.content)
    assert data == [b"m0", b"m1"]  # frames already sent stay sent
    assert status == 13  # INTERNAL — servicer bug never leaks a traceback


@pytest.mark.asyncio
async def test_server_stream_abort_carries_status():
    async def behavior(request, context):
        yield b"m0"
        await context.abort(grpc.StatusCode.PERMISSION_DENIED, "denied")

    resp = await _stream_call(_stream_app(behavior))
    data, status = _stream_payloads(resp.content)
    assert data == [b"m0"]
    assert status == 7  # PERMISSION_DENIED


@pytest.mark.asyncio
async def test_server_stream_deadline_exceeded():
    async def behavior(request, context):
        yield b"m0"
        await asyncio.sleep(5)  # far exceeds the 50ms deadline below
        yield b"never"

    resp = await _stream_call(_stream_app(behavior, timeout_seconds=0.05))
    _, status = _stream_payloads(resp.content)
    assert status == 4  # DEADLINE_EXCEEDED


@pytest.mark.asyncio
async def test_server_stream_text_mode_base64_buffers_whole_stream():
    async def behavior(request, context):
        for i in range(2):
            yield f"t{i}".encode()

    resp = await _stream_call(
        _stream_app(behavior), content_type="application/grpc-web-text+proto"
    )
    assert resp.headers["content-type"] == "application/grpc-web-text+proto"
    data, status = _stream_payloads(base64.b64decode(resp.content))
    assert data == [b"t0", b"t1"]
    assert status == 0


# --- AuthService.ResendVerification / ListOAuthProviders (G4) -------------
@pytest.mark.asyncio
async def test_resend_verification_returns_ok(fakes):
    app = _app(fakes)
    resp = await _call(
        app, "ResendVerification", auth_pb2.ResendVerificationRequest(email="x@x.com")
    )
    data, status = _data_and_status(resp.content)
    assert status == 0
    assert auth_pb2.OkResponse.FromString(data).ok  # uniform ok (no enumeration)


@pytest.mark.asyncio
async def test_resend_verification_rate_limited(fakes):
    app = _app(fakes)
    req = auth_pb2.ResendVerificationRequest(email="x@x.com")
    for _ in range(get_settings().resend_limit):
        await _call(app, "ResendVerification", req)
    resp = await _call(app, "ResendVerification", req)
    _, status = _data_and_status(resp.content)
    assert status == 8  # RESOURCE_EXHAUSTED


@pytest.mark.asyncio
async def test_list_oauth_providers(fakes):
    app = _app(fakes, oauth_providers={"google": {}, "microsoft": {}})
    resp = await _call(app, "ListOAuthProviders", auth_pb2.ListOAuthProvidersRequest())
    data, status = _data_and_status(resp.content)
    assert status == 0
    providers = auth_pb2.OAuthProvidersResponse.FromString(data).providers
    assert list(providers) == ["google", "microsoft"]


# --- transient infra errors → UNAVAILABLE (single egress boundary) -------
def _unary_app(behavior, **kwargs):
    app = GrpcWebASGI(**kwargs)
    handler = grpc.unary_unary_rpc_method_handler(
        behavior, request_deserializer=lambda b: b, response_serializer=lambda r: r
    )
    app.add_registered_method_handlers(_STREAM_SVC, {"Op": handler})
    return app


async def _unary_infra_call(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        return await client.post(
            f"/{_STREAM_SVC}/Op",
            content=_frame(b"go"),
            headers={"content-type": "application/grpc-web+proto"},
        )


@pytest.mark.asyncio
async def test_storage_error_becomes_unavailable():
    from lib.storage.client import StorageError

    async def behavior(request, context):
        raise StorageError("s3 down", op="put")

    resp = await _unary_infra_call(_unary_app(behavior))
    _, status = _data_and_status(resp.content)
    assert status == 14  # UNAVAILABLE — transient infra, client should retry


@pytest.mark.asyncio
async def test_pymongo_error_becomes_unavailable():
    from pymongo.errors import PyMongoError

    async def behavior(request, context):
        raise PyMongoError("connection lost")

    resp = await _unary_infra_call(_unary_app(behavior))
    _, status = _data_and_status(resp.content)
    assert status == 14  # UNAVAILABLE, not INTERNAL
