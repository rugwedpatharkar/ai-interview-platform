"""Funnel analytics: per-state counts + hired/total conversion, comp-scoped."""

import pytest

from app.errors import ForbiddenError
from app.resources import analytics

MGR = {"id": "r1", "role": "recruiter", "comp_id": "c1"}
CAND = {"id": "u1", "role": "candidate", "comp_id": ""}


class _FakeApps:
    def __init__(self, rows):
        self._rows = rows

    async def list_by_comp(self, comp_id):
        return [r for r in self._rows if r.get("comp_id") == comp_id]


@pytest.mark.asyncio
async def test_funnel_counts_and_conversion():
    rows = [
        {"comp_id": "c1", "state": "applied"},
        {"comp_id": "c1", "state": "applied"},
        {"comp_id": "c1", "state": "hired"},
        {"comp_id": "c1", "state": "rejected"},
        {"comp_id": "c2", "state": "hired"},  # other tenant — excluded
    ]
    out = await analytics.get_funnel_analytics(MGR, applications=_FakeApps(rows))
    assert out["total"] == 4
    counts = {s["state"]: s["count"] for s in out["states"]}
    assert counts == {"applied": 2, "hired": 1, "rejected": 1}
    assert out["conversion_rate"] == 0.25  # 1 hired / 4


@pytest.mark.asyncio
async def test_analytics_manager_only():
    with pytest.raises(ForbiddenError):
        await analytics.get_funnel_analytics(CAND, applications=_FakeApps([]))


@pytest.mark.asyncio
async def test_empty_conversion_is_zero():
    out = await analytics.get_funnel_analytics(MGR, applications=_FakeApps([]))
    assert out["total"] == 0
    assert out["conversion_rate"] == 0.0


class _FakeReports:
    def __init__(self, by_app):
        self._by_app = by_app
        self.batch_calls = 0

    async def list_by_applications(self, application_ids):
        # Mirror the real $in read: one query, only existing reports come back.
        self.batch_calls += 1
        return [self._by_app[a] for a in application_ids if a in self._by_app]


class _FakeAppsByJob:
    def __init__(self, apps):
        self._apps = apps

    async def list_by_job(self, job_id, comp_id):
        return [
            a for a in self._apps if a["job_id"] == job_id and a["comp_id"] == comp_id
        ]


@pytest.mark.asyncio
async def test_job_score_distribution():
    apps = [
        {"_id": "a1", "job_id": "j1", "comp_id": "c1"},
        {"_id": "a2", "job_id": "j1", "comp_id": "c1"},
        {"_id": "a3", "job_id": "j1", "comp_id": "c1"},  # no report yet
    ]
    reports = _FakeReports({"a1": {"overall_score": 0.8}, "a2": {"overall_score": 0.6}})
    out = await analytics.get_job_score_distribution(
        MGR, "j1", applications=_FakeAppsByJob(apps), reports=reports
    )
    assert out["count"] == 2
    assert out["min"] == 0.6
    assert out["max"] == 0.8
    assert out["mean"] == 0.7
    assert reports.batch_calls == 1  # one batched read, not one query per applicant


@pytest.mark.asyncio
async def test_score_distribution_percentiles():
    # Out-of-order -> sorted {0,.25,.5,.75,1}; type-7 percentiles land on the points.
    apps = [{"_id": f"a{i}", "job_id": "j1", "comp_id": "c1"} for i in range(1, 6)]
    reports = _FakeReports(
        {
            "a1": {"overall_score": 0.5},
            "a2": {"overall_score": 1.0},
            "a3": {"overall_score": 0.0},
            "a4": {"overall_score": 0.75},
            "a5": {"overall_score": 0.25},
        }
    )
    out = await analytics.get_job_score_distribution(
        MGR, "j1", applications=_FakeAppsByJob(apps), reports=reports
    )
    assert out["count"] == 5
    assert out["min"] == 0.0 and out["max"] == 1.0
    assert out["p25"] == 0.25
    assert out["p50"] == 0.5  # median
    assert out["p75"] == 0.75


@pytest.mark.asyncio
async def test_score_distribution_empty_is_zeros():
    out = await analytics.get_job_score_distribution(
        MGR, "j1", applications=_FakeAppsByJob([]), reports=_FakeReports({})
    )
    assert out["count"] == 0
    assert out["p50"] == 0.0
