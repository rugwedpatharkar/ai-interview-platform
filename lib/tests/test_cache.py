import pytest
from lib.redis import Cache


class FakeRedis:
    """Minimal async stand-in for redis.asyncio.Redis (string get/set/delete)."""

    def __init__(self):
        self.store: dict[str, str] = {}

    async def get(self, key):
        return self.store.get(key)

    async def set(self, key, value, ex=None):
        self.store[key] = value

    async def delete(self, key):
        self.store.pop(key, None)


@pytest.mark.asyncio
async def test_cache_set_get_roundtrip_and_namespace():
    fake = FakeRedis()
    cache = Cache(fake, namespace="kb")
    await cache.set("q1", {"hits": [1, 2, 3]}, ttl_seconds=60)
    assert await cache.get("q1") == {"hits": [1, 2, 3]}
    assert "kb:q1" in fake.store  # namespaced key


@pytest.mark.asyncio
async def test_cache_miss_and_delete():
    cache = Cache(FakeRedis())
    assert await cache.get("missing") is None
    await cache.set("k", "v")
    await cache.delete("k")
    assert await cache.get("k") is None
