"""Talent pool: comp's applicants with application counts; comp-scoped; manager-only."""

import pytest

from app.errors import ForbiddenError
from app.resources import talent

MGR = {"id": "r1", "role": "recruiter", "comp_id": "c1"}
CAND = {"id": "u1", "role": "candidate", "comp_id": ""}


class _FakeApps:
    def __init__(self, rows):
        self._rows = rows

    async def list_by_comp(self, comp_id):
        return [r for r in self._rows if r.get("comp_id") == comp_id]


@pytest.mark.asyncio
async def test_pool_counts_applications_per_candidate():
    rows = [
        {"comp_id": "c1", "candidate_user_id": "u1"},
        {"comp_id": "c1", "candidate_user_id": "u1"},
        {"comp_id": "c1", "candidate_user_id": "u2"},
        {"comp_id": "c2", "candidate_user_id": "u9"},  # other tenant — excluded
    ]
    out = await talent.get_talent_pool(MGR, applications=_FakeApps(rows))
    counts = {e["candidate_user_id"]: e["application_count"] for e in out}
    assert counts == {"u1": 2, "u2": 1}


@pytest.mark.asyncio
async def test_talent_manager_only():
    with pytest.raises(ForbiddenError):
        await talent.get_talent_pool(CAND, applications=_FakeApps([]))
