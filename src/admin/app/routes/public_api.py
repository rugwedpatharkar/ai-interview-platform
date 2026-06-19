"""Public (unauthenticated) REST surface — the SSR/SEO job marketplace.

`GET /public/jobs` is the one crawlable, tokenless endpoint: it reads the SAME
`resources/discovery.search_jobs` the authed `DiscoveryService` uses, returns published
jobs only (DTO scrubbed of internals), is per-IP rate-limited, and caps page_size at 24.
Mounted on the admin ASGI app for `/public/*` (sibling of the OAuth app). Returns
snake_case JSON (per the marketplace contract) with a short public cache. No auth, no
cookies, no candidate data — only published catalog rows.
"""

from lib.web import cors_config
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from starlette.routing import Route

from app.resources import discovery as discovery_res


def _client_ip(request, trusted_proxy: bool = False) -> str:
    # The transport peer is the real client (no proxy here); X-Forwarded-For is
    # attacker-controlled and only trusted when `trusted_proxy` is set.
    if trusted_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def make_public_routes(deps):
    async def search_jobs(request):
        ip = _client_ip(request, deps.get("trusted_proxy", False))
        hit = await deps["limiter"].hit(
            f"public_jobs:ip:{ip}", deps["rate_limit"], deps["rate_window"]
        )
        if not hit.allowed:
            return JSONResponse(
                {"error": "rate limited"},
                status_code=429,
                headers={"Retry-After": str(hit.retry_after)},
            )
        qp = request.query_params
        result = await discovery_res.search_jobs(
            {
                "q": qp.get("q", ""),
                "location": qp.get("location", ""),
                "remote": qp.get("remote", ""),
                "type": qp.get("type", ""),
                "level": qp.get("level", ""),
                "skills": [s for s in qp.get("skills", "").split(",") if s],
                "sort": qp.get("sort", ""),
                "page": _int(qp.get("page"), 1),
                "page_size": _int(qp.get("page_size"), 24),
            },
            jobs=deps["jobs"],
            companies=deps["companies"],
        )
        return JSONResponse(result, headers={"Cache-Control": "public, max-age=60"})

    return [Route("/public/jobs", search_jobs)]


def create_public_app(deps):
    # SSR + browser fetch the catalog cross-origin (no credentials); CORS allows the FE
    # origins for GET.
    cors = Middleware(
        CORSMiddleware,
        **cors_config(deps.get("cors_origins") or []),
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["content-type"],
    )
    return Starlette(routes=make_public_routes(deps), middleware=[cors])
