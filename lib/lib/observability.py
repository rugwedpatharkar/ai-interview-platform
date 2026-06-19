"""Thin observability wrappers: Prometheus metrics + OpenTelemetry tracing.

Design goals:
  - Importing this module does NOT start servers or require a collector.
  - All helpers are config-gated and lazy — metrics/tracing only activate when
    explicitly enabled via ``init_tracing()`` or ``start_metrics_server()``.
  - The ``span()`` / ``@traced`` helpers are no-ops when tracing is disabled, so
    callers never need ``if tracing_enabled:`` guards.
  - Offline / gate tests: ``InMemorySpanExporter`` is used by default, so no
    OTLP collector is needed.

Usage::

    from lib.observability import (
        counter, histogram, init_tracing, span, start_metrics_server, traced
    )
"""

from __future__ import annotations

from collections.abc import AsyncGenerator, Callable
from contextlib import asynccontextmanager
from functools import wraps
from typing import Any, TypeVar

import prometheus_client as _prom
from opentelemetry import trace as _otel_trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from prometheus_client import CollectorRegistry, Counter, Histogram

# ---------------------------------------------------------------------------
# Prometheus metrics
# ---------------------------------------------------------------------------

# Use a *dedicated* registry (not the default global one) so tests can import
# this module multiple times without duplicate-metric errors.
_registry = CollectorRegistry(auto_describe=True)

# Cache registered metrics by name so callers can call counter()/histogram()
# at module level and get the same object on re-import.
_metrics: dict[str, Any] = {}


def counter(name: str, description: str, labels: list[str] | None = None) -> Counter:
    """Return (or create) a named Prometheus counter in the module registry.

    Safe to call at module-import time; the server is started separately.
    """
    if name not in _metrics:
        _metrics[name] = Counter(
            name,
            description,
            labelnames=labels or [],
            registry=_registry,
        )
    return _metrics[name]


def histogram(
    name: str,
    description: str,
    labels: list[str] | None = None,
    buckets: tuple[float, ...] = (
        5,
        10,
        25,
        50,
        100,
        250,
        500,
        1000,
        2500,
        5000,
        float("inf"),
    ),
) -> Histogram:
    """Return (or create) a named Prometheus histogram in the module registry."""
    if name not in _metrics:
        _metrics[name] = Histogram(
            name,
            description,
            labelnames=labels or [],
            buckets=buckets,
            registry=_registry,
        )
    return _metrics[name]


async def start_metrics_server(port: int) -> None:
    """Start a Prometheus HTTP metrics server on *port* in a background thread.

    This is a no-op if the port is 0 (disabled). Safe to call multiple times.
    """
    if port == 0:
        return
    _prom.start_http_server(port, registry=_registry)


# ---------------------------------------------------------------------------
# OpenTelemetry tracing
# ---------------------------------------------------------------------------

_tracer: _otel_trace.Tracer | None = None
_tracing_enabled = False

T = TypeVar("T")


def init_tracing(
    service: str,
    *,
    enabled: bool = True,
    exporter: Any = None,
) -> None:
    """Configure OpenTelemetry tracing for *service*.

    By default uses a no-op / in-memory exporter so no collector is needed.
    Pass ``enabled=False`` to keep tracing fully dormant (span() becomes a
    no-op context manager that never allocates a span object).

    Args:
        service: Logical service name, set as the OTel ``service.name`` resource.
        enabled: When False, all tracing helpers become no-ops immediately.
        exporter: An OTel SpanExporter to use. Defaults to InMemorySpanExporter
            (useful for tests and local dev). Pass an OTLP exporter in production.
    """
    global _tracer, _tracing_enabled
    _tracing_enabled = enabled
    if not enabled:
        return

    if exporter is None:
        exporter = InMemorySpanExporter()

    provider = TracerProvider(resource=Resource.create({"service.name": service}))
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    _otel_trace.set_tracer_provider(provider)
    _tracer = _otel_trace.get_tracer(service)


@asynccontextmanager
async def span(name: str, **attrs: Any) -> AsyncGenerator[Any, None]:
    """Async context manager that wraps code in an OTel span.

    Is a complete no-op when tracing is disabled — the ``with`` body still runs.

    Args:
        name: Span name.
        **attrs: Arbitrary string/int/float attributes set on the span.
    """
    if not _tracing_enabled or _tracer is None:
        yield None
        return

    with _tracer.start_as_current_span(name) as s:
        for k, v in attrs.items():
            s.set_attribute(k, v)
        yield s


def traced(name: str, **static_attrs: Any) -> Callable[[Callable], Callable]:
    """Decorator that wraps an async function in an OTel span.

    Is a no-op when tracing is disabled.

    Args:
        name: Span name (uses the function's qualified name if empty).
        **static_attrs: Fixed attributes added to every span.
    """

    def decorator(fn: Callable) -> Callable:
        span_name = name or fn.__qualname__

        @wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            async with span(span_name, **static_attrs):
                return await fn(*args, **kwargs)

        return wrapper

    return decorator


def get_registry() -> CollectorRegistry:
    """Return the module-level Prometheus registry (useful for test assertions)."""
    return _registry
