"""`/healthz` HTTP liveness probe: 200 "ok", no DB hit, short-circuits before gRPC.

A previous HTTP health route was dropped in favour of grpc.health.v1, but plain-HTTP
infrastructure — load-balancer health checks (Render), reverse proxies, uptime monitors
(UptimeRobot) — can't speak the gRPC health protocol, so the deploy needs an HTTP probe.
This one is intentionally trivial: it proves the process is up, touches no dependency.
"""

from app.main import _dispatcher, _health


async def test_health_writes_200_ok():
    sent = []

    async def send(msg):
        sent.append(msg)

    await _health(send)

    assert sent[0]["type"] == "http.response.start"
    assert sent[0]["status"] == 200
    assert sent[1]["body"] == b"ok"


async def test_dispatch_healthz_short_circuits():
    called = []

    async def grpc(scope, receive, send):
        called.append("grpc")

    async def oauth(scope, receive, send):
        called.append("oauth")

    async def public(scope, receive, send):
        called.append("public")

    dispatch = _dispatcher(grpc, oauth, public)
    sent = []

    async def send(msg):
        sent.append(msg)

    async def receive():
        return {}

    # /healthz never reaches the sub-apps
    await dispatch({"type": "http", "path": "/healthz"}, receive, send)
    assert called == []
    assert sent[0]["status"] == 200

    # a real gRPC path still falls through
    await dispatch(
        {"type": "http", "path": "/admin.auth.v1.AuthService/Login"}, receive, send
    )
    assert called == ["grpc"]
