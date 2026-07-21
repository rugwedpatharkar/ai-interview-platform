"""Bearer auth middleware for internal MCP servers."""

import pytest
from lib.mcp_auth import (
    BearerAuthMiddleware,
    assert_secret_configured,
    bearer_headers,
)
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route
from starlette.testclient import TestClient


def _app(secret: str) -> Starlette:
    app = Starlette(
        routes=[
            Route("/mcp", lambda _r: PlainTextResponse("ok")),
        ]
    )
    app.add_middleware(BearerAuthMiddleware, secret=secret)
    return app


def test_missing_header_rejected():
    client = TestClient(_app("s3cret"))
    r = client.get("/mcp")
    assert r.status_code == 401
    assert "missing bearer" in r.json()["error"]


def test_wrong_token_rejected():
    client = TestClient(_app("s3cret"))
    r = client.get("/mcp", headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401
    assert "invalid bearer" in r.json()["error"]


def test_correct_token_accepted():
    client = TestClient(_app("s3cret"))
    r = client.get("/mcp", headers={"Authorization": "Bearer s3cret"})
    assert r.status_code == 200
    assert r.text == "ok"


def test_bearer_prefix_case_insensitive():
    client = TestClient(_app("s3cret"))
    r = client.get("/mcp", headers={"Authorization": "bearer s3cret"})
    assert r.status_code == 200


def test_bearer_headers_helper():
    assert bearer_headers("") is None
    assert bearer_headers("abc") == {"Authorization": "Bearer abc"}


def test_secret_required_in_prod():
    with pytest.raises(ValueError):
        assert_secret_configured("", environment="prod", service="mcp-data")


def test_secret_optional_in_dev(caplog):
    # No exception; middleware won't be attached — caller checks the log warning.
    assert_secret_configured("", environment="dev", service="mcp-data")
    assert_secret_configured("s3cret", environment="prod", service="mcp-data")  # fine
