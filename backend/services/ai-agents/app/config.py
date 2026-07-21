from functools import lru_cache
from typing import ClassVar

from lib.config import BaseServiceSettings
from lib.timeouts import register_settings_provider
from pydantic import Field, field_validator


class Settings(BaseServiceSettings):
    """ai-agents settings. Inherits Mongo/Redis/RabbitMQ from lib; adds LLM config.

    The LLM API key is a secret — supply it via env (GEMINI_API_KEY), never a default.
    """

    # Base class's DEV_SENTINELS is auto-merged via MRO walk in the base validator; only
    # list the service-specific sentinels here.
    DEV_SENTINELS: ClassVar[dict[str, str]] = {
        "livekit_api_secret": "devsecret_change_me_min_32_chars_long",
    }

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
    # Per-call gRPC-web deadline. Generous because Chat is server-streaming (one long
    # answer) and StartInterview makes two sequential LLM calls; the inner LLM timeout
    # (llm_timeout_seconds) is the real per-call bound — this is the outer safety net.
    grpc_timeout_seconds: int = 300
    # Browser CORS allow-list for the gRPC-web endpoints (interview/chat/jd/proctor/rtc)
    # the SPAs call cross-origin. Comma-separated FE origins; a "*" here disables
    # credentialed CORS (see lib.web.cors_config). Override per deployment.
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
    # Interview/chat cap tuning — defaults match the hardcoded module constants so a
    # default-config run is behaviour-identical; override per deployment via env vars.
    default_aptitude_questions: int = Field(default=10, gt=0)
    max_chat_messages: int = Field(default=50, gt=0)
    max_proctor_events: int = Field(default=200, gt=0)
    # Interview time-budget ceiling. Was hardcoded to 180 min in blueprint.py — a JD
    # injection or model hallucination could steer to 3 h and hold a live Redis session
    # + LiveKit room for the duration. Default 60 min; tune per deployment.
    max_interview_budget_min: int = Field(default=60, gt=0)

    # Voice pipeline tuning — defaults match Phase-3 module constants so a
    # default-config run is byte-identical; override per-env via environment variables.
    voice_utterance_timeout_s: float = Field(default=90.0, gt=0)
    voice_play_timeout_s: float = Field(default=120.0, gt=0)
    voice_disconnect_timeout_s: float = Field(default=10.0, gt=0)
    voice_stt_timeout_s: float = Field(default=30.0, gt=0)
    voice_stt_max_retries: int = Field(default=2, ge=0)
    voice_tts_stream_timeout_s: float = Field(default=30.0, gt=0)
    voice_tts_max_retries: int = Field(default=2, ge=0)
    voice_tts_voice: str = "en-US-AvaNeural"
    voice_vad_activation: float = Field(default=0.5, ge=0.0, le=1.0)
    voice_vad_deactivation: float = Field(default=0.35, ge=0.0, le=1.0)
    voice_vad_min_speech_ms: int = Field(default=50, gt=0)
    voice_vad_min_silence_ms: int = Field(default=550, gt=0)
    voice_shutdown_timeout_s: float = Field(default=10.0, gt=0)

    @field_validator("mcp_data_url", "mcp_capability_url")
    @classmethod
    def _require_http_scheme(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError(f"MCP URL must start with http:// or https://; got: {v!r}")
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


# Point lib.timeouts accessors at this service's settings so per-service overrides and
# env vars actually reach mongo()/redis()/mcp_call()/... — previously they hit a bare
# BaseServiceSettings() and every subclass override silently no-op'd.
register_settings_provider(get_settings)
