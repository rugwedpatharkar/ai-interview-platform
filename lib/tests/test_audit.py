import pytest
from lib.audit import drain_replay, enqueue_replay, write_audit
from lib.errors import DependencyError


class FakeRepo:
    def __init__(self) -> None:
        self.docs: list[dict] = []
        self.fail = False

    async def insert(self, doc: dict) -> None:
        if self.fail:
            raise RuntimeError("mongo down")
        self.docs.append(doc)


class FakeRedis:
    def __init__(self) -> None:
        self.list: list[bytes] = []
        self.set_keys: set[str] = set()

    async def sadd(self, key, member):
        before = len(self.set_keys)
        self.set_keys.add(f"{key}:{member}")
        return 1 if len(self.set_keys) > before else 0

    async def expire(self, key, seconds):
        return 1

    async def rpush(self, key, value):
        self.list.append(value)
        return len(self.list)

    async def lpop(self, key):
        return self.list.pop(0) if self.list else None

    async def lpush(self, key, value):
        self.list.insert(0, value)
        return len(self.list)


@pytest.mark.asyncio
async def test_write_audit_persists_on_success():
    repo = FakeRepo()
    await write_audit(repo, {"event_id": "e1", "action": "login"})
    assert repo.docs == [{"event_id": "e1", "action": "login"}]


@pytest.mark.asyncio
async def test_write_audit_raises_dependency_error_on_repo_failure():
    repo = FakeRepo()
    repo.fail = True
    with pytest.raises(DependencyError):
        await write_audit(repo, {"event_id": "e1"})


@pytest.mark.asyncio
async def test_enqueue_replay_dedups_by_event_id():
    redis = FakeRedis()
    doc = {"event_id": "e1", "action": "login"}
    await enqueue_replay(redis, doc)
    await enqueue_replay(redis, doc)  # idempotent
    assert len(redis.list) == 1


@pytest.mark.asyncio
async def test_drain_replay_drains_on_success_and_keeps_on_failure():
    redis = FakeRedis()
    repo = FakeRepo()
    await enqueue_replay(redis, {"event_id": "e1"})
    await enqueue_replay(redis, {"event_id": "e2"})

    drained = await drain_replay(repo, redis, batch=10)
    assert drained == 2
    assert len(redis.list) == 0
    assert len(repo.docs) == 2

    # Failure path — items stay on the queue.
    await enqueue_replay(redis, {"event_id": "e3"})
    repo.fail = True
    drained = await drain_replay(repo, redis, batch=10)
    assert drained == 0
    assert len(redis.list) == 1
