from functools import lru_cache

from lib.config import BaseServiceSettings


class Settings(BaseServiceSettings):
    service_name: str = "mcp-data"
    mcp_host: str = "0.0.0.0"  # noqa: S104 — containerized SSE server binds all interfaces
    mcp_port: int = 8100


@lru_cache
def get_settings() -> Settings:
    return Settings()
