import pytest
from lib.logging import current_correlation_id
from lib.web import CorrelationIdMiddleware, cors_config


def test_wildcard_drops_credentials():
    # *+credentials would make Starlette reflect ANY origin with creds — refuse it.
    assert cors_config(["*"]) == {"allow_origins": ["*"], "allow_credentials": False}


def test_empty_drops_credentials():
    assert cors_config([]) == {"allow_origins": ["*"], "allow_credentials": False}


def test_explicit_list_keeps_credentials():
    cfg = cors_config(["http://localhost:3000", "http://localhost:3001"])
    assert cfg["allow_credentials"] is True
    assert cfg["allow_origins"] == ["http://localhost:3000", "http://localhost:3001"]


async def _drive(headers):
    """Drive CorrelationIdMiddleware with a minimal ASGI http scope.

    Returns (cid_seen_by_inner_app, response_headers_dict).
    """
    seen = {}
    sent = []

    async def inner(scope, receive, send):
        seen["cid"] = current_correlation_id()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    async def receive():
        return {"type": "http.request"}

    async def send(msg):
        sent.append(msg)

    await CorrelationIdMiddleware(inner)(
        {"type": "http", "headers": headers}, receive, send
    )
    start = next(m for m in sent if m["type"] == "http.response.start")
    return seen["cid"], dict(start["headers"])


@pytest.mark.asyncio
async def test_uses_incoming_correlation_header():
    cid, resp = await _drive([(b"x-correlation-id", b"req-9")])
    assert cid == "req-9"  # bound for the inner app
    assert resp[b"x-correlation-id"] == b"req-9"  # echoed on the response


@pytest.mark.asyncio
async def test_oversized_incoming_correlation_is_replaced():
    cid, _ = await _drive([(b"x-correlation-id", b"x" * 5000)])
    assert 0 < len(cid) <= 64  # a huge client-supplied id is replaced with a fresh one


@pytest.mark.asyncio
async def test_generates_correlation_id_when_absent():
    cid, resp = await _drive([])
    assert cid  # a fresh id was generated + bound
    assert resp[b"x-correlation-id"] == cid.encode()


@pytest.mark.asyncio
async def test_correlation_id_reset_after_request():
    await _drive([(b"x-correlation-id", b"req-1")])
    assert current_correlation_id() is None  # reset in finally


@pytest.mark.asyncio
async def test_non_http_scope_passes_through():
    """A non-http (e.g. lifespan) scope is forwarded untouched."""
    forwarded = {}

    async def inner(scope, receive, send):
        forwarded["type"] = scope["type"]

    await CorrelationIdMiddleware(inner)({"type": "lifespan"}, None, None)
    assert forwarded["type"] == "lifespan"
