from functools import lru_cache

from lib.config import BaseServiceSettings


class Settings(BaseServiceSettings):
    service_name: str = "mcp-capability"
    mcp_host: str = "0.0.0.0"  # noqa: S104 — containerized SSE server binds all interfaces
    mcp_port: int = 8101
    # RAG seams: vector store + embeddings. redis_url is from base settings.
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = (
        ""  # required by managed Qdrant (Qdrant Cloud); empty for local
    )
    gemini_api_key: str = ""
    gemini_embed_model: str = "models/text-embedding-004"
    # Observability — 0 disables metrics server (safe for tests + local dev).
    metrics_port: int = 0
    tracing_enabled: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
