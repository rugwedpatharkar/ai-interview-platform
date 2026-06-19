"""Recommendation fan-out: on profile.parsed, emit a capped match.run per open job."""

import pytest

from app.resources import recommend


class _FakeJobs:
    def __init__(self, jobs):
        self._jobs = jobs

    async def list_published_capped(self, limit):
        return self._jobs[:limit]


class _FakePublisher:
    def __init__(self):
        self.published = []

    async def publish(self, key, payload):
        self.published.append((key, payload))


@pytest.mark.asyncio
async def test_fan_out_emits_match_run_per_job():
    jobs = _FakeJobs([{"_id": "j1", "comp_id": "c1"}, {"_id": "j2", "comp_id": "c2"}])
    pub = _FakePublisher()
    n = await recommend.fan_out_match(
        {"user_id": "u1"}, jobs=jobs, publisher=pub, limit=20
    )
    assert n == 2
    assert pub.published == [
        ("match.run", {"comp_id": "c1", "job_id": "j1", "candidate_user_id": "u1"}),
        ("match.run", {"comp_id": "c2", "job_id": "j2", "candidate_user_id": "u1"}),
    ]


@pytest.mark.asyncio
async def test_fan_out_respects_cap():
    jobs = _FakeJobs([{"_id": f"j{i}", "comp_id": "c"} for i in range(5)])
    pub = _FakePublisher()
    n = await recommend.fan_out_match(
        {"user_id": "u1"}, jobs=jobs, publisher=pub, limit=2
    )
    assert n == 2
    assert len(pub.published) == 2


@pytest.mark.asyncio
async def test_fan_out_missing_user_id_raises():
    # Malformed profile.parsed (no user_id) must raise so the consumer DLXes it, not
    # silently no-op.
    with pytest.raises(ValueError):
        await recommend.fan_out_match(
            {}, jobs=_FakeJobs([]), publisher=_FakePublisher(), limit=20
        )


class _BoomPublisher:
    async def publish(self, key, payload):
        raise RuntimeError("broker down")


@pytest.mark.asyncio
async def test_fan_out_publish_failure_propagates():
    # A publish failure must propagate (not be swallowed) so the event redelivers; the
    # match.run dedup makes re-fan safe. Guards the no-swallow contract.
    jobs = _FakeJobs([{"_id": "j1", "comp_id": "c1"}])
    with pytest.raises(RuntimeError):
        await recommend.fan_out_match(
            {"user_id": "u1"}, jobs=jobs, publisher=_BoomPublisher(), limit=20
        )
