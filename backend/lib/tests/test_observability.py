"""Tests for lib.observability — Prometheus metrics + OTel tracing no-op path."""

import pytest

# ---------------------------------------------------------------------------
# Prometheus
# ---------------------------------------------------------------------------


def test_counter_increments():
    """A named counter increments when .inc() is called."""
    from lib.observability import counter, get_registry

    c = counter("test_req_total_v1", "Test requests", ["method"])
    c.labels(method="GET").inc()
    c.labels(method="GET").inc()

    # Prometheus counters are exposed with the _total suffix in the registry.
    registry = get_registry()
    val = registry.get_sample_value("test_req_total_v1_total", {"method": "GET"})
    assert val == 2.0


def test_histogram_observe():
    """A histogram records observations without raising."""
    from lib.observability import histogram

    h = histogram("test_latency_ms_v1", "Test latency")
    h.observe(42.0)
    h.observe(100.0)


def test_counter_same_name_returns_same_object():
    """Calling counter() twice with the same name returns the same metric."""
    from lib.observability import counter

    c1 = counter("test_idempotent_counter_v1", "idempotent")
    c2 = counter("test_idempotent_counter_v1", "idempotent")
    assert c1 is c2


# ---------------------------------------------------------------------------
# OTel tracing — no-op path (no collector needed)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_span_is_noop_when_tracing_disabled():
    """span() is a no-op when tracing has not been initialised."""
    # A fresh import before init_tracing is called

    import lib.observability as obs

    # Force disabled state
    obs._tracing_enabled = False
    obs._tracer = None

    result = []
    async with obs.span("noop_span", key="val") as s:
        result.append(s)  # should be None (no-op)

    assert result[0] is None  # no span object


@pytest.mark.asyncio
async def test_span_runs_with_console_exporter():
    """span() executes without a real collector when init_tracing uses the default."""
    import lib.observability as obs
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
        InMemorySpanExporter,
    )

    exporter = InMemorySpanExporter()
    # Build a provider directly without going through init_tracing (avoids the
    # OTel global-provider override warning in tests).
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor

    provider = TracerProvider(resource=Resource.create({"service.name": "test-span"}))
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    obs._tracer = provider.get_tracer("test-span")
    obs._tracing_enabled = True

    async with obs.span("test_span", operation="verify") as s:
        assert s is not None

    spans = exporter.get_finished_spans()
    assert len(spans) >= 1
    assert spans[-1].name == "test_span"
    obs._tracing_enabled = False
    obs._tracer = None


@pytest.mark.asyncio
async def test_traced_decorator_noop_when_disabled():
    """@traced is a no-op when tracing is disabled — function still runs."""
    import lib.observability as obs

    obs._tracing_enabled = False
    obs._tracer = None

    @obs.traced("noop_traced")
    async def my_fn():
        return "hello"

    result = await my_fn()
    assert result == "hello"


@pytest.mark.asyncio
async def test_traced_decorator_records_span():
    """@traced records a span when tracing is enabled."""
    import lib.observability as obs
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
        InMemorySpanExporter,
    )

    exporter = InMemorySpanExporter()
    provider = TracerProvider(resource=Resource.create({"service.name": "test-traced"}))
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    obs._tracer = provider.get_tracer("test-traced")
    obs._tracing_enabled = True

    @obs.traced("traced_fn_op")
    async def traced_fn():
        return "traced"

    result = await traced_fn()
    assert result == "traced"

    spans = exporter.get_finished_spans()
    assert any(s.name == "traced_fn_op" for s in spans)

    obs._tracing_enabled = False
    obs._tracer = None


def test_start_metrics_server_port_zero_is_noop():
    """Port=0 disables the server without raising."""
    import asyncio

    from lib.observability import start_metrics_server

    asyncio.run(start_metrics_server(0))  # must not raise
