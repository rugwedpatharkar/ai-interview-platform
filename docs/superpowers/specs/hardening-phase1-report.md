# Hardening Phase 1 — Report

## Gate result
`bash scripts/check.sh` GREEN — 531 tests pass (83 lib, 204 admin, 189 ai-agents, 24 mcp-data, 31 mcp-capability). Baseline was 495; +36 new tests added in this phase.

## Files changed / created

| File | Action |
|---|---|
| `lib/lib/logging.py` | Extended — correlation_id contextvar, `_redact_extra` patcher injection, `log_operation` decorator, `log_context` async CM, `new_correlation_id`, `set_correlation_id`, `bind_ids` |
| `lib/lib/resilience.py` | New — `OperationTimeout`, `with_timeout`, `retry` |
| `lib/lib/observability.py` | New — `counter`, `histogram`, `start_metrics_server`, `init_tracing`, `span`, `traced`, `get_registry` |
| `lib/lib/rabbitmq/publisher.py` | Hardened — BE-#12 exchange re-acquire on publish error; structured logs |
| `lib/lib/mongodb/repository.py` | Hardened — `with_timeout` + `log_context` on every external call |
| `lib/lib/redis/cache.py` | Hardened — `with_timeout` on every Redis call; `timeout_s` param |
| `lib/lib/redis/ratelimit.py` | Hardened — `with_timeout` on every Redis call; warn on blocked |
| `lib/lib/storage/client.py` | Hardened — `StorageError` typed error; `presigned_get_url` catches `ClientError`/`BotoCoreError` |
| `lib/lib/storage/__init__.py` | Export `StorageError` |
| `lib/lib/security/tokens.py` | Hardened — boundary logs on verify failure (never logs token value) |
| `lib/lib/security/sessions.py` | Hardened — `with_timeout` on every Redis call; error logs on allow/revoke failure |
| `lib/pyproject.toml` | Added `prometheus-client>=0.25`, `opentelemetry-api>=1.42`, `opentelemetry-sdk>=1.42`, `opentelemetry-exporter-otlp-proto-grpc>=1.42` |
| `lib/tests/test_logging.py` | Extended — 9 new tests |
| `lib/tests/test_resilience.py` | New — 10 tests |
| `lib/tests/test_observability.py` | New — 8 tests |
| `lib/tests/test_publisher.py` | Extended — BE-#12 test + 2 additional |
| `lib/tests/test_storage.py` | Extended — `StorageError` test |

## Dependency versions + pip-audit
| Package | Version |
|---|---|
| prometheus-client | 0.25.0 |
| opentelemetry-api | 1.42.1 |
| opentelemetry-sdk | 1.42.1 |
| opentelemetry-exporter-otlp-proto-grpc | 1.42.1 |

`pip-audit`: **No known vulnerabilities found.**

## Public API (exact signatures — later phases depend on these names)

### `lib.logging`
```python
# Contextvar + helpers
_correlation_id: ContextVar[str | None]
def new_correlation_id() -> str
def set_correlation_id(value: str) -> None
def bind_ids(**ids: Any) -> dict[str, Any]

# Existing (unchanged contract)
def configure_logging(service_name: str, level: str = "INFO") -> None
def get_logger(**context) -> BoundLogger

# New
def log_operation(log, name: str, **ctx) -> Callable  # decorator factory, sync+async
async def log_context(log, name: str, **ctx) -> AsyncContextManager[None]  # async CM
```

### `lib.resilience`
```python
class OperationTimeout(Exception):
    op: str
    seconds: float

async def with_timeout[T](coro: Awaitable[T], seconds: float, *, op: str) -> T

def retry(
    *,
    attempts: int = 3,
    base_delay: float = 0.5,
    retry_on: tuple[type[Exception], ...] = (Exception,),
) -> Callable[[AsyncCallable], AsyncCallable]  # decorator factory
```

### `lib.observability`
```python
def counter(name: str, description: str, labels: list[str] | None = None) -> Counter
def histogram(
    name: str,
    description: str,
    labels: list[str] | None = None,
    buckets: tuple[float, ...] = DEFAULT_BUCKETS,
) -> Histogram
async def start_metrics_server(port: int) -> None
def init_tracing(service: str, *, enabled: bool = True, exporter: Any = None) -> None
async def span(name: str, **attrs: Any) -> AsyncContextManager[Any]  # no-op when disabled
def traced(name: str, **static_attrs: Any) -> Callable  # decorator, no-op when disabled
def get_registry() -> CollectorRegistry  # for tests
```

