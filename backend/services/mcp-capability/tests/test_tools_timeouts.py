"""Verify that all 7 Redis call sites in app/tools.py respect the redis timeout knob.

Strategy: run kb_search and ingest (via _ingest_one) against a _SlowRedis that
sleeps 2 s on every call, with REDIS_OP_TIMEOUT_SECONDS=0.05.  All seven sites
must raise OperationTimeout well before the 2 s sleep completes.
"""

import asyncio

import pytest
from lib.resilience import OperationTimeout

from lib import timeouts


class _SlowRedis:
    """Every Redis method sleeps 2 s — guaranteed to breach the 0.05 s test budget."""

    async def get(self, key):
        await asyncio.sleep(2.0)

    async def set(self, key, value, ex=None):
        await asyncio.sleep(2.0)

    async def sismember(self, key, member):
        await asyncio.sleep(2.0)

    async def sadd(self, key, member):
        await asyncio.sleep(2.0)

    async def expire(self, key, seconds):
        await asyncio.sleep(2.0)

    async def incr(self, key):
        await asyncio.sleep(2.0)


class _FakeEmbedder:
    async def embed(self, texts):
        return [[0.1] * 4 for _ in texts]


class _FakeFetcher:
    def __init__(self, text="hello world"):
        self._text = text

    async def fetch(self, url):
        return {"text": self._text, "url": url}


class _FakeStore:
    async def upsert(self, collection, ids, vectors, payloads):
        pass

    async def search(self, collection, vector, k):
        return []


# ---------------------------------------------------------------------------
# kb_search: lines 133 (version_read) and 135 (cache_get)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_kb_search_version_read_respects_timeout(monkeypatch):
    monkeypatch.setenv("REDIS_OP_TIMEOUT_SECONDS", "0.05")
    timeouts.reset_for_test()
    from app.tools import kb_search

    with pytest.raises(OperationTimeout) as exc_info:
        await kb_search(
            "query",
            "topic",
            "owner",
            embedder=_FakeEmbedder(),
            store=_FakeStore(),
            redis=_SlowRedis(),
        )
    assert exc_info.value.op == "kb_search.version_read"


@pytest.mark.asyncio
async def test_kb_search_cache_get_respects_timeout(monkeypatch):
    """The cache_get site is hit after a fast version read; patched version read."""
    monkeypatch.setenv("REDIS_OP_TIMEOUT_SECONDS", "0.05")
    timeouts.reset_for_test()

    class _FastVersionRedis(_SlowRedis):
        """Returns a fast version_key result but sleeps on cache_key get."""

        def __init__(self):
            self._call_count = 0

        async def get(self, key):
            self._call_count += 1
            if self._call_count == 1:
                # first get = version_key — return instantly
                return b"0"
            # second get = cache_key — slow
            await asyncio.sleep(2.0)

    from app.tools import kb_search

    with pytest.raises(OperationTimeout) as exc_info:
        await kb_search(
            "query",
            "topic",
            "owner",
            embedder=_FakeEmbedder(),
            store=_FakeStore(),
            redis=_FastVersionRedis(),
        )
    assert exc_info.value.op == "kb_search.cache_get"


# ---------------------------------------------------------------------------
# kb_search: line 152 (cache_set) — fast version+cache_get, no cache hit,
# hybrid_search returns [], then set is called
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_kb_search_cache_set_respects_timeout(monkeypatch):
    monkeypatch.setenv("REDIS_OP_TIMEOUT_SECONDS", "0.05")
    timeouts.reset_for_test()

    class _CacheSetSlowRedis:
        """Fast on get (cache miss), slow on set."""

        async def get(self, key):
            return None  # cache always misses

        async def set(self, key, value, ex=None):
            await asyncio.sleep(2.0)

        async def sismember(self, key, member):
            return False

        async def sadd(self, key, member):
            pass

        async def expire(self, key, seconds):
            pass

        async def incr(self, key):
            return 1

    # Stub hybrid_search so it returns instantly
    monkeypatch.setattr("app.tools.hybrid_search", lambda *a, **kw: _empty_coro())

    async def _empty_coro():
        return []

    from app.tools import kb_search

    with pytest.raises(OperationTimeout) as exc_info:
        await kb_search(
            "query",
            "topic",
            "owner",
            embedder=_FakeEmbedder(),
            store=_FakeStore(),
            redis=_CacheSetSlowRedis(),
        )
    assert exc_info.value.op == "kb_search.cache_set"


