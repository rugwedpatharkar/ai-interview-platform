"""TDD: Redis timeout enforcement for RedisInterviewStore (Task 4).

Each of the three wrapped calls — save, get, list_in_progress — must raise
OperationTimeout when the Redis client hangs past the configured deadline.
"""

import asyncio

import pytest
from lib.resilience import OperationTimeout

from app.infra.sessions import RedisInterviewStore
from app.model.interview import InterviewSession
from lib import timeouts

# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class _SlowRedis:
    """Redis duck-type whose every method hangs for 2 seconds."""

    async def set(self, *a, **k):
        await asyncio.sleep(2.0)

    async def get(self, *a, **k):
        await asyncio.sleep(2.0)

    async def mget(self, *a, **k):
        await asyncio.sleep(2.0)

    async def scan_iter(self, match=None, count=None):
        # Yield one key so the mget branch is reached.
        yield "interview:app-1"


def _session() -> InterviewSession:
    return InterviewSession(application_id="app-1", comp_id="c1")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_save_raises_operation_timeout(monkeypatch):
    monkeypatch.setenv("REDIS_OP_TIMEOUT_SECONDS", "0.05")
    timeouts._cached_settings = None
    store = RedisInterviewStore(_SlowRedis())
    with pytest.raises(OperationTimeout):
        await store.save(_session())


@pytest.mark.asyncio
async def test_get_raises_operation_timeout(monkeypatch):
    monkeypatch.setenv("REDIS_OP_TIMEOUT_SECONDS", "0.05")
    timeouts._cached_settings = None
    store = RedisInterviewStore(_SlowRedis())
    with pytest.raises(OperationTimeout):
        await store.get("app-1")


@pytest.mark.asyncio
async def test_list_in_progress_raises_operation_timeout(monkeypatch):
    monkeypatch.setenv("REDIS_OP_TIMEOUT_SECONDS", "0.05")
    timeouts._cached_settings = None
    store = RedisInterviewStore(_SlowRedis())
    with pytest.raises(OperationTimeout):
        await store.list_in_progress()