### `lib.storage.client`
```python
class StorageError(Exception):
    op: str
```

## Test names + counts

### test_logging.py (11 tests)
- test_redact_scrubs_sensitive_keys
- test_redact_preserves_non_sensitive
- test_log_operation_emits_entry_exit
- test_log_operation_emits_exception_on_failure
- test_log_operation_binds_context
- test_log_operation_sync_fn
- test_log_context_emits_entry_exit_duration
- test_log_context_emits_exception_reraises
- test_correlation_id_appears_in_log_line
- test_bind_ids_includes_correlation_id
- test_bind_ids_omits_correlation_id_when_unset

### test_resilience.py (10 tests)
- test_with_timeout_completes_fast
- test_with_timeout_raises_operation_timeout_on_slow_coro
- test_with_timeout_does_not_swallow_other_exceptions
- test_operation_timeout_is_not_a_builtin_timeout_error
- test_retry_succeeds_on_first_attempt
- test_retry_retries_up_to_cap_then_raises
- test_retry_succeeds_after_transient_failure
- test_retry_does_not_retry_unmatched_exceptions
- test_retry_honors_attempt_count
- test_retry_raises_on_invalid_attempts

### test_observability.py (8 tests)
- test_counter_increments
- test_histogram_observe
- test_counter_same_name_returns_same_object
- test_span_is_noop_when_tracing_disabled
- test_span_runs_with_console_exporter
- test_traced_decorator_noop_when_disabled
- test_traced_decorator_records_span
- test_start_metrics_server_port_zero_is_noop

### test_publisher.py (extended, 4 tests)
- test_publish_is_mandatory_to_surface_lost_events (pre-existing)
- test_publisher_reacquires_exchange_after_publish_error (BE-#12)
- test_publisher_raises_when_connect_not_called
- test_publisher_logs_on_send

### test_storage.py (extended, 9 tests)
- all pre-existing + test_presigned_get_url_raises_storage_error_on_s3_failure

## Concerns / deferred
- `sessions.py` uses `.eval()` (Lua) directly; with_timeout wraps the call but a hung Lua script would need server-side timeout setting. No change needed for now.
- OTel global TracerProvider can only be set once per process. In tests, we bypass `init_tracing` and set `_tracer` directly. Services should call `init_tracing` once at startup.
- `start_metrics_server` starts a thread; calling it twice binds two ports. The gate-green `port=0` path is a no-op; services should guard with a flag if needed.

---

## Phase 1 fix pass (2026-06-19)

Gate result: `bash scripts/check.sh` GREEN — 84 lib tests (+1 from prior run), 204 admin, 189 ai-agents, 24 mcp-data, 31 mcp-capability. All ruff format + lint checks pass.

### Files changed

| File | Change |
|---|---|
| `lib/lib/resilience.py` | Removed dead `_elapsed_ms` helper and the now-unused `import time` |
| `lib/lib/storage/client.py` | Added `op_timeout_seconds: float = 35.0` constructor param; wrapped `put`, `get`, `get_raw`, `presigned_get_url`, `delete`, `delete_raw` with `with_timeout`; each raises `StorageError` on `ClientError`, `BotoCoreError`, or `OperationTimeout` |
| `lib/lib/logging.py` | `set_correlation_id` now returns `Token` (signature `-> Token`); added `reset_correlation_id(token)` helper; hoisted `import inspect` to module top; imported `Token` from `contextvars` |
| `lib/lib/observability.py` | Fixed module docstring: replaced "console exporter" with "InMemorySpanExporter" to match actual `init_tracing` default |
| `lib/tests/test_logging.py` | Added `test_set_correlation_id_returns_token_and_reset_restores_prior` (asserts Token instance returned + `reset_correlation_id` restores prior value); imported `reset_correlation_id` |

### Public API additions (additive only, no breakage)

```python
# lib.logging
def set_correlation_id(value: str) -> Token   # was -> None
def reset_correlation_id(token: Token) -> None  # new

# lib.storage.client.ObjectStorage.__init__
op_timeout_seconds: float = 35.0  # new constructor param
```
