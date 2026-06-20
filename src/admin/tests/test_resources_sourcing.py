"""resources/sourcing.search_candidates — comp-scoped keyword search over applicants.

The seed is the company's applications (same as GetTalentPool); the universe is
application-existence, not current funnel state. No global candidate index.
"""

import pytest

from app.errors import ForbiddenError
from app.resources import sourcing

ADMIN = {"id": "m1", "role": "company_admin", "comp_id": "c1"}
CAND = {"id": "u9", "role": "candidate", "comp_id": None}


class _FakeApps:
    def __init__(self, rows):
        self._rows = rows

    async def list_by_comp(self, comp_id):
        return [r for r in self._rows if r["comp_id"] == comp_id]


class _FakeProfiles:
    def __init__(self, docs):
        self._docs = docs

    async def find_by_user_ids(self, user_ids):
        return [d for d in self._docs if d["user_id"] in user_ids]


def _apps():
    return _FakeApps(
        [
            {"comp_id": "c1", "candidate_user_id": "u1", "state": "applied"},
            {"comp_id": "c1", "candidate_user_id": "u1", "state": "interviewed"},
            {"comp_id": "c1", "candidate_user_id": "u2", "state": "rejected"},
            {"comp_id": "c2", "candidate_user_id": "u3", "state": "applied"},
        ]
    )


def _profiles():
    return _FakeProfiles(
        [
            {"user_id": "u1", "skills": ["React", "TypeScript"], "full_name": "Ann"},
            {"user_id": "u2", "skills": ["Go"], "full_name": "Bob"},
            {"user_id": "u3", "skills": ["React"], "full_name": "Cy"},
        ]
    )


@pytest.mark.asyncio
async def test_only_own_company_applicants_surface():
    out = await sourcing.search_candidates(
        ADMIN, "react", applications=_apps(), profiles=_profiles()
    )
    ids = {h["candidate_user_id"] for h in out["hits"]}
    assert ids == {"u1"}  # u3 (c2) is unreachable; u2 has no react


@pytest.mark.asyncio
async def test_rejected_applicant_still_surfaces():
    out = await sourcing.search_candidates(
        ADMIN, "go", applications=_apps(), profiles=_profiles()
    )
    hit = next(h for h in out["hits"] if h["candidate_user_id"] == "u2")
    assert hit["top_stage"] == "rejected"  # rejected stays searchable


@pytest.mark.asyncio
async def test_matched_skills_and_fit_and_count():
    out = await sourcing.search_candidates(
        ADMIN, "react", applications=_apps(), profiles=_profiles()
    )
    hit = out["hits"][0]
    assert hit["candidate_user_id"] == "u1"
    assert hit["matched_skills"] == ["React"]
    assert hit["fit_score"] == 1.0  # the one query term matched
    assert hit["application_count"] == 2
    assert hit["top_stage"] == "interviewed"  # furthest of applied/interviewed


@pytest.mark.asyncio
async def test_stage_filter():
    out = await sourcing.search_candidates(
        ADMIN, "", applications=_apps(), profiles=_profiles(), stage="rejected"
    )
    assert {h["candidate_user_id"] for h in out["hits"]} == {"u2"}


@pytest.mark.asyncio
async def test_min_score_filters_out_non_matches():
    # a non-matching query drops all hits regardless of min_score
    out = await sourcing.search_candidates(
        ADMIN, "rust", applications=_apps(), profiles=_profiles(), min_score=0.5
    )
    assert out["hits"] == [] and out["total"] == 0


@pytest.mark.asyncio
async def test_page_size_capped():
    out = await sourcing.search_candidates(
        ADMIN, "", applications=_apps(), profiles=_profiles(), page_size=999
    )
    assert out["page_size"] == 50


@pytest.mark.asyncio
async def test_candidate_cannot_search():
    with pytest.raises(ForbiddenError):
        await sourcing.search_candidates(
            CAND, "react", applications=_apps(), profiles=_profiles()
        )
