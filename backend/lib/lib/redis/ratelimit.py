from dataclasses import dataclass

from redis.asyncio import Redis

from lib.logging import get_logger
from lib.resilience import with_timeout

log = get_logger(component="redis.ratelimit")

_DEFAULT_TIMEOUT_S = 5.0


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    retry_after: int  # seconds until the window resets; 0 when allowed


# INCR + EXPIRE + read TTL in ONE atomic server-side step. A plain INCR-then-EXPIRE has
# a window where a crash leaves a TTL-less key; the Lua removes it and saves 2 trips
# (this runs on every login/register). EXPIRE on every hit keeps it self-healing — the
# window slides from the latest hit.
_HIT_LUA = """
local c = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1])
return {c, redis.call('TTL', KEYS[1])}
"""


class RateLimiter:
    """Fixed-window rate limiter over Redis: counts hits per key within a window and
    blocks once the count exceeds `limit`. Powers login/register/forgot limits and the
    failed-login lockout.

    Every Redis call is wrapped with `with_timeout` to bound latency.
    """

    def __init__(
        self,
        redis: Redis,
        namespace: str = "rl",
        timeout_s: float = _DEFAULT_TIMEOUT_S,
    ) -> None:
        self._r = redis
        self._ns = namespace
        self._timeout_s = timeout_s

    def _result(self, count: int, limit: int, ttl: int) -> RateLimitResult:
        if count <= limit:
            return RateLimitResult(allowed=True, retry_after=0)
        return RateLimitResult(allowed=False, retry_after=max(ttl, 0))

    async def hit(self, key: str, limit: int, window_seconds: int) -> RateLimitResult:
        redis_key = f"{self._ns}:{key}"
        count, ttl = await with_timeout(
            self._r.eval(_HIT_LUA, 1, redis_key, window_seconds),
            self._timeout_s,
            op="ratelimit.hit",
        )
        result = self._result(int(count), limit, int(ttl))
        if not result.allowed:
            log.warning("ratelimit.blocked key={} count={} limit={}", key, count, limit)
        return result

    async def peek(self, key: str, limit: int) -> RateLimitResult:
        """Whether `key` is within `limit` right now, WITHOUT counting a hit."""
        redis_key = f"{self._ns}:{key}"
        raw = await with_timeout(
            self._r.get(redis_key), self._timeout_s, op="ratelimit.peek"
        )
        count = int(raw or 0)
        ttl = await with_timeout(
            self._r.ttl(redis_key), self._timeout_s, op="ratelimit.peek.ttl"
        )
        return self._result(count, limit, ttl)

    async def reset(self, key: str) -> None:
        """Clear a key's counter — e.g. after a successful login."""
        await with_timeout(
            self._r.delete(f"{self._ns}:{key}"), self._timeout_s, op="ratelimit.reset"
        )
