"""RecommendationService logic: candidate sees own; recruiter sees own-comp job."""

import pytest

from app.errors import ForbiddenError, NotFoundError
from app.resources import recommendations as rec

CAND = {"id": "u1", "role": "candidate", "comp_id": ""}
MGR = {"id": "r1", "role": "recruiter", "comp_id": "c1"}

_ROWS = [
    {"job_id": "j1", "comp_id": "c1", "candidate_user_id": "u1", "score": 0.9},
    {"job_id": "j1", "comp_id": "c1", "candidate_user_id": "u2", "score": 0.7},
    {"job_id": "j1", "comp_id": "c2", "candidate_user_id": "u9", "score": 0.99},
    {"job_id": "j2", "comp_id": "c1", "candidate_user_id": "u1", "score": 0.5},
]


class _FakeMatches:
    def __init__(self, rows):
        self._rows = rows

    async def list_by_candidate(self, candidate_user_id):
        return [r for r in self._rows if r["candidate_user_id"] == candidate_user_id]

    async def list_by_candidate_paginated(
        self, candidate_user_id, *, page_size, after_id=None
    ):
        rows = [r for r in self._rows if r["candidate_user_id"] == candidate_user_id]
        if after_id is not None:
            rows = [r for r in rows if r.get("_id", "") > after_id]
        if len(rows) > page_size:
            return rows[:page_size], rows[page_size - 1].get("_id")
        return rows, None

    async def count_by_candidate(self, candidate_user_id):
        return sum(1 for r in self._rows if r["candidate_user_id"] == candidate_user_id)

    async def list_by_job(self, job_id, comp_id):
        return [
            r for r in self._rows if r["job_id"] == job_id and r["comp_id"] == comp_id
        ]


class _FakeJobs:
    def __init__(self, jobs):
        self._jobs = jobs

    async def get_scoped(self, job_id, comp_id):
        return self._jobs.get((job_id, comp_id))


@pytest.mark.asyncio
async def test_candidate_sees_own_sorted_by_score():
    out = await rec.get_candidate_recommendations(
        CAND, 100, "", matches=_FakeMatches(_ROWS)
    )
    assert [m["job_id"] for m in out["matches"]] == [
        "j1",
        "j2",
    ]  # only u1's, score-desc
    assert out["matches"][0]["score"] == 0.9


@pytest.mark.asyncio
async def test_candidate_role_required():
    with pytest.raises(ForbiddenError):
        await rec.get_candidate_recommendations(
            MGR, 100, "", matches=_FakeMatches(_ROWS)
        )


@pytest.mark.asyncio
async def test_recruiter_sees_job_ranked_scoped():
    jobs = _FakeJobs({("j1", "c1"): {"_id": "j1", "comp_id": "c1"}})
    out = await rec.get_job_ranked_candidates(
        MGR, "j1", jobs=jobs, matches=_FakeMatches(_ROWS)
    )
    assert [m["candidate_user_id"] for m in out] == ["u1", "u2"]  # score-desc
    assert out[0]["score"] == 0.9


@pytest.mark.asyncio
async def test_recruiter_ranked_excludes_other_comp_match_rows():
    # u9's match row is comp c2; even though it outscores everyone, the comp-scoped read
    # must keep it invisible to a c1 recruiter (defense-in-depth beyond the job check).
    jobs = _FakeJobs({("j1", "c1"): {"_id": "j1", "comp_id": "c1"}})
    out = await rec.get_job_ranked_candidates(
        MGR, "j1", jobs=jobs, matches=_FakeMatches(_ROWS)
    )
    assert "u9" not in [m["candidate_user_id"] for m in out]


@pytest.mark.asyncio
async def test_recruiter_cross_tenant_job_not_found():
    with pytest.raises(NotFoundError):
        await rec.get_job_ranked_candidates(
            MGR, "j1", jobs=_FakeJobs({}), matches=_FakeMatches(_ROWS)
        )


@pytest.mark.asyncio
async def test_non_manager_cannot_rank():
    with pytest.raises(ForbiddenError):
        await rec.get_job_ranked_candidates(
            CAND, "j1", jobs=_FakeJobs({}), matches=_FakeMatches(_ROWS)
        )
