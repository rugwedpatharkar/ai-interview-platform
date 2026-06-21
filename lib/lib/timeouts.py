"""Per-class timeout/retry knob accessors. Reads from ``BaseServiceSettings``.

Call sites use ``with_timeout(coro, lib.timeouts.mongo(), op="...")`` — never a magic
number — so per-environment tuning happens via env, not code edits.
"""

from lib.config import BaseServiceSettings

_cached_settings: BaseServiceSettings | None = None


def _s() -> BaseServiceSettings:
    global _cached_settings
    if _cached_settings is None:
        _cached_settings = BaseServiceSettings()
    return _cached_settings


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
