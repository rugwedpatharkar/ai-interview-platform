from functools import lru_cache

from lib.config import BaseServiceSettings


class Settings(BaseServiceSettings):
    """ai-agents settings. Inherits Mongo/Redis/RabbitMQ from lib; adds LLM config.

    The LLM API key is a secret — supply it via env (GEMINI_API_KEY), never a default.
    """

    service_name: str = "ai-agents"
    llm_provider: str = "gemini"
    llm_model: str = "gemini-2.5-flash"
    llm_temperature: float = 0.2
    llm_scoring_temperature: float = 0.0  # deterministic evaluator for fair scoring
    llm_timeout_seconds: int = 30
    llm_max_retries: int = 2
    scheduler_interval_seconds: int = 600  # how often abandoned interviews are reaped
    gemini_api_key: str = ""
    mcp_data_url: str = "http://localhost:8100/mcp"
    mcp_capability_url: str = "http://localhost:8101/mcp"
    http_host: str = "0.0.0.0"  # noqa: S104 — containerized server binds all interfaces
    http_port: int = 8080
    # Browser CORS allow-list for the REST/SSE endpoints (chat, jd, interview) the SPAs
    # call cross-origin. Comma-separated FE origins; a "*" here disables credentialed
    # CORS (see lib.web.cors_config). Override per deployment.
    cors_allow_origin: str = "http://localhost:3000,http://localhost:3001"
    livekit_url: str = "ws://localhost:7880"
    livekit_api_key: str = ""  # env only
    livekit_api_secret: str = ""  # env only
    groq_api_key: str = ""  # env only
    voice_rtc_token_ttl_seconds: int = 900
    voice_worker_http_port: int = (
        8090  # webhook listener port for the voice-worker service
    )
    voice_worker_identity_prefix: str = (
        "agent-"  # prefix for the worker participant identity
    )
    metrics_port: int = 0  # 0 = disabled; set to e.g. 9090 in prod
    tracing_enabled: bool = False  # dormant by default; enables OTel spans in prod


@lru_cache
def get_settings() -> Settings:
    return Settings()
