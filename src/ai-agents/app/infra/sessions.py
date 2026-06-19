"""Redis-backed live-interview checkpointer, keyed by application_id.

Holds the in-flight InterviewSession (blueprint + transcript-so-far + pending question)
between turns so the Interviewer agent stays stateless. The TTL bounds abandoned
interviews so half-finished sessions self-expire.
"""

from lib.logging import get_logger

from app.model.interview import InterviewSession

log = get_logger(component="gateway.sessions")

# A session must outlive its own time budget by at least one reaper interval, or
# abandon_stale's scan would never see it (key expires first) and the interview would
# strand in_progress forever. The default TTL covers normal budgets; a larger LLM-chosen
# budget extends the TTL to track it.
_REAPER_MARGIN_SECONDS = 1800


class RedisInterviewStore:
    def __init__(self, redis, namespace="interview", ttl_seconds=7200):
        self._redis = redis
        self._ns = namespace
        self._ttl = ttl_seconds

    def _key(self, application_id):
        return f"{self._ns}:{application_id}"

    async def save(self, session):
        ttl = max(
            self._ttl,
            session.blueprint.time_budget_min * 60 + _REAPER_MARGIN_SECONDS,
        )
        await self._redis.set(
            self._key(session.application_id),
            session.model_dump_json(),
            ex=ttl,
        )

    async def get(self, application_id):
        raw = await self._redis.get(self._key(application_id))
        return InterviewSession.model_validate_json(raw) if raw else None

    async def list_in_progress(self):
        """Scan all checkpointed sessions and return those still in progress."""
        out = []
        async for key in self._redis.scan_iter(match=f"{self._ns}:*"):
            raw = await self._redis.get(key)
            if raw:
                session = InterviewSession.model_validate_json(raw)
                if session.status == "in_progress":
                    out.append(session)
        return out
