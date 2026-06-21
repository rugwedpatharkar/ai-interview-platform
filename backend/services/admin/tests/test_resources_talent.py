"""Talent pool: comp's applicants with application counts; comp-scoped; manager-only."""

from collections import Counter

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

    async def list_talent_pool_paginated(
        self, comp_id, *, page_size, after_user_id=None
    ):
        rows = [
            r
            for r in self._rows
            if r.get("comp_id") == comp_id and r.get("candidate_user_id")
        ]
        counts = Counter(r["candidate_user_id"] for r in rows)
        entries = sorted(counts.items())
        if after_user_id is not None:
            entries = [(uid, cnt) for uid, cnt in entries if uid > after_user_id]
        if len(entries) > page_size:
            return entries[:page_size], entries[page_size - 1][0]
        return entries, None

    async def count_talent_pool(self, comp_id):
        rows = [
            r
            for r in self._rows
            if r.get("comp_id") == comp_id and r.get("candidate_user_id")
        ]
        return len(Counter(r["candidate_user_id"] for r in rows))


@pytest.mark.asyncio
async def test_pool_counts_applications_per_candidate():
    rows = [
        {"comp_id": "c1", "candidate_user_id": "u1"},
        {"comp_id": "c1", "candidate_user_id": "u1"},
        {"comp_id": "c1", "candidate_user_id": "u2"},
        {"comp_id": "c2", "candidate_user_id": "u9"},  # other tenant — excluded
    ]
    out = await talent.get_talent_pool(MGR, 100, "", applications=_FakeApps(rows))
    counts = {e["candidate_user_id"]: e["application_count"] for e in out["entries"]}
    assert counts == {"u1": 2, "u2": 1}


@pytest.mark.asyncio
async def test_talent_manager_only():
    with pytest.raises(ForbiddenError):
        await talent.get_talent_pool(CAND, 100, "", applications=_FakeApps([]))
