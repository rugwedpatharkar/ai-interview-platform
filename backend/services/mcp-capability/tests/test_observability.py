"""Instrumentation tests for mcp-capability: op-logging, metrics, no-op safety."""

import pytest
from loguru import logger

from app.seams import FakeEmbedder, FakeFetcher, FakeVectorStore
from app.tools import embed, ingest, kb_search, parse_document

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class _FakeStorage:
    def __init__(self, data=b"BYTES"):
        self._data = data

    async def get_raw(self, object_key):
        return self._data


class _FakeRedis:
    def __init__(self):
        self.kv = {}
        self.sets = {}
        self.expires = {}

    async def get(self, key):
        return self.kv.get(key)

    async def set(self, key, value, ex=None):
        self.kv[key] = value

    async def sismember(self, key, member):
        return member in self.sets.get(key, set())

    async def sadd(self, key, member):
        self.sets.setdefault(key, set()).add(member)

    async def incr(self, key):
        self.kv[key] = int(self.kv.get(key, 0)) + 1
        return self.kv[key]

    async def expire(self, key, seconds):
        self.expires[key] = seconds


_PAGE = "Python coroutines use async def. Generators yield values lazily."


def _capture_logs():
    """Return (messages_list, sink_id); remove sink with logger.remove(sid) after."""
    captured = []
    sink_id = logger.add(captured.append, format="{message}", level="DEBUG")
    return captured, sink_id


# ---------------------------------------------------------------------------
# Op-logging — representative tool logs op.start + op.done
# ---------------------------------------------------------------------------


async def test_embed_logs_op_start_and_done():
    """embed() emits op.start and op.done lifecycle messages."""
    captured, sid = _capture_logs()
    try:
        await embed(["hello", "world"], embedder=FakeEmbedder())
    finally:
        logger.remove(sid)

    messages = " ".join(captured)
    assert "op.start" in messages
    assert "op.done" in messages
    assert "capability.embed" in messages


async def test_kb_search_logs_op_lifecycle():
    """kb_search() emits op.start and op.done."""
    redis = _FakeRedis()
    store = FakeVectorStore()
    fetcher = FakeFetcher({"http://py": _PAGE})
    await ingest(
        "t1",
        [{"topic": "python", "url": "http://py"}],
        fetcher=fetcher,
        embedder=FakeEmbedder(),
        store=store,
        redis=redis,
    )
    captured, sid = _capture_logs()
    try:
        await kb_search(
            "coroutines",
            "python",
            "t1",
            embedder=FakeEmbedder(),
            store=store,
            redis=redis,
        )
    finally:
        logger.remove(sid)

    messages = " ".join(captured)
    assert "capability.kb_search" in messages
    assert "op.start" in messages
    assert "op.done" in messages


async def test_parse_document_logs_op_lifecycle(monkeypatch):
    """parse_document() emits op.start / op.done for capability.parse_document."""
    from app import tools

    monkeypatch.setitem(tools._EXTRACTORS, ".pdf", lambda data: "extracted text here")
    storage = _FakeStorage()

    captured, sid = _capture_logs()
    try:
        await parse_document("owner1/doc.pdf", storage=storage, owner="owner1")
    finally:
        logger.remove(sid)

    messages = " ".join(captured)
    assert "capability.parse_document" in messages
    assert "op.start" in messages
    assert "op.done" in messages


async def test_ingest_logs_op_lifecycle():
    """ingest() emits op.start and op.done for capability.ingest."""
    redis = _FakeRedis()
    captured, sid = _capture_logs()
    try:
        await ingest(
            "t1",
            [{"topic": "python", "url": "http://py"}],
            fetcher=FakeFetcher({"http://py": _PAGE}),
            embedder=FakeEmbedder(),
            store=FakeVectorStore(),
            redis=redis,
        )
    finally:
        logger.remove(sid)

    messages = " ".join(captured)
    assert "capability.ingest" in messages
    assert "op.start" in messages
    assert "op.done" in messages


# ---------------------------------------------------------------------------
# Metrics — counters increment on successful calls
# ---------------------------------------------------------------------------


async def test_embed_total_counter_increments():
    """Calling embed() increments the capability_embed_total counter."""
    from lib.observability import get_registry

    registry = get_registry()
    before = registry.get_sample_value("capability_embed_total") or 0.0

    await embed(["a", "b"], embedder=FakeEmbedder())

    after = registry.get_sample_value("capability_embed_total") or 0.0
    assert after == before + 1


async def test_kb_search_total_counter_increments():
    """kb_search() increments capability_kb_search_total on each call."""
    from lib.observability import get_registry

    registry = get_registry()
    before = registry.get_sample_value("capability_kb_search_total") or 0.0

    await kb_search(
        "q",
        "python",
        "t1",
        embedder=FakeEmbedder(),
        store=FakeVectorStore(),
        redis=_FakeRedis(),
    )

    after = registry.get_sample_value("capability_kb_search_total") or 0.0
    assert after == before + 1


async def test_ingest_total_counter_increments():
    """ingest() increments capability_ingest_total on each call."""
    from lib.observability import get_registry

    registry = get_registry()
    before = registry.get_sample_value("capability_ingest_total") or 0.0

    await ingest(
        "t1",
        [{"topic": "python", "url": "http://py"}],
        fetcher=FakeFetcher({"http://py": _PAGE}),
        embedder=FakeEmbedder(),
        store=FakeVectorStore(),
        redis=_FakeRedis(),
    )

    after = registry.get_sample_value("capability_ingest_total") or 0.0
    assert after == before + 1


# ---------------------------------------------------------------------------
# Error path — errors_total increments when embed/kb_search raises
# ---------------------------------------------------------------------------


async def test_embed_errors_total_increments_on_failure():
    """embed() increments capability_embed_errors_total when the embedder raises."""
    from lib.observability import get_registry

    registry = get_registry()
    before = registry.get_sample_value("capability_embed_errors_total") or 0.0

    class _BrokenEmbedder:
        async def embed(self, texts):
            raise RuntimeError("embedding service unavailable")

    with pytest.raises(RuntimeError, match="embedding service unavailable"):
        await embed(["x"], embedder=_BrokenEmbedder())

    after = registry.get_sample_value("capability_embed_errors_total") or 0.0
    assert after == before + 1


async def test_kb_search_errors_total_increments_on_failure():
    """kb_search() increments capability_kb_search_errors_total when redis raises."""
    from lib.observability import get_registry

    registry = get_registry()
    before = registry.get_sample_value("capability_kb_search_errors_total") or 0.0

    class _BrokenRedis:
        async def get(self, key):
            raise RuntimeError("redis down")

    with pytest.raises(RuntimeError, match="redis down"):
        await kb_search(
            "q",
            "python",
            "t1",
            embedder=FakeEmbedder(),
            store=FakeVectorStore(),
            redis=_BrokenRedis(),
        )

    after = registry.get_sample_value("capability_kb_search_errors_total") or 0.0
    assert after == before + 1


# ---------------------------------------------------------------------------
# Startup safety — start_metrics_server(0) is a no-op
# ---------------------------------------------------------------------------


async def test_start_metrics_server_port_zero_is_noop():
    """Port 0 disables the server; no exception is raised."""
    from lib.observability import start_metrics_server

    await start_metrics_server(0)  # must not raise or start anything
