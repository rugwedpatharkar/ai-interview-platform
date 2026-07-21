"""Per-class timeout/retry knob accessors. Reads from ``BaseServiceSettings``.

Call sites use ``with_timeout(coro, lib.timeouts.mongo(), op="...")`` — never a magic
number — so per-environment tuning happens via env, not code edits.

Each service's ``app/config.py`` calls ``register_settings_provider(get_settings)`` at
import time so accessors see per-service overrides (subclass field defaults + subclass
env-var handling). Without a registered provider, accessors fall back to a bare
``BaseServiceSettings()`` — enough for tests that import ``lib`` but no service.
"""

from collections.abc import Callable

from lib.config import BaseServiceSettings

_provider: Callable[[], BaseServiceSettings] | None = None
_fallback: BaseServiceSettings | None = None


def register_settings_provider(provider: Callable[[], BaseServiceSettings]) -> None:
    """Point ``lib.timeouts`` at the caller service's ``get_settings``.

    Idempotent within a process; call once from ``app/config.py``.
    """
    global _provider
    _provider = provider


def _s() -> BaseServiceSettings:
    if _provider is not None:
        return _provider()
    global _fallback
    if _fallback is None:
        _fallback = BaseServiceSettings()
    return _fallback


def reset_for_test() -> None:
    """Drop the fallback and clear any lru_cache on a registered provider.

    Test helper: call after ``monkeypatch.setenv`` so the next accessor re-reads env.
    Replaces the older `timeouts._cached_settings = None` pattern.
    """
    global _fallback
    _fallback = None
    if _provider is not None and hasattr(_provider, "cache_clear"):
        _provider.cache_clear()


def mongo() -> float:
    return _s().mongo_op_timeout_seconds


def redis() -> float:
    return _s().redis_op_timeout_seconds


def rabbitmq_publish() -> float:
    return _s().rabbitmq_publish_timeout_seconds


def llm_call() -> float:
    return _s().llm_call_timeout_seconds


def llm_retries() -> int:
    return _s().llm_call_retry_attempts


def mcp_call() -> float:
    return _s().mcp_call_timeout_seconds


def storage_op() -> float:
    return _s().storage_op_timeout_seconds


def http_client() -> float:
    return _s().http_client_timeout_seconds
