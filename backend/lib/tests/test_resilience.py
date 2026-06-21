"""Tests for lib.resilience — with_timeout + retry."""

import asyncio

import pytest
from lib.resilience import OperationTimeout, retry, with_timeout

# ---------------------------------------------------------------------------
# with_timeout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_with_timeout_completes_fast():
    """A coroutine that finishes within the deadline returns normally."""
    result = await with_timeout(asyncio.sleep(0, result="ok"), 1.0, op="test")
    assert result == "ok"


@pytest.mark.asyncio
async def test_with_timeout_raises_operation_timeout_on_slow_coro():
    """A coroutine that exceeds the deadline raises OperationTimeout."""

    async def slow():
        await asyncio.sleep(10)

    with pytest.raises(OperationTimeout) as exc_info:
        await with_timeout(slow(), 0.01, op="slow_op")

    err = exc_info.value
    assert err.op == "slow_op"
    assert err.seconds == 0.01
    assert "slow_op" in str(err)


@pytest.mark.asyncio
async def test_with_timeout_does_not_swallow_other_exceptions():
    """Non-timeout errors are propagated as-is."""

    async def boom():
        raise ValueError("bad")

    with pytest.raises(ValueError, match="bad"):
        await with_timeout(boom(), 5.0, op="boom_op")


@pytest.mark.asyncio
async def test_operation_timeout_is_not_a_builtin_timeout_error():
    """OperationTimeout must be a distinct type so callers can catch it specifically."""
    with pytest.raises(OperationTimeout):
        await with_timeout(asyncio.sleep(10), 0.01, op="t")


# ---------------------------------------------------------------------------
# retry
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_retry_succeeds_on_first_attempt():
    calls = []

    @retry(attempts=3, base_delay=0)
    async def ok():
        calls.append(1)
        return "done"

    result = await ok()
    assert result == "done"
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_retry_retries_up_to_cap_then_raises():
    """After all attempts are exhausted the last exception is re-raised."""
    attempts_made = []

    @retry(attempts=3, base_delay=0)
    async def always_fail():
        attempts_made.append(1)
        raise RuntimeError("nope")

    with pytest.raises(RuntimeError, match="nope"):
        await always_fail()

    assert len(attempts_made) == 3  # exactly 3 total attempts


@pytest.mark.asyncio
async def test_retry_succeeds_after_transient_failure():
    """Succeeds on the 2nd attempt; total calls == 2."""
    calls = []

    @retry(attempts=3, base_delay=0)
    async def flaky():
        calls.append(1)
        if len(calls) < 2:
            raise RuntimeError("transient")
        return "ok"

    result = await flaky()
    assert result == "ok"
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_retry_does_not_retry_unmatched_exceptions():
    """Exceptions not in retry_on propagate immediately without retrying."""
    calls = []

    @retry(attempts=5, base_delay=0, retry_on=(ValueError,))
    async def wrong_exc():
        calls.append(1)
        raise TypeError("not retryable")

    with pytest.raises(TypeError):
        await wrong_exc()

    assert len(calls) == 1  # no retries


@pytest.mark.asyncio
async def test_retry_honors_attempt_count(monkeypatch):
    """Verify exactly N attempts are made regardless of backoff timing."""
    import lib.resilience as _res

    sleeps: list[float] = []

    async def fake_sleep(s):
        sleeps.append(s)

    monkeypatch.setattr(_res.asyncio, "sleep", fake_sleep)

    calls = []

    @retry(attempts=4, base_delay=0.1)
    async def always_fail():
        calls.append(1)
        raise RuntimeError("x")

    with pytest.raises(RuntimeError):
        await always_fail()

    assert len(calls) == 4
    # 3 sleeps between 4 attempts
    assert len(sleeps) == 3


def test_retry_raises_on_invalid_attempts():
    with pytest.raises(ValueError):
        retry(attempts=0)
