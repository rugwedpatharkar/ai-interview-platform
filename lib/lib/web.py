"""Shared web/transport helpers for the browser-facing services."""

from lib.logging import new_correlation_id, reset_correlation_id, set_correlation_id

_CORRELATION_HEADER = b"x-correlation-id"
_MAX_CORRELATION_LEN = 64


def cors_config(origins: list[str]) -> dict:
    """CORS kwargs that refuse the unsafe wildcard-plus-credentials combination.

    A credentialed wildcard makes Starlette/FastAPI reflect ANY request Origin back
    with `Allow-Credentials: true` (every site becomes a trusted credentialed origin —
    a universal CORS bypass). So: a wildcard (or empty) origin set drops credentials
    (browsers forbid `*` + credentials anyway); an explicit allow-list keeps credentials
    so the HttpOnly refresh cookie can flow cross-origin to `/auth/oauth/refresh`.
    """
    if not origins or "*" in origins:
        return {"allow_origins": ["*"], "allow_credentials": False}
    return {"allow_origins": origins, "allow_credentials": True}


class CorrelationIdMiddleware:
    """ASGI middleware: bind a correlation_id for each HTTP request (from the
    ``X-Correlation-ID`` header or a fresh one), echo it on the response, and reset the
    contextvar on exit — so every log line for the request carries the id and any event
    the request publishes inherits it.
    """

    def __init__(self, app) -> None:
        self._app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return
        incoming = dict(scope.get("headers") or []).get(_CORRELATION_HEADER)
        decoded = incoming.decode("ascii", "replace") if incoming else ""
        # Cap a client-supplied id (a UUID4 hex is 32 chars): a huge/garbage header
        # would otherwise be echoed into every log line for the request.
        cid = (
            decoded
            if 0 < len(decoded) <= _MAX_CORRELATION_LEN
            else new_correlation_id()
        )
        token = set_correlation_id(cid)

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                message.setdefault("headers", []).append(
                    (_CORRELATION_HEADER, cid.encode())
                )
            await send(message)

        try:
            await self._app(scope, receive, send_wrapper)
        finally:
            reset_correlation_id(token)
