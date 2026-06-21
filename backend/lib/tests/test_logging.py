"""Tests for lib.logging — redaction, decorator, context manager, correlation IDs."""

import asyncio

import pytest
from lib.errors import AuthError, NotFoundError
from lib.logging import (
    _redact_extra,
    bind_ids,
    get_logger,
    log_context,
    log_domain_error,
    log_operation,
    new_correlation_id,
    reset_correlation_id,
    set_correlation_id,
)
from loguru import logger

# ---------------------------------------------------------------------------
# Helpers: capture loguru output in tests
# ---------------------------------------------------------------------------


class _Sink:
    """Collect loguru log records in a list for test assertions."""

    def __init__(self):
        self.records: list[dict] = []

    def __call__(self, message):
        self.records.append(message.record)

    def messages(self) -> list[str]:
        return [r["message"] for r in self.records]

    def extras(self) -> list[dict]:
        return [dict(r["extra"]) for r in self.records]


def _with_sink(fn):
    """Run *fn(sink)* with a fresh loguru sink; clean up afterwards."""

    async def _run():
        sink = _Sink()
        sink_id = logger.add(sink, level="DEBUG")
        try:
            await fn(sink)
        finally:
            logger.remove(sink_id)

    return _run


# ---------------------------------------------------------------------------
# Redaction
# ---------------------------------------------------------------------------


def test_redact_scrubs_sensitive_keys():
    record = {
        "extra": {
            "password": "hunter2",
            "authorization": "Bearer x",
            "comp_id": "c1",
        }
    }
    _redact_extra(record)
    assert record["extra"]["password"] == "***"
    assert record["extra"]["authorization"] == "***"
    assert record["extra"]["comp_id"] == "c1"  # non-sensitive context preserved


def test_redact_preserves_non_sensitive():
    record = {"extra": {"comp_id": "c1", "user_id": "u1", "name": "Alice"}}
    _redact_extra(record)
    assert record["extra"]["comp_id"] == "c1"
    assert record["extra"]["user_id"] == "u1"


# ---------------------------------------------------------------------------
# log_operation decorator
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_log_operation_emits_entry_exit():
    await _with_sink(_check_log_operation_emits_entry_exit)()


async def _check_log_operation_emits_entry_exit(sink: _Sink):
    log = get_logger(component="test")

    @log_operation(log, "my_op")
    async def my_fn():
        return 42

    result = await my_fn()
    assert result == 42

    msgs = sink.messages()
    assert any("op.start: my_op" in m for m in msgs)
    assert any("op.done: my_op" in m and "duration_ms" in m for m in msgs)


@pytest.mark.asyncio
async def test_log_operation_emits_exception_on_failure():
    await _with_sink(_check_log_operation_exception)()


async def _check_log_operation_exception(sink: _Sink):
    log = get_logger(component="test")

    @log_operation(log, "failing_op")
    async def boom():
        raise ValueError("oops")

    with pytest.raises(ValueError):
        await boom()

    msgs = sink.messages()
    assert any("op.start: failing_op" in m for m in msgs)
    assert any("op.error: failing_op" in m and "duration_ms" in m for m in msgs)
    # Exception must NOT suppress — it re-raises


@pytest.mark.asyncio
async def test_log_operation_binds_context():
    await _with_sink(_check_log_operation_context)()


async def _check_log_operation_context(sink: _Sink):
    log = get_logger(component="test")

    @log_operation(log, "ctx_op", comp_id="c1", job_id="j1")
    async def op():
        return "ok"

    await op()
    # Context bound via log.bind — check records carry the bound fields
    extras = sink.extras()
    # At least one record should have comp_id from binding
    assert any("c1" in str(e) for e in extras)


@pytest.mark.asyncio
async def test_log_operation_sync_fn():
    """log_operation also works on synchronous functions."""
    await _with_sink(_check_sync)()


async def _check_sync(sink: _Sink):
    log = get_logger(component="test")

    @log_operation(log, "sync_op")
    def sync_fn():
        return "done"

    result = sync_fn()
    assert result == "done"
    msgs = sink.messages()
    assert any("op.start: sync_op" in m for m in msgs)
    assert any("op.done: sync_op" in m for m in msgs)


# ---------------------------------------------------------------------------
# log_context async context manager
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_log_context_emits_entry_exit_duration():
    await _with_sink(_check_log_context)()


