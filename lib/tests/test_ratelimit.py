import pytest
from lib.redis import RateLimiter


class FakeRedis:
    """Async stand-in for redis.asyncio.Redis (the ops RateLimiter uses).

    `incr` and `get` share one key/value map (as real Redis does), so `peek` reads the
    same counter `hit` increments.
    """

    def __init__(self):
        self.kv: dict[str, str] = {}
        self.ttls: dict[str, int] = {}
        self.expire_calls = 0

    async def incr(self, key):
        val = int(self.kv.get(key, 0)) + 1
        self.kv[key] = str(val)
        return val

    async def expire(self, key, seconds):
        self.expire_calls += 1
        self.ttls[key] = seconds

    async def ttl(self, key):
        return self.ttls.get(key, -1)

    async def get(self, key):
        return self.kv.get(key)

    async def delete(self, key):
        self.kv.pop(key, None)
        self.ttls.pop(key, None)


@pytest.mark.asyncio
async def test_within_limit_allowed():
    rl = RateLimiter(FakeRedis())
    for _ in range(5):
        result = await rl.hit("login:ip", 5, 900)
        assert result.allowed is True
        assert result.retry_after == 0


@pytest.mark.asyncio
async def test_over_limit_blocked_with_retry_after():
    rl = RateLimiter(FakeRedis())
    for _ in range(5):
        await rl.hit("login:ip", 5, 900)
    result = await rl.hit("login:ip", 5, 900)  # 6th hit
    assert result.allowed is False
    assert result.retry_after == 900


@pytest.mark.asyncio
async def test_first_hit_sets_window():
    fake = FakeRedis()
    rl = RateLimiter(fake)
    await rl.hit("k", 5, 120)
    assert fake.ttls["rl:k"] == 120


@pytest.mark.asyncio
async def test_ttl_refreshed_on_every_hit():
    # Regression: EXPIRE must run on EVERY hit, not only the first — otherwise a crash
    # between INCR and a first-hit-only EXPIRE leaves a TTL-less key (permanent lock).
    fake = FakeRedis()
    rl = RateLimiter(fake)
    await rl.hit("k", 5, 900)
    await rl.hit("k", 5, 900)
    assert fake.expire_calls == 2


@pytest.mark.asyncio
async def test_peek_does_not_count_and_reset_clears():
    fake = FakeRedis()
    rl = RateLimiter(fake)
    await rl.hit("acct", 2, 900)
    await rl.hit("acct", 2, 900)
    assert (await rl.peek("acct", 2)).allowed is True
    assert fake.kv["rl:acct"] == "2"  # peek did not increment
    await rl.hit("acct", 2, 900)  # 3rd hit -> over limit
    assert (await rl.peek("acct", 2)).allowed is False
    await rl.reset("acct")
    assert (await rl.peek("acct", 2)).allowed is True  # counter cleared
