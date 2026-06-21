import pytest

from app.errors import ValidationError
from app.resources.mark_read import mark_thread_read


class _FakeReadStateStore:
    def __init__(self):
        self.state: dict[tuple, int] = {}

    async def get_seq_no(self, comp_id, user_id, kind, thread_id):
        return self.state.get((comp_id, user_id, kind, thread_id), 0)

    async def set_seq_no_if_greater(self, comp_id, user_id, kind, thread_id, new_seq):
        key = (comp_id, user_id, kind, thread_id)
        current = self.state.get(key, 0)
        if new_seq == 0:
            new_seq = current + 1
        if new_seq > current:
            self.state[key] = new_seq
            return new_seq
        return current


@pytest.fixture
def store():
    return _FakeReadStateStore()


@pytest.mark.asyncio
async def test_first_call_with_seq_zero_advances_to_one(store):
    out = await mark_thread_read("c1", "u1", "thread", "t1", 0, store=store)
    assert out == 1


@pytest.mark.asyncio
async def test_concurrent_calls_preserve_max_seq(store):
    out1 = await mark_thread_read("c1", "u1", "thread", "t1", 5, store=store)
    out2 = await mark_thread_read("c1", "u1", "thread", "t1", 3, store=store)
    assert out1 == 5
    assert out2 == 5  # stale call returns the existing higher value


@pytest.mark.asyncio
async def test_increasing_seq_advances(store):
    out1 = await mark_thread_read("c1", "u1", "thread", "t1", 5, store=store)
    out2 = await mark_thread_read("c1", "u1", "thread", "t1", 10, store=store)
    assert out1 == 5
    assert out2 == 10


@pytest.mark.asyncio
async def test_negative_seq_rejected(store):
    with pytest.raises(ValidationError):
        await mark_thread_read("c1", "u1", "thread", "t1", -1, store=store)


@pytest.mark.asyncio
async def test_empty_kind_rejected(store):
    with pytest.raises(ValidationError):
        await mark_thread_read("c1", "u1", "", "t1", 1, store=store)


@pytest.mark.asyncio
async def test_separate_thread_ids_dont_collide(store):
    out1 = await mark_thread_read("c1", "u1", "thread", "t1", 5, store=store)
    out2 = await mark_thread_read("c1", "u1", "thread", "t2", 0, store=store)
    assert out1 == 5
    assert out2 == 1


@pytest.mark.asyncio
async def test_separate_kinds_dont_collide(store):
    out1 = await mark_thread_read("c1", "u1", "thread", "x1", 5, store=store)
    out2 = await mark_thread_read("c1", "u1", "notification", "x1", 0, store=store)
    assert out1 == 5
    assert out2 == 1
