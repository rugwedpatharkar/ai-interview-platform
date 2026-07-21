"""Build the configured structured LLM from settings.

Workers call `get_llm()`/`get_scoring_llm()` at startup to obtain the real provider
client; tests inject a fake instead, so this factory (and its heavy provider import)
never runs under test. The provider import is branch-local so unknown-provider
validation needs no SDK.

Prod boots fail-closed on an empty gemini_api_key — the .env.example used to hint at
an "offline fake" that never existed, and every LLM RPC would fail at first call
instead of at startup. Dev logs a warning but continues (LLM calls will still error).
"""

from lib.logging import get_logger

from app.config import Settings

log = get_logger(component="ai_agents.factory")


def assert_llm_configured(settings: Settings) -> None:
    """Refuse to boot in prod without the LLM provider credential."""
    if settings.llm_provider == "gemini" and not settings.gemini_api_key:
        if settings.environment == "prod":
            raise ValueError(
                "GEMINI_API_KEY unset in production — every chat / interview / JD "
                "RPC would fail at first call; refusing to start"
            )
        log.warning("GEMINI_API_KEY unset — LLM RPCs will fail at call time (dev mode)")


def get_llm(settings: Settings, *, temperature: float | None = None):
    if settings.llm_provider == "gemini":
        from app.infra.gemini import GeminiLLM

        return GeminiLLM(
            model_id=settings.llm_model,
            api_key=settings.gemini_api_key,
            temperature=(
                settings.llm_temperature if temperature is None else temperature
            ),
            timeout=settings.llm_timeout_seconds,
            max_retries=settings.llm_max_retries,
        )
    raise ValueError(f"unsupported llm_provider: {settings.llm_provider}")


def get_scoring_llm(settings: Settings):
    """Deterministic LLM (temp 0) for the evaluator — repeatable, auditable scores."""
    return get_llm(settings, temperature=settings.llm_scoring_temperature)
