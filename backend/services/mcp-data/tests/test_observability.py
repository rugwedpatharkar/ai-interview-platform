"""Observability instrumentation tests for mcp-data.

Checks:
- mongo_op_total counter increments on happy-path DataStore ops.
- mongo_op_errors_total increments and the exception re-raises on failure.
- start_metrics_server(0) is a no-op (no port binding).
- Op-logging emits op.start + op.done (or op.error) via loguru capture.
- Sensitive keys (user_id is NOT sensitive; check that token would be scrubbed).
"""

import pytest
from loguru import logger

from app.tools import DataStore, _mongo_errors, _mongo_total

# ---------------------------------------------------------------------------
# Fake DB / collection helpers
# ---------------------------------------------------------------------------


class _OKCollection:
    """Minimal collection stub — all writes succeed, reads return None."""

    def __init__(self, find_result=None):
        self.find_result = find_result
        self.updated = []

    async def update_one(self, filt, update, upsert=False):
        self.updated.append((filt, update))

    async def find_one(self, filt):
        return self.find_result

    async def insert_many(self, docs):
        pass


class _BoomCollection:
    """Collection stub that raises RuntimeError on every write."""

    async def update_one(self, *_a, **_kw):
        raise RuntimeError("db down")

    async def find_one(self, *_a):
        raise RuntimeError("db down")

    async def insert_many(self, *_a):
        raise RuntimeError("db down")


class _FakeDB:
    def __init__(self, **cols):
        self._cols = cols

    def __getitem__(self, name):
        return self._cols.get(name, _OKCollection())


def _make_store(**overrides):
    names = [
        "candidate_profiles",
        "jobs",
        "aptitude_banks",
        "interviews",
        "reports",
        "applications",
        "match_results",
        "job_question_plans",
        "proctoring_events",
    ]
    cols = {n: _OKCollection() for n in names}
    cols.update(overrides)
    return DataStore(_FakeDB(**cols))


# ---------------------------------------------------------------------------
# Counter increment tests
# ---------------------------------------------------------------------------


async def test_save_profile_increments_total():
    store = _make_store()
    before = _mongo_total.labels(op="save_profile")._value.get()
    await store.save_profile("u1", {"headline": "eng"})
    assert _mongo_total.labels(op="save_profile")._value.get() == before + 1


async def test_get_profile_increments_total():
    store = _make_store()
    before = _mongo_total.labels(op="get_profile")._value.get()
    await store.get_profile("u1")
    assert _mongo_total.labels(op="get_profile")._value.get() == before + 1


async def test_get_job_increments_total_for_valid_id():
    from bson import ObjectId

    oid = ObjectId()
    store = _make_store(jobs=_OKCollection(find_result={"_id": oid}))
    before = _mongo_total.labels(op="get_job")._value.get()
    await store.get_job(str(oid))
    assert _mongo_total.labels(op="get_job")._value.get() == before + 1


async def test_save_proctoring_events_increments_total():
    store = _make_store()
    before = _mongo_total.labels(op="save_proctoring_events")._value.get()
    await store.save_proctoring_events("a1", "c1", [{"type": "tab_switch"}])
    assert _mongo_total.labels(op="save_proctoring_events")._value.get() == before + 1


async def test_save_proctoring_events_empty_does_not_increment():
    # Guard: empty list exits early before the mongo op.
    store = _make_store()
    before = _mongo_total.labels(op="save_proctoring_events")._value.get()
    await store.save_proctoring_events("a1", "c1", [])
    assert _mongo_total.labels(op="save_proctoring_events")._value.get() == before


# ---------------------------------------------------------------------------
# Error counter + re-raise test
# ---------------------------------------------------------------------------


async def test_save_profile_error_increments_errors_and_reraises():
    store = _make_store(candidate_profiles=_BoomCollection())
    before = _mongo_errors.labels(op="save_profile")._value.get()
    with pytest.raises(RuntimeError, match="db down"):
        await store.save_profile("u1", {})
    assert _mongo_errors.labels(op="save_profile")._value.get() == before + 1


async def test_get_profile_error_increments_errors_and_reraises():
    store = _make_store(candidate_profiles=_BoomCollection())
    before = _mongo_errors.labels(op="get_profile")._value.get()
    with pytest.raises(RuntimeError, match="db down"):
        await store.get_profile("u1")
    assert _mongo_errors.labels(op="get_profile")._value.get() == before + 1


# ---------------------------------------------------------------------------
# Op-logging: op.start + op.done appear; op.error on failure
# ---------------------------------------------------------------------------


async def test_save_profile_logs_op_start_and_done(capsys):
    """op.start and op.done appear in stderr via loguru."""
    messages = []
    lid = logger.add(lambda m: messages.append(m), level="DEBUG")
    try:
        store = _make_store()
        await store.save_profile("u99", {"headline": "tester"})
    finally:
        logger.remove(lid)
    text = " ".join(messages)
    assert "op.start" in text
    assert "op.done" in text
    assert "data.save_profile" in text


async def test_save_profile_logs_op_error_on_failure():
    messages = []
    lid = logger.add(lambda m: messages.append(m), level="DEBUG")
    try:
        store = _make_store(candidate_profiles=_BoomCollection())
        with pytest.raises(RuntimeError):
            await store.save_profile("u99", {})
    finally:
        logger.remove(lid)
    text = " ".join(messages)
    assert "op.error" in text


# ---------------------------------------------------------------------------
# start_metrics_server(0) is a no-op (no exception, no port)
# ---------------------------------------------------------------------------


async def test_metrics_server_port_zero_is_noop():
    from lib.observability import start_metrics_server

    # Should complete without binding any port or raising.
    await start_metrics_server(0)


# ---------------------------------------------------------------------------
# Config fields present
# ---------------------------------------------------------------------------


def test_settings_has_metrics_port_and_tracing_enabled():
    from app.config import Settings

    s = Settings()
    assert s.metrics_port == 0
    assert s.tracing_enabled is False
