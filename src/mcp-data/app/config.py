from functools import lru_cache

from lib.config import BaseServiceSettings


class Settings(BaseServiceSettings):
    service_name: str = "mcp-data"
    mcp_host: str = "0.0.0.0"  # noqa: S104 — containerized SSE server binds all interfaces
    mcp_port: int = 8100
    metrics_port: int = 0  # 0 = disabled; set to e.g. 9102 in production
    tracing_enabled: bool = False  # dormant by default; no collector required


@lru_cache
def get_settings() -> Settings:
    return Settings()
