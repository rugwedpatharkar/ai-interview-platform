"""Redis-backed live-interview checkpointer, keyed by application_id.

Holds the in-flight InterviewSession (blueprint + transcript-so-far + pending question)
between turns so the Interviewer agent stays stateless. The TTL bounds abandoned
interviews so half-finished sessions self-expire.
"""

from lib.logging import get_logger
from lib.observability import counter, histogram

from app.model.interview import InterviewSession

log = get_logger(component="gateway.sessions")

# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------
_session_ops_total = counter(
    "session_store_ops_total", "Redis interview session operations", labels=["op"]
)
_session_ops_errors = counter(
    "session_store_ops_errors_total",
    "Redis interview session operation errors",
    labels=["op"],
)
_session_ops_duration = histogram(
    "session_store_ops_duration_ms",
    "Redis interview session operation duration (ms)",
    labels=["op"],
)

# A session must outlive its own time budget by at least one reaper interval, or
# abandon_stale's scan would never see it (key expires first) and the interview would
# strand in_progress forever. The default TTL covers normal budgets; a larger LLM-chosen
# budget extends the TTL to track it.
_REAPER_MARGIN_SECONDS = 1800

# Safety cap for the abandon-stale reaper scan.  A single scheduler tick should
# never stall while scanning a very large key-space; sessions created after the
# cap are picked up on the next sweep.  Log at INFO when the cap fires so
# truncation is always observable in traces.
_MAX_IN_PROGRESS_SCAN = 1000


class RedisInterviewStore:
    def __init__(self, redis, namespace="interview", ttl_seconds=7200):
        self._redis = redis
        self._ns = namespace
        self._ttl = ttl_seconds

    def _key(self, application_id):
        return f"{self._ns}:{application_id}"

    async def save(self, session):
        import time

        _session_ops_total.labels(op="save").inc()
        t0 = time.monotonic()
        try:
            ttl = max(
                self._ttl,
                session.blueprint.time_budget_min * 60 + _REAPER_MARGIN_SECONDS,
            )
            await self._redis.set(
                self._key(session.application_id),
                session.model_dump_json(),
                ex=ttl,
            )
        except Exception:
            _session_ops_errors.labels(op="save").inc()
            _session_ops_duration.labels(op="save").observe(
                (time.monotonic() - t0) * 1000
            )
            raise
        _session_ops_duration.labels(op="save").observe((time.monotonic() - t0) * 1000)

    async def get(self, application_id):
        import time

        _session_ops_total.labels(op="get").inc()
        t0 = time.monotonic()
        try:
            raw = await self._redis.get(self._key(application_id))
            result = InterviewSession.model_validate_json(raw) if raw else None
        except Exception:
            _session_ops_errors.labels(op="get").inc()
            _session_ops_duration.labels(op="get").observe(
                (time.monotonic() - t0) * 1000
            )
            raise
        _session_ops_duration.labels(op="get").observe((time.monotonic() - t0) * 1000)
        return result

    async def list_in_progress(self):
        """Scan checkpointed sessions (capped) and return those still in progress.

        Accumulates up to ``_MAX_IN_PROGRESS_SCAN`` keys via non-blocking
        ``scan_iter``, then fetches all values in a single ``mget`` instead of
        one ``get`` per key (eliminates the N+1 serial await).
        Sessions created after the cap are picked up on the next sweep.
        """
        import time

        _session_ops_total.labels(op="list_in_progress").inc()
        t0 = time.monotonic()
        try:
            keys = []
            async for key in self._redis.scan_iter(match=f"{self._ns}:*", count=100):
                if len(keys) >= _MAX_IN_PROGRESS_SCAN:
                    log.info(
                        "list_in_progress: scan cap reached ({} keys), "
                        "remaining sessions deferred to next sweep",
                        _MAX_IN_PROGRESS_SCAN,
                    )
                    break
                keys.append(key)
            if not keys:
                return []
            raws = await self._redis.mget(*keys)
            out = []
            for raw in raws:
                if raw:
                    session = InterviewSession.model_validate_json(raw)
                    if session.status == "in_progress":
                        out.append(session)
        except Exception:
            _session_ops_errors.labels(op="list_in_progress").inc()
            _session_ops_duration.labels(op="list_in_progress").observe(
                (time.monotonic() - t0) * 1000
            )
            raise
        _session_ops_duration.labels(op="list_in_progress").observe(
            (time.monotonic() - t0) * 1000
        )
        return out
