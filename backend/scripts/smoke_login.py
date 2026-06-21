"""End-to-end gRPC-web smoke: RegisterCompany -> Login -> Me against admin.

Two modes:
  * default       — hits a running admin at $ADMIN_URL (default http://localhost:8080),
                    i.e. the `docker compose up` stack. Real Mongo/Redis.
  * --selftest    — boots admin's gRPC-web ASGI app under a real uvicorn on a loopback
                    port with in-memory fakes, then runs the same client over a real
                    socket. No Mongo/Docker needed; proves the server + transport boot
                    and serve a full auth round-trip.

Run: `python scripts/smoke_login.py --selftest`  (or set ADMIN_URL and drop the flag).
"""

import asyncio
import os
import struct
import sys
from pathlib import Path

import httpx

_ADMIN = str(Path(__file__).resolve().parent.parent / "services" / "admin")
sys.path.insert(0, _ADMIN)

from app.routes.pb import auth_pb2  # noqa: E402

_SVC = "/admin.auth.v1.AuthService"
_PW = "pw123456"


def _frame(msg: bytes) -> bytes:
    return b"\x00" + struct.pack(">I", len(msg)) + msg


def _parse(body: bytes):
    data, status, i = None, None, 0
    while i + 5 <= len(body):
        flag = body[i]
        (n,) = struct.unpack(">I", body[i + 1 : i + 5])
        chunk = body[i + 5 : i + 5 + n]
        if flag & 0x80:
            for line in chunk.decode().replace("\r\n", "\n").splitlines():
                if line.startswith("grpc-status:"):
                    status = int(line.split(":", 1)[1])
        else:
            data = chunk
        i += 5 + n
    return data, status


async def _call(client, base, method, request, token=None):
    headers = {"content-type": "application/grpc-web+proto"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    resp = await client.post(
        f"{base}{_SVC}/{method}",
        content=_frame(request.SerializeToString()),
        headers=headers,
    )
    data, status = _parse(resp.content)
    if status != 0:
        raise SystemExit(f"FAIL {method}: grpc-status={status}")
    return data


async def _run(base: str) -> None:
    email = "smoke@example.com"
    async with httpx.AsyncClient(timeout=10) as client:
        user = auth_pb2.UserResponse.FromString(
            await _call(
                client,
                base,
                "RegisterCompany",
                auth_pb2.RegisterCompanyRequest(
                    company_name="Smoke Co", email=email, password=_PW
                ),
            )
        )
        print(f"  RegisterCompany -> role={user.role} comp_id={user.comp_id}")
        token = auth_pb2.TokenResponse.FromString(
            await _call(
                client,
                base,
                "Login",
                auth_pb2.LoginRequest(email=email, password=_PW),
            )
        )
        print("  Login           -> got access + refresh tokens")
        ident = auth_pb2.IdentityResponse.FromString(
            await _call(
                client, base, "Me", auth_pb2.MeRequest(), token=token.access_token
            )
        )
        print(f"  Me              -> id={ident.id} role={ident.role}")
    print("PASS: RegisterCompany -> Login -> Me over gRPC-web")


def _selftest_app():
    from lib.redis import RateLimiter
    from lib.security import RefreshSessionStore, TokenService
    from tests.conftest import FakeCompanyRepo, FakeRedis, FakeUserRepo

    from app.infra.notifier import LoggingNotifier
    from app.routes.auth import AuthServicer
    from app.routes.grpcweb import GrpcWebASGI
    from app.routes.pb import auth_pb2_grpc

    redis = FakeRedis()
    app = GrpcWebASGI()
    auth_pb2_grpc.add_AuthServiceServicer_to_server(
        AuthServicer(
            users=FakeUserRepo(),
            companies=FakeCompanyRepo(),
            tokens=TokenService("smoke-secret-" + "x" * 32),
            sessions=RefreshSessionStore(redis),
            limiter=RateLimiter(redis),
            notifier=LoggingNotifier(),
            refresh_ttl_seconds=1209600,
        ),
        app,
    )
    return app


async def _selftest() -> None:
    import uvicorn

    port = 8099
    config = uvicorn.Config(
        _selftest_app(),
        host="127.0.0.1",
        port=port,
        log_level="warning",
        lifespan="off",
    )
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())
    while not server.started:  # noqa: ASYNC110 — poll uvicorn's start flag (no signal)
        await asyncio.sleep(0.05)
    try:
        print(f"selftest: admin gRPC-web on 127.0.0.1:{port}")
        await _run(f"http://127.0.0.1:{port}")
    finally:
        server.should_exit = True
        await task


async def _serve_forever(port: int = 8099) -> None:
    import uvicorn

    config = uvicorn.Config(
        _selftest_app(),
        host="127.0.0.1",
        port=port,
        log_level="warning",
        lifespan="off",
    )
    print(f"serve: admin gRPC-web on 127.0.0.1:{port} (fakes; Ctrl-C to stop)")
    await uvicorn.Server(config).serve()


def main() -> None:
    if "--selftest" in sys.argv:
        asyncio.run(_selftest())
    elif "--serve" in sys.argv:
        asyncio.run(_serve_forever())
    else:
        base = os.environ.get("ADMIN_URL", "http://localhost:8080")
        print(f"smoke: hitting {base}")
        asyncio.run(_run(base))


if __name__ == "__main__":
    main()
