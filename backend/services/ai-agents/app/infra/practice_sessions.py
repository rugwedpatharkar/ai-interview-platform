"""Redis-backed practice-session checkpointer, keyed by practice_id.

Mirrors RedisInterviewStore for the detached practice surface (namespace ``practice``):
holds the in-flight PracticeSession between turns so the brain stays stateless. The TTL
tracks the blueprint's time budget so an abandoned practice self-expires. No
funnel identifiers are stored — practice is keyed by practice_id / user_id only, and
there is no reaper sweep (no `list_in_progress`).
"""

from lib.resilience import with_timeout

from app.model.practice import PracticeSession
from lib import timeouts

# Outlive the budget by a margin so a paused practice is not evicted mid-run.
_REAPER_MARGIN_SECONDS = 1800


class RedisPracticeStore:
    def __init__(self, redis, namespace="practice", ttl_seconds=7200):
        self._redis = redis
        self._ns = namespace
        self._ttl = ttl_seconds

    def _key(self, practice_id):
        return f"{self._ns}:{practice_id}"

    async def save(self, session):
        ttl = max(
            self._ttl,
            session.blueprint.time_budget_min * 60 + _REAPER_MARGIN_SECONDS,
        )
        await with_timeout(
            self._redis.set(
                self._key(session.practice_id), session.model_dump_json(), ex=ttl
            ),
            timeouts.redis(),
            op="practice_session.save",
        )

    async def get(self, practice_id):
        raw = await with_timeout(
            self._redis.get(self._key(practice_id)),
            timeouts.redis(),
            op="practice_session.get",
        )
        return PracticeSession.model_validate_json(raw) if raw else None
