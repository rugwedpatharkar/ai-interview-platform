import pytest
from lib.security import RefreshSessionStore, SingleUseTokenStore


class FakeRedis:
    """Async stand-in for redis.asyncio.Redis (the ops RefreshSessionStore uses)."""

    def __init__(self):
        self.kv: dict[str, str] = {}
        self.sets: dict[str, set] = {}
        self.eval_count = 0

    async def set(self, key, value, ex=None):
        self.kv[key] = value

    async def get(self, key):
        return self.kv.get(key)

    async def delete(self, key):
        existed = key in self.kv or key in self.sets
        self.kv.pop(key, None)
        self.sets.pop(key, None)
        return 1 if existed else 0

    async def exists(self, key):
        return 1 if key in self.kv else 0

    async def sadd(self, key, *members):
        self.sets.setdefault(key, set()).update(members)

    async def smembers(self, key):
        return set(self.sets.get(key, set()))

    async def srem(self, key, *members):
        self.sets.get(key, set()).difference_update(members)

    async def expire(self, key, seconds):
        pass

    async def eval(self, script, numkeys, *keys_and_args):
        # Model Redis's atomic EVAL for the one script we run (revoke_user): read the
        # user's jti set, delete each derived jti key, then drop the set — all at once.
        self.eval_count += 1
        keys, args = keys_and_args[:numkeys], keys_and_args[numkeys:]
        user_key, prefix = keys[0], args[0]
        members = self.sets.get(user_key, set())
        for jti in members:
            self.kv.pop(prefix + jti, None)
        self.sets.pop(user_key, None)
        return len(members)


@pytest.mark.asyncio
async def test_allow_then_active():
    store = RefreshSessionStore(FakeRedis())
    await store.allow("u1", "jti1", 100)
    assert await store.is_active("jti1") is True
    assert await store.is_active("nope") is False


@pytest.mark.asyncio
async def test_revoke_single():
    store = RefreshSessionStore(FakeRedis())
    await store.allow("u1", "jti1", 100)
    await store.revoke("jti1")
    assert await store.is_active("jti1") is False


@pytest.mark.asyncio
async def test_revoke_user_kills_family():
    store = RefreshSessionStore(FakeRedis())
    await store.allow("u1", "jti1", 100)
    await store.allow("u1", "jti2", 100)
    await store.revoke_user("u1")
    assert await store.is_active("jti1") is False
    assert await store.is_active("jti2") is False


@pytest.mark.asyncio
async def test_revoke_user_is_atomic_single_eval():
    # revoke-all must be airtight: read+delete happens as ONE server-side op (Lua), so a
    # concurrent allow() can't slip a jti in after the read and leave it orphaned.
    r = FakeRedis()
    store = RefreshSessionStore(r)
    await store.allow("u1", "jti1", 100)
    await store.allow("u1", "jti2", 100)
    await store.revoke_user("u1")
    assert r.eval_count == 1  # one atomic Lua call, not a racy read-then-delete loop
    assert await store.is_active("jti1") is False
    assert await store.is_active("jti2") is False
    assert await r.smembers("refresh:user:u1") == set()


@pytest.mark.asyncio
async def test_single_use_token_consumed_once():
    store = SingleUseTokenStore(FakeRedis())
    await store.allow("nonce1", 100)
    assert await store.consume("nonce1") is True  # first use succeeds
    assert await store.consume("nonce1") is False  # replay rejected
    assert await store.consume("never-issued") is False
