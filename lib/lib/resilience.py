"""Resilience primitives: timeout + retry with bounded exponential backoff.

All helpers are offline-testable (no real network required). Import and use directly:

    from lib.resilience import with_timeout, retry, OperationTimeout
"""

import asyncio
import random
from collections.abc import Awaitable, Callable
from functools import wraps
from typing import Any

from lib.logging import get_logger

log = get_logger(component="resilience")


class OperationTimeout(Exception):
    """Raised when an operation exceeds its allowed duration."""

    def __init__(self, op: str, seconds: float) -> None:
        super().__init__(f"Operation '{op}' timed out after {seconds}s")
        self.op = op
        self.seconds = seconds


async def with_timeout[T](coro: Awaitable[T], seconds: float, *, op: str) -> T:
    """Await *coro* but raise :exc:`OperationTimeout` if it takes longer than *seconds*.

    Logs a warning on timeout before re-raising.

    Args:
        coro: The awaitable to run.
        seconds: Maximum allowed duration in seconds.
        op: A human-readable operation name for logs and the exception.

    Raises:
        OperationTimeout: When the coroutine does not complete in time.
    """
    try:
        async with asyncio.timeout(seconds):
            return await coro
    except TimeoutError as exc:
        log.warning("timeout: op={} limit_s={}", op, seconds)
        raise OperationTimeout(op, seconds) from exc


def retry(
    *,
    attempts: int = 3,
    base_delay: float = 0.5,
    retry_on: tuple[type[Exception], ...] = (Exception,),
) -> Callable[[Callable[..., Awaitable[Any]]], Callable[..., Awaitable[Any]]]:
    """Async decorator: retry with bounded exponential backoff + jitter.

    Sleeps ``base_delay * 2**attempt + jitter`` between attempts where jitter is
    uniform in ``[0, base_delay)``. Gives up after *attempts* total tries and
    re-raises the last exception.

    Only exceptions whose type is a subclass of any entry in *retry_on* trigger a
    retry; all others propagate immediately.

    Args:
        attempts: Total number of tries (including the first). Must be >= 1.
        base_delay: Base delay in seconds for backoff calculation.
        retry_on: Tuple of exception types that should trigger a retry.
    """
    if attempts < 1:
        raise ValueError("attempts must be >= 1")

    def decorator(
        fn: Callable[..., Awaitable[Any]],
    ) -> Callable[..., Awaitable[Any]]:
        @wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            last_exc: Exception | None = None
            for attempt in range(attempts):
                try:
                    return await fn(*args, **kwargs)
                except retry_on as exc:
                    last_exc = exc
                    if attempt < attempts - 1:
                        # Jitter is for backoff timing, not cryptographic use.
                        delay = base_delay * (2**attempt) + random.uniform(  # noqa: S311
                            0, base_delay
                        )
                        log.warning(
                            "retry: fn={} attempt={}/{} delay_s={:.2f} error={}",
                            fn.__qualname__,
                            attempt + 1,
                            attempts,
                            delay,
                            exc,
                        )
                        await asyncio.sleep(delay)
                    else:
                        log.error(
                            "retry: fn={} exhausted attempt={}/{} error={}",
                            fn.__qualname__,
                            attempt + 1,
                            attempts,
                            exc,
                        )
            raise last_exc  # type: ignore[misc]

        return wrapper

    return decorator
