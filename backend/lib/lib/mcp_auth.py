"""Shared bearer-token auth for the internal MCP servers + their one client.

The MCP servers (mcp-data, mcp-capability) run FastMCP over streamable-http bound to
0.0.0.0 with no built-in auth — anyone reachable on the internal network can call any
tool and forge a `scope` dict for cross-tenant reads/writes. This middleware requires
`Authorization: Bearer <MCP_SHARED_SECRET>` on every request. ai-agents (the only
legitimate client) sends the same header via ``bearer_headers``.

Enforcement matches the pattern used for JWT_SECRET in ``lib.config``:

* In ``environment == "prod"`` a missing secret is a startup ValueError.
* In dev the secret may be unset — the middleware isn't attached and a warning is
  logged, so ``docker compose up`` works out of the box.

Belt-and-braces: the Render nginx.conf.template does NOT expose the MCP ports publicly,
so an attacker also has to be on the internal network. This middleware is the second
layer that catches a misconfiguration or a compromised co-tenant service.
"""

import hmac

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from lib.logging import get_logger

log = get_logger(component="mcp_auth")

_BEARER_PREFIX = "bearer "


class BearerAuthMiddleware(BaseHTTPMiddleware):
    """Reject requests without a matching ``Authorization: Bearer <secret>`` header."""

    def __init__(self, app, *, secret: str) -> None:
        super().__init__(app)
        self._secret = secret

    async def dispatch(self, request, call_next):
        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith(_BEARER_PREFIX):
            return JSONResponse({"error": "missing bearer token"}, status_code=401)
        supplied = auth[len(_BEARER_PREFIX) :].strip()
        if not hmac.compare_digest(supplied, self._secret):
            return JSONResponse({"error": "invalid bearer token"}, status_code=401)
        return await call_next(request)


def assert_secret_configured(secret: str, *, environment: str, service: str) -> None:
    """Fail startup in prod if the MCP shared secret is unset; warn in dev."""
    if secret:
        return
    if environment == "prod":
        raise ValueError(
            f"{service}: MCP_SHARED_SECRET must be set in production — "
            f"server would accept unauthenticated cross-tenant reads/writes"
        )
    log.warning(
        "{}: MCP_SHARED_SECRET unset — MCP server is UNAUTHENTICATED (dev mode)",
        service,
    )


def bearer_headers(secret: str) -> dict | None:
    """Client-side helper: build ``{Authorization: Bearer <secret>}`` or None."""
    return {"Authorization": f"Bearer {secret}"} if secret else None
