"""Focused tests for Phase 5 observability instrumentation.

Checks:
  1. A representative event handler emits op.start + op.done log entries (captured
     via loguru sink, since loguru doesn't integrate with caplog).
  2. A forced error path increments the *_errors_total counter AND re-raises.
  3. The mcp_data gateway increments mcp_data_call_total on each tool call.
  4. start_metrics_server(0) is a no-op (no server, no exception).
  5. Config fields metrics_port and tracing_enabled exist with correct defaults.
"""

import pytest
from lib.observability import get_registry, start_metrics_server

from app.config import Settings
from app.model.profile import CandidateProfile
from app.resources import handlers

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _sample_value(metric_name: str, label_filter: dict | None = None) -> float:
    """Read a sample value from the lib observability registry.

    metric_name: the family name as declared in counter()/histogram() — without
    the prometheus-appended _total suffix.
    """
    for metric in get_registry().collect():
        if metric.name == metric_name:
            for sample in metric.samples:
                if label_filter is None:
                    return sample.value
                if all(sample.labels.get(k) == v for k, v in label_filter.items()):
                    return sample.value
    return 0.0


# ---------------------------------------------------------------------------
# 1. Handler emits op.start + op.done (captured via loguru sink)
# ---------------------------------------------------------------------------


async def test_handle_profile_parse_logs_op_start_and_done(
    fake_llm, fake_capability, fake_data, fake_publisher
):
    """Handler must emit op.start + op.done log lines via log_context."""
    from loguru import logger

    messages: list[str] = []

    def _sink(msg):
        messages.append(msg)

    sink_id = logger.add(_sink, format="{message}")
    try:
        profile = CandidateProfile(headline="Engineer", skills=["python"])
        await handlers.handle_profile_parse(
            {"user_id": "u1", "resume_key": "resumes/u1.pdf"},
            llm=fake_llm(profile),
            data=fake_data(),
            capability=fake_capability("resume text"),
            publisher=fake_publisher(),
        )
    finally:
        logger.remove(sink_id)

    combined = " ".join(messages)
    assert "op.start" in combined, f"expected op.start in log output; got: {combined!r}"
    assert "op.done" in combined, f"expected op.done in log output; got: {combined!r}"


# ---------------------------------------------------------------------------
# 2. Error path: counter incremented AND exception re-raised
# ---------------------------------------------------------------------------


async def test_handle_match_run_error_increments_error_counter(
    fake_capability, fake_publisher
):
    """A handler error must increment the errors_total counter and still re-raise."""
    from app.resources.handlers import _event_errors  # the module-level counter object

    class _BrokenData:
        async def get_match_results(self, **_):
            return []

        async def get_job(self, job_id):
            raise RuntimeError("db down")

        async def get_profile(self, user_id):  # pragma: no cover
            return None

    before = _event_errors.labels(event="match.run")._value.get()
    with pytest.raises(RuntimeError, match="db down"):
        await handlers.handle_match_run(
            {"comp_id": "c1", "job_id": "j1", "candidate_user_id": "u1"},
            llm=None,
            data=_BrokenData(),
            capability=fake_capability(),
            publisher=fake_publisher(),
        )

    after = _event_errors.labels(event="match.run")._value.get()
    assert after > before, "error counter must have incremented"


# ---------------------------------------------------------------------------
# 3. mcp_data gateway increments call counter
# ---------------------------------------------------------------------------


async def test_mcp_data_gateway_increments_call_counter():
    """Each McpDataGateway call must tick the mcp_data_call_total counter."""
    from app.infra.mcp_data import McpDataGateway, _mcp_data_total

    class _FakeSession:
        async def call_tool(self, name, args):
            class _Content:
                type = "text"
                text = "null"

            class _Resp:
                def __init__(self):
                    self.content = [_Content()]

            return _Resp()

    gw = McpDataGateway(_FakeSession())
    before = _mcp_data_total.labels(tool="get_job")._value.get()
    await gw.get_job("j1")
    after = _mcp_data_total.labels(tool="get_job")._value.get()
    assert after > before, "mcp_data call counter must have incremented"


# ---------------------------------------------------------------------------
# 4. start_metrics_server(0) is a no-op
# ---------------------------------------------------------------------------


async def test_start_metrics_server_zero_is_noop():
    """Port 0 must return without starting any server (no exception either)."""
    await start_metrics_server(0)  # must not raise


# ---------------------------------------------------------------------------
# 5. Config fields exist with correct defaults
# ---------------------------------------------------------------------------


def test_config_has_metrics_and_tracing_defaults():
    """New config fields must exist and default to off (safe for offline tests)."""
    s = Settings(
        gemini_api_key="x",
        jwt_secret="x" * 32,
        rabbitmq_url="amqp://localhost/",
        redis_url="redis://localhost",
    )
    assert s.metrics_port == 0
    assert s.tracing_enabled is False
