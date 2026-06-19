from functools import lru_cache

from lib.config import BaseServiceSettings
from pydantic import Field, field_validator

_OAUTH_REQUIRED_KEYS = {
    "authorize_url",
    "token_url",
    "userinfo_url",
    "client_id",
    "client_secret",
    "redirect_uri",
    "scope",
}


def _check_oauth_providers(providers):
    """Fail fast at startup if a configured provider is missing a required key (the
    authorize redirect + token/userinfo exchange both read these)."""
    for name, cfg in providers.items():
        missing = _OAUTH_REQUIRED_KEYS - set(cfg or {})
        if missing:
            raise ValueError(f"oauth provider {name!r} missing keys: {sorted(missing)}")
    return providers


class Settings(BaseServiceSettings):
    """Admin-service settings. Inherits Mongo/Redis/RabbitMQ/JWT from lib;
    add service-specific fields here as needed."""

    service_name: str = "admin-service"
    # Rate-limit tuning — defaults match the hardcoded values in auth.py/oauth.py so a
    # default-config run is behaviour-identical; override per deployment via env vars.
    login_limit: int = Field(default=5, gt=0)
    login_window_seconds: int = Field(default=900, gt=0)
    oauth_limit: int = Field(default=10, gt=0)
    oauth_window_seconds: int = Field(default=900, gt=0)
    refresh_limit: int = Field(default=30, gt=0)
    refresh_window_seconds: int = Field(default=900, gt=0)
    resend_limit: int = Field(default=5, gt=0)
    resend_window_seconds: int = Field(default=900, gt=0)
    # Serves gRPC-web over HTTP (browser reaches it directly; no proxy). See
    # app/routes/grpcweb.py and docs/superpowers/plans/DEPLOYMENT.md.
    http_host: str = "0.0.0.0"  # noqa: S104 — containerized server binds all interfaces
    http_port: int = 8080
    # Explicit FE origins so credentialed CORS (the refresh cookie) works; a "*" here
    # disables credentials (see lib.web.cors_config). Override per deployment.
    cors_allow_origin: str = "http://localhost:3000,http://localhost:3001"
    grpc_max_message_bytes: int = 4 * 1024 * 1024  # 4 MiB request cap (DoS guard)
    grpc_timeout_seconds: int = 30  # per-call deadline ceiling
    trusted_proxy: bool = False  # only trust X-Forwarded-For behind a real proxy
    retention_days: int = 365  # candidate data retention window
    aptitude_expiry_hours: int = 24  # abandoned aptitude tests expire after this
    scheduler_interval_seconds: int = 3600  # how often the liveness reapers run
    recommend_fanout_limit: int = 20  # max jobs a parsed profile fans match.run out to
    # SSO (OAuth) — provider config map + the SPA callback URL. Empty until creds exist.
    oauth_providers: dict = Field(default_factory=dict)
    oauth_frontend_redirect: str = "http://localhost:3000/auth/callback"
    # Allow-list of per-app FE callback URLs an `authorize?redirect=` may target (so the
    # candidate :3000 and company :3001 apps each receive their own callback). The
    # default above is the fallback when the requested redirect isn't allow-listed.
    oauth_allowed_redirects: list[str] = Field(default_factory=list)
    # Observability: 0 = metrics server disabled (default keeps tests offline).
    metrics_port: int = 0
    tracing_enabled: bool = False

    @field_validator("oauth_providers")
    @classmethod
    def _validate_oauth_providers(cls, v):
        return _check_oauth_providers(v)


@lru_cache
def get_settings() -> Settings:
    return Settings()
