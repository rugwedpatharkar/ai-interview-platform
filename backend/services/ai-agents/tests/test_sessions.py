from app.infra.sessions import _MAX_IN_PROGRESS_SCAN, RedisInterviewStore
from app.model.interview import InterviewSession


class _FakeRedis:
    def __init__(self):
        self.store = {}
        self.last_ex = None
        self.mget_calls: list[list] = []

    async def set(self, key, value, ex=None):
        self.store[key] = value
        self.last_ex = ex

    async def get(self, key):
        return self.store.get(key)

    async def mget(self, *keys):
        self.mget_calls.append(list(keys))
        return [self.store.get(k) for k in keys]

    async def scan_iter(self, match=None, count=None):
        # Yield keys in insertion order; ignore count (it's a hint in real Redis).
        prefix = match.rstrip("*") if match and match.endswith("*") else ""
        for key in self.store:
            if key.startswith(prefix):
                yield key


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


async def test_list_in_progress_returns_in_progress_sessions():
    redis = _FakeRedis()
    store = RedisInterviewStore(redis)
    s1 = InterviewSession(application_id="a1", comp_id="c1")
    s2 = InterviewSession(application_id="a2", comp_id="c1")
    s2.status = "completed"
    await store.save(s1)
    await store.save(s2)
    result = await store.list_in_progress()
    assert len(result) == 1
    assert result[0].application_id == "a1"


async def test_list_in_progress_uses_mget_not_per_key_get():
    """list_in_progress must batch-fetch via mget, not issue one get per key (N+1)."""
    redis = _FakeRedis()
    store = RedisInterviewStore(redis)
    s1 = InterviewSession(application_id="a1", comp_id="c1")
    s2 = InterviewSession(application_id="a2", comp_id="c1")
    await store.save(s1)
    await store.save(s2)
    result = await store.list_in_progress()
    assert len(result) == 2
    # Exactly one mget call covering both keys — no per-key get calls.
    assert len(redis.mget_calls) == 1
    assert len(redis.mget_calls[0]) == 2


async def test_list_in_progress_cap_truncates(monkeypatch):
    """With more keys than _MAX_IN_PROGRESS_SCAN, the result is capped."""
    logged = []
    import app.infra.sessions as sessions_mod

    monkeypatch.setattr(
        sessions_mod.log,
        "info",
        lambda msg, *a, **kw: logged.append(msg.format(*a) if a else msg),
    )

    redis = _FakeRedis()
    store = RedisInterviewStore(redis)
    # Insert _MAX_IN_PROGRESS_SCAN + 10 in-progress sessions.
    for i in range(_MAX_IN_PROGRESS_SCAN + 10):
        s = InterviewSession(application_id=f"a{i}", comp_id="c1")
        await store.save(s)
    result = await store.list_in_progress()
    assert len(result) == _MAX_IN_PROGRESS_SCAN
    assert any("scan cap reached" in msg for msg in logged)
