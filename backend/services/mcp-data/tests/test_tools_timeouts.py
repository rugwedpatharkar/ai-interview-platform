import asyncio

import pytest
from lib.resilience import OperationTimeout

from app.tools import DataStore
from lib import timeouts


class _SlowCollection:
    """A fake collection whose update_one sleeps longer than the timeout."""

    async def update_one(self, *args, **kwargs):
        await asyncio.sleep(2.0)

    async def find_one(self, *args, **kwargs):
        await asyncio.sleep(2.0)

    async def insert_many(self, *args, **kwargs):
        await asyncio.sleep(2.0)

    def find(self, *args, **kwargs):
        return self

    async def to_list(self, *args, **kwargs):
        await asyncio.sleep(2.0)

    def sort(self, *args, **kwargs):
        return self


class _Db(dict):
    def __init__(self):
        super().__init__()
        for name in [
            "candidate_profiles",
            "jobs",
            "aptitude_banks",
            "interviews",
            "reports",
            "applications",
            "match_results",
            "job_question_plans",
            "proctoring_events",
            "practice_sessions",
        ]:
            self[name] = _SlowCollection()

    def __getitem__(self, k):
        return super().__getitem__(k)


@pytest.mark.asyncio
async def test_save_profile_respects_mongo_timeout(monkeypatch):
    monkeypatch.setenv("MONGO_OP_TIMEOUT_SECONDS", "0.05")
    # Reset the timeouts cache so the new env value is picked up.
    timeouts._cached_settings = None
    store = DataStore(_Db())
    with pytest.raises(OperationTimeout):
        await store.save_profile("u1", {"name": "Alice"})
