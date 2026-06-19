from app.infra.sessions import RedisInterviewStore
from app.model.interview import InterviewSession


class _FakeRedis:
    def __init__(self):
        self.store = {}
        self.last_ex = None

    async def set(self, key, value, ex=None):
        self.store[key] = value
        self.last_ex = ex

    async def get(self, key):
        return self.store.get(key)


async def test_save_and_get_round_trip():
    store = RedisInterviewStore(_FakeRedis())
    session = InterviewSession(application_id="a1", comp_id="c1", current_question="Q1")
    await store.save(session)
    loaded = await store.get("a1")
    assert loaded.current_question == "Q1"
    assert loaded.comp_id == "c1"


async def test_get_missing_returns_none():
    store = RedisInterviewStore(_FakeRedis())
    assert await store.get("nope") is None


async def test_ttl_uses_default_for_a_normal_budget():
    redis = _FakeRedis()
    store = RedisInterviewStore(redis, ttl_seconds=7200)
    # default blueprint = 30-min budget, well within the default TTL window
    await store.save(InterviewSession(application_id="a1", comp_id="c1"))
    assert redis.last_ex == 7200


async def test_ttl_outlives_a_large_time_budget():
    # A budget longer than the default TTL window must extend the key's TTL, or the
    # session would expire out of Redis before abandon_stale's scan finalizes it —
    # stranding the interview in_progress forever.
    redis = _FakeRedis()
    store = RedisInterviewStore(redis, ttl_seconds=7200)
    session = InterviewSession(application_id="a1", comp_id="c1")
    session.blueprint.time_budget_min = 200  # 12000s > 7200s default TTL
    await store.save(session)
    assert redis.last_ex >= 200 * 60
