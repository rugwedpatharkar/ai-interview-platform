import inspect
import sys
import time
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from contextvars import ContextVar, Token
from functools import wraps
from typing import Any

from loguru import logger

_configured = False
_SENSITIVE = {
    "password",
    "password_hash",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "authorization",
    "api_key",
}

# Correlation ID propagated through async context (request, event, session).
_correlation_id: ContextVar[str | None] = ContextVar("correlation_id", default=None)


def new_correlation_id() -> str:
    """Return a fresh short UUID4 string."""
    return uuid.uuid4().hex


def set_correlation_id(value: str) -> Token:
    """Set the correlation ID for the current async context.

    Returns the :class:`contextvars.Token` so ASGI middleware / gRPC interceptors
    can call ``reset_correlation_id(token)`` on exit to restore the prior value.
    """
    return _correlation_id.set(value)


def reset_correlation_id(token: Token) -> None:
    """Reset the correlation ID to the value prior to ``set_correlation_id``.

    Pass the Token returned by :func:`set_correlation_id`.
    """
    _correlation_id.reset(token)


def current_correlation_id() -> str | None:
    """Return the correlation ID for the current async context, if set."""
    return _correlation_id.get()


def bind_ids(**ids: Any) -> dict[str, Any]:
    """Return a dict of the given ids plus the current correlation_id (when set).

    Pass the result as **kwargs to logger.bind() or into log_context().
    """
    cid = _correlation_id.get()
    return {**ids, **({"correlation_id": cid} if cid else {})}


def _redact_extra(record) -> None:
    """Scrub known-sensitive keys from a record's bound context before formatting."""
    extra = record["extra"]
    for key in list(extra):
        if key.lower() in _SENSITIVE:
            extra[key] = "***"
    # Inject the current correlation_id into every log line when set.
    cid = _correlation_id.get()
    if cid and "correlation_id" not in extra:
        extra["correlation_id"] = cid


def configure_logging(service_name: str, level: str = "INFO") -> None:
    """Configure process-wide structured logging. Idempotent."""
    global _configured
    if _configured:
        return
    logger.remove()
    logger.add(
        sys.stderr,
        level=level,
        backtrace=False,
        diagnose=False,
        format=(
            "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level>"
            " | {extra} | {message}"
        ),
    )
    logger.configure(extra={"service": service_name}, patcher=_redact_extra)
    _configured = True


def get_logger(**context):
    """Return a logger bound with context (e.g. comp_id, user_id, request_id)."""
    return logger.bind(**context)


def log_operation(log, name: str, **ctx):
    """Decorator (sync + async) that logs entry, exit with duration_ms, and exceptions.

    Usage::

        @log_operation(log, "publish", routing_key=key)
        async def publish(...):
            ...
    """

    def decorator(fn):
        if _is_async(fn):

            @wraps(fn)
            async def async_wrapper(*args, **kwargs):
                bound = log.bind(**ctx) if ctx else log
                bound.info("op.start: {}", name)
                t0 = time.monotonic()
                try:
                    result = await fn(*args, **kwargs)
                    bound.info("op.done: {}  duration_ms={:.1f}", name, _ms(t0))
                    return result
                except Exception:
                    bound.exception("op.error: {}  duration_ms={:.1f}", name, _ms(t0))
                    raise

            return async_wrapper

        @wraps(fn)
        def sync_wrapper(*args, **kwargs):
            bound = log.bind(**ctx) if ctx else log
            bound.info("op.start: {}", name)
            t0 = time.monotonic()
            try:
                result = fn(*args, **kwargs)
                bound.info("op.done: {}  duration_ms={:.1f}", name, _ms(t0))
                return result
            except Exception:
                bound.exception("op.error: {}  duration_ms={:.1f}", name, _ms(t0))
                raise

        return sync_wrapper

    return decorator


@asynccontextmanager
async def log_context(log, name: str, **ctx) -> AsyncGenerator[None, None]:
    """Async context manager that logs entry, exit with duration_ms, and exceptions.

    Usage::

        async with log_context(log, "repository.insert", comp_id=cid):
            ...
    """
    bound = log.bind(**ctx) if ctx else log
    bound.info("op.start: {}", name)
    t0 = time.monotonic()
    try:
        yield
        bound.info("op.done: {}  duration_ms={:.1f}", name, _ms(t0))
    except Exception:
        bound.exception("op.error: {}  duration_ms={:.1f}", name, _ms(t0))
        raise


def _ms(t0: float) -> float:
    return (time.monotonic() - t0) * 1000


def _is_async(fn) -> bool:
    return inspect.iscoroutinefunction(fn)