# ---------------------------------------------------------------------------
# _ingest_one: line 183 (dedup_check via sismember)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ingest_dedup_check_respects_timeout(monkeypatch):
    monkeypatch.setenv("REDIS_OP_TIMEOUT_SECONDS", "0.05")
    timeouts.reset_for_test()
    from app.tools import _ingest_one

    with pytest.raises(OperationTimeout) as exc_info:
        await _ingest_one(
            "owner",
            {"topic": "t", "url": "http://x"},
            fetcher=_FakeFetcher("some chunk text here"),
            embedder=_FakeEmbedder(),
            store=_FakeStore(),
            redis=_SlowRedis(),
        )
    assert exc_info.value.op == "ingest.dedup_check"


# ---------------------------------------------------------------------------
# _ingest_one: lines 203 (dedup_add), 204 (dedup_expire), 207 (version_bump)
# These are hit after dedup passes (cache miss) and embed+upsert succeed.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ingest_dedup_add_respects_timeout(monkeypatch):
    monkeypatch.setenv("REDIS_OP_TIMEOUT_SECONDS", "0.05")
    timeouts.reset_for_test()

    class _DedupePassRedis(_SlowRedis):
        """Fast on sismember (dedup passes), slow on sadd."""

        async def sismember(self, key, member):
            return False  # always not seen → proceeds past dedup check

        async def sadd(self, key, member):
            await asyncio.sleep(2.0)

    from app.tools import _ingest_one

    with pytest.raises(OperationTimeout) as exc_info:
        await _ingest_one(
            "owner",
            {"topic": "t", "url": "http://x"},
            fetcher=_FakeFetcher("some chunk text here"),
            embedder=_FakeEmbedder(),
            store=_FakeStore(),
            redis=_DedupePassRedis(),
        )
    assert exc_info.value.op == "ingest.dedup_add"


@pytest.mark.asyncio
async def test_ingest_dedup_expire_respects_timeout(monkeypatch):
    monkeypatch.setenv("REDIS_OP_TIMEOUT_SECONDS", "0.05")
    timeouts.reset_for_test()

    class _DedupeExpireSlowRedis(_SlowRedis):
        """Fast through sadd, slow on expire."""

        async def sismember(self, key, member):
            return False

        async def sadd(self, key, member):
            pass  # fast

        async def expire(self, key, seconds):
            await asyncio.sleep(2.0)

    from app.tools import _ingest_one

    with pytest.raises(OperationTimeout) as exc_info:
        await _ingest_one(
            "owner",
            {"topic": "t", "url": "http://x"},
            fetcher=_FakeFetcher("some chunk text here"),
            embedder=_FakeEmbedder(),
            store=_FakeStore(),
            redis=_DedupeExpireSlowRedis(),
        )
    assert exc_info.value.op == "ingest.dedup_expire"


@pytest.mark.asyncio
async def test_ingest_version_bump_respects_timeout(monkeypatch):
    monkeypatch.setenv("REDIS_OP_TIMEOUT_SECONDS", "0.05")
    timeouts.reset_for_test()

    class _VersionBumpSlowRedis(_SlowRedis):
        """Fast through sadd+expire, slow on incr."""

        async def sismember(self, key, member):
            return False

        async def sadd(self, key, member):
            pass

        async def expire(self, key, seconds):
            pass

        async def incr(self, key):
            await asyncio.sleep(2.0)

    from app.tools import _ingest_one

    with pytest.raises(OperationTimeout) as exc_info:
        await _ingest_one(
            "owner",
            {"topic": "t", "url": "http://x"},
            fetcher=_FakeFetcher("some chunk text here"),
            embedder=_FakeEmbedder(),
            store=_FakeStore(),
            redis=_VersionBumpSlowRedis(),
        )
    assert exc_info.value.op == "ingest.version_bump"
