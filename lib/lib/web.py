"""Shared web/transport helpers for the browser-facing services."""


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