async def _check_log_context(sink: _Sink):
    log = get_logger(component="test")

    async with log_context(log, "my_ctx", key="val"):
        await asyncio.sleep(0)

    msgs = sink.messages()
    assert any("op.start: my_ctx" in m for m in msgs)
    assert any("op.done: my_ctx" in m and "duration_ms" in m for m in msgs)


@pytest.mark.asyncio
async def test_log_context_emits_exception_reraises():
    await _with_sink(_check_log_context_exc)()


async def _check_log_context_exc(sink: _Sink):
    log = get_logger(component="test")

    with pytest.raises(RuntimeError, match="ctx-fail"):
        async with log_context(log, "failing_ctx"):
            raise RuntimeError("ctx-fail")

    msgs = sink.messages()
    assert any("op.error: failing_ctx" in m and "duration_ms" in m for m in msgs)


# ---------------------------------------------------------------------------
# Correlation ID
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_correlation_id_appears_in_log_line():
    await _with_sink(_check_correlation_id)()


async def _check_correlation_id(sink: _Sink):
    from lib.logging import _redact_extra
    from loguru import logger as _logger

    # Ensure the patcher is active for this test (configure_logging is idempotent
    # so we apply the patcher directly here to avoid ordering dependencies).
    _logger.configure(patcher=_redact_extra)

    cid = new_correlation_id()
    set_correlation_id(cid)

    log = get_logger(component="test")
    log.info("hello from correlated context")

    extras = sink.extras()
    # The patcher injects correlation_id into every log line when set.
    assert any(e.get("correlation_id") == cid for e in extras)


@pytest.mark.asyncio
async def test_bind_ids_includes_correlation_id():
    cid = new_correlation_id()
    set_correlation_id(cid)
    ids = bind_ids(comp_id="c1", user_id="u1")
    assert ids["comp_id"] == "c1"
    assert ids["user_id"] == "u1"
    assert ids["correlation_id"] == cid


def test_bind_ids_omits_correlation_id_when_unset():
    # Reset to a fresh context-var state (not set in this non-async scope)
    from lib.logging import _correlation_id

    token = _correlation_id.set(None)
    try:
        ids = bind_ids(comp_id="c2")
        assert "correlation_id" not in ids
    finally:
        _correlation_id.reset(token)


def test_set_correlation_id_returns_token_and_reset_restores_prior():
    """set_correlation_id returns a Token; reset restores the prior value."""
    from contextvars import Token

    from lib.logging import _correlation_id

    prior = _correlation_id.get()
    cid = new_correlation_id()
    token = set_correlation_id(cid)

    assert isinstance(token, Token)
    assert _correlation_id.get() == cid

    reset_correlation_id(token)
    assert _correlation_id.get() == prior


# ---------------------------------------------------------------------------
# log_domain_error
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_log_domain_error_logs_at_debug_without_traceback():
    await _with_sink(_check_log_domain_error_debug)()


async def _check_log_domain_error_debug(sink: _Sink):
    log = get_logger(component="test")
    err = NotFoundError("no profile yet", context={"user_id": "u1"})
    log_domain_error(log, err, comp_id="c1")

    msgs = sink.messages()
    assert len(msgs) == 1
    assert "no profile yet" in msgs[0]
    # No exc_info attached — that's the whole point.
    assert sink.records[0]["exception"] is None


@pytest.mark.asyncio
async def test_log_domain_error_binds_context():
    await _with_sink(_check_log_domain_error_context)()


async def _check_log_domain_error_context(sink: _Sink):
    log = get_logger(component="test")
    err = AuthError("token expired")
    log_domain_error(log, err, user_id="u9")
    assert any("token expired" in m for m in sink.messages())
    assert sink.records[0]["extra"].get("user_id") == "u9"


@pytest.mark.asyncio
async def test_log_domain_error_tolerates_non_app_error():
    await _with_sink(_check_log_domain_error_non_app_error)()


async def _check_log_domain_error_non_app_error(sink: _Sink):
    log = get_logger(component="test")
    err = RuntimeError("oops")
    log_domain_error(log, err)
    msgs = sink.messages()
    assert len(msgs) == 1
    assert "oops" in msgs[0]
    assert sink.records[0]["exception"] is None
