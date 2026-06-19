"""SSO REST routes (Starlette) — OAuth authorize redirect + callback.

These ride on the admin ASGI app alongside the gRPC-web translator (a path-prefix
dispatcher in main.py routes /auth/oauth/* here). Registration/login stay gRPC; only the
OAuth redirect dance is REST. `oauth_login` does the user link/create + token mint.
"""

from urllib.parse import urlencode
from uuid import uuid4

from lib.logging import get_logger
from lib.web import cors_config
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse, RedirectResponse
from starlette.routing import Route

from app.config import get_settings
from app.errors import AuthDomainError, RateLimitedError
from app.resources.auth import oauth_login
from app.resources.auth import refresh as _refresh_session
from app.resources.auth import resend_verification as _resend_verification

log = get_logger(component="oauth.routes")

_STATE_TTL = 600  # 10 minutes


def _resolve_redirect(requested, deps):
    """Use the requested FE callback only if allow-listed; else the configured default
    (stops redirecting the post-login flow to an arbitrary attacker origin)."""
    return (
        requested
        if requested in deps.get("allowed_redirects", [])
        else deps["frontend_redirect"]
    )


async def _bind_redirect(deps, state, redirect):
    await deps["redis"].set(f"oauth_redirect:{state}", redirect, ex=_STATE_TTL)


async def _take_redirect(deps, state):
    """Single-use lookup of the FE redirect bound to `state` at authorize time."""
    if not state:
        return None
    key = f"oauth_redirect:{state}"
    val = await deps["redis"].get(key)
    await deps["redis"].delete(key)
    return val.decode() if isinstance(val, bytes) else val


def _client_ip(request, trusted_proxy=False):
    """Caller IP for rate-limiting. The transport peer is the real client (no proxy in
    this deployment); X-Forwarded-For is attacker-controlled and only trusted when
    `trusted_proxy` is set, so a client cannot spoof the per-IP limit by forging it."""
    if trusted_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def make_oauth_routes(deps):
    def _set_refresh_cookie(response, refresh):
        # The long-lived refresh token stays OUT of the URL (it leaks via history, the
        # Referer header, access logs) — HttpOnly+Secure cookie, read only by /refresh.
        response.set_cookie(
            "refresh_token",
            refresh,
            max_age=deps["refresh_ttl_seconds"],
            httponly=True,
            secure=True,
            samesite="lax",
            path="/",
        )
        response.headers["Cache-Control"] = "no-store"

    def _error_redirect(redirect, code):
        # Error bounces carry no cookie, but the URL still must not leak via Referer.
        response = RedirectResponse(f"{redirect}#error={code}")
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    async def authorize(request):
        provider = request.query_params.get("provider", "")
        redirect = _resolve_redirect(request.query_params.get("redirect", ""), deps)
        cfg = deps["authorize"].get(provider)
        if cfg is None:
            # Friendly: bounce to the FE callback's error branch, not a raw JSON 404.
            log.warning("oauth authorize: unknown provider {}", provider)
            return _error_redirect(redirect, "unknown_provider")
        state = uuid4().hex
        await deps["states"].allow(state, _STATE_TTL)
        await _bind_redirect(deps, state, redirect)
        params = urlencode(
            {
                "client_id": cfg["client_id"],
                "redirect_uri": cfg["redirect_uri"],
                "response_type": "code",
                "scope": cfg["scope"],
                "state": state,
            }
        )
        return RedirectResponse(f"{cfg['authorize_url']}?{params}")

    async def callback(request):
        state = request.query_params.get("state", "")
        redirect = await _take_redirect(deps, state) or deps["frontend_redirect"]
        try:
            result = await oauth_login(
                request.query_params.get("provider", ""),
                request.query_params.get("code", ""),
                state,
                ip=_client_ip(request, deps.get("trusted_proxy", False)),
                oauth_client=deps["oauth_client"],
                users=deps["users"],
                tokens=deps["tokens"],
                sessions=deps["sessions"],
                states=deps["states"],
                limiter=deps["limiter"],
                refresh_ttl_seconds=deps["refresh_ttl_seconds"],
                audit=deps.get("audit"),
            )
        except RateLimitedError:
            return _error_redirect(redirect, "rate_limited")
        except AuthDomainError:
            return _error_redirect(redirect, "auth_failed")
        # Access-only fragment to the per-app FE callback bound to this state.
        refresh = result.pop("refresh_token")
        response = RedirectResponse(f"{redirect}#{urlencode(result)}")
        _set_refresh_cookie(response, refresh)
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    async def providers(request):
        # Lets the FE render only configured SSO buttons (no dead 404 buttons).
        return JSONResponse({"providers": sorted(deps["authorize"])})

    async def refresh(request):
        # SSO silent refresh: the SPA can't read the HttpOnly cookie, so it POSTs here
        # with credentials; we rotate the session + return a fresh access token.
        # Per-IP gate first (before the cookie check) so a flood can't DoS refresh.
        ip = _client_ip(request, deps.get("trusted_proxy", False))
        s = get_settings()
        hit = await deps["limiter"].hit(
            f"oauth_refresh:ip:{ip}", s.refresh_limit, s.refresh_window_seconds
        )
        if not hit.allowed:
            return JSONResponse(
                {"error": "rate limited"},
                status_code=429,
                headers={"Retry-After": str(hit.retry_after)},
            )
        cookie = request.cookies.get("refresh_token", "")
        if not cookie:
            return JSONResponse({"error": "no refresh"}, status_code=401)
        try:
            result = await _refresh_session(
                cookie,
                users=deps["users"],
                tokens=deps["tokens"],
                sessions=deps["sessions"],
                refresh_ttl_seconds=deps["refresh_ttl_seconds"],
            )
        except AuthDomainError:
            resp = JSONResponse({"error": "invalid refresh"}, status_code=401)
            resp.delete_cookie("refresh_token", path="/")
            return resp
        new_refresh = result.pop("refresh_token")
        resp = JSONResponse(
            {"access_token": result["access_token"], "token_type": "bearer"}
        )
        _set_refresh_cookie(resp, new_refresh)
        return resp

    async def resend(request):
        # No-op success if JSON body is missing/malformed — caller can't enumerate.
        try:
            body = await request.json()
        except Exception:
            body = {}
        email = body.get("email", "")
        ip = _client_ip(request, deps.get("trusted_proxy", False))
        try:
            await _resend_verification(
                email,
                users=deps["users"],
                tokens=deps["tokens"],
                notifier=deps["notifier"],
                nonces=deps.get("nonces"),
                limiter=deps.get("limiter"),
                ip=ip,
            )
        except RateLimitedError as exc:
            return JSONResponse(
                {"error": "rate limited"},
                status_code=429,
                headers={"Retry-After": str(exc.retry_after)},
            )
        return JSONResponse(None, status_code=204)

    return [
        Route("/auth/oauth/authorize", authorize),
        Route("/auth/oauth/callback", callback),
        Route("/auth/oauth/providers", providers),
        Route("/auth/oauth/refresh", refresh, methods=["POST"]),
        Route("/auth/resend-verification", resend, methods=["POST"]),
    ]


def create_oauth_app(deps):
    # The SPAs call /providers (GET) + /refresh (POST, credentialed) cross-origin; CORS
    # must allow the FE origins WITH credentials so the HttpOnly refresh cookie flows.
    cors = Middleware(
        CORSMiddleware,
        **cors_config(deps.get("cors_origins") or []),
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["authorization", "content-type"],
    )
    return Starlette(routes=make_oauth_routes(deps), middleware=[cors])
