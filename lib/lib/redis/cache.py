import json
from typing import Any

from redis.asyncio import Redis

from lib.logging import get_logger
from lib.resilience import with_timeout

log = get_logger(component="redis.cache")

_DEFAULT_TIMEOUT_S = 5.0


class Cache:
    """JSON value cache over Redis with a key namespace and TTL.

    Exact-match caching (sub-ms). Semantic caching is added in Phase 2 on top of
    the same Redis client.

    Every Redis call is wrapped with `with_timeout` so a blocked Redis never stalls
    the request path indefinitely.
    """

    def __init__(
        self,
        redis: Redis,
        namespace: str = "cache",
        timeout_s: float = _DEFAULT_TIMEOUT_S,
    ) -> None:
        self._r = redis
        self._ns = namespace
        self._timeout_s = timeout_s

    def _key(self, key: str) -> str:
        return f"{self._ns}:{key}"

    async def get(self, key: str) -> Any | None:
        raw = await with_timeout(
            self._r.get(self._key(key)), self._timeout_s, op="cache.get"
        )
        return json.loads(raw) if raw is not None else None

    async def set(self, key: str, value: Any, ttl_seconds: int = 600) -> None:
        log.debug("cache.set key={} ttl_s={}", key, ttl_seconds)
        await with_timeout(
            self._r.set(self._key(key), json.dumps(value), ex=ttl_seconds),
            self._timeout_s,
            op="cache.set",
        )

    async def delete(self, key: str) -> None:
        await with_timeout(
            self._r.delete(self._key(key)), self._timeout_s, op="cache.delete"
        )
