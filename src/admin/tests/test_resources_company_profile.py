"""resources/company_profile — public company DTO + funnel-derived trust signals."""

from datetime import UTC, datetime, timedelta

import pytest

from app.resources import company_profile as cp

NOW = datetime(2026, 6, 20, tzinfo=UTC)


class _FakeJobs:
    def __init__(self, published=None):
        self._published = published or []

    async def count_published_by_comp(self, comp_id):
        return len([j for j in self._published if j["comp_id"] == comp_id])

    async def list_published_by_comp(self, comp_id, *, skip=0, limit=24):
        rows = [j for j in self._published if j["comp_id"] == comp_id]
        return rows[skip : skip + limit]


class _FakeProfiles:
    def __init__(self, doc=None):
        self._doc = doc

    async def get_by_comp(self, comp_id):
        return self._doc


class _FakeCompanies:
    def __init__(self, names=None):
        self._names = names or {}

    async def names_by_ids(self, comp_ids):
        return {c: self._names[c] for c in comp_ids if c in self._names}


class _FakeApps:
    def __init__(self, rows=None):
        self._rows = rows or []

    async def list_by_comp(self, comp_id):
        return [r for r in self._rows if r["comp_id"] == comp_id]


def _app(days_to_first, *, comp_id="c1", at=None):
    created = NOW - timedelta(days=days_to_first + 1)
    moved = at or (created + timedelta(days=days_to_first))
    return {
        "comp_id": comp_id,
        "created_at": created,
        "transitions": [{"state": "aptitude_pending", "at": moved}],
    }


@pytest.mark.asyncio
async def test_unknown_company_is_none():
    out = await cp.get_company_profile(
        "c1",
        companies=_FakeCompanies(),
        profiles=_FakeProfiles(None),
        jobs=_FakeJobs([]),
        applications=_FakeApps(),
        now=NOW,
    )
    assert out is None  # no published job + no branding -> 404


@pytest.mark.asyncio
async def test_branding_only_is_public():
    out = await cp.get_company_profile(
        "c1",
        companies=_FakeCompanies({"c1": "Acme"}),
        profiles=_FakeProfiles(
            {"about": "We build", "website": "x.io", "locations": ["Berlin"]}
        ),
        jobs=_FakeJobs([]),
        applications=_FakeApps(),
        now=NOW,
    )
    assert out["id"] == "c1" and out["name"] == "Acme"
    assert out["about"] == "We build" and out["website"] == "x.io"
    assert out["locations"] == ["Berlin"]
    assert out["trust"]["open_jobs"] == 0


@pytest.mark.asyncio
async def test_responds_in_days_median_with_enough_samples():
    apps = _FakeApps([_app(2), _app(4), _app(6)])  # median days = 4
    out = await cp.get_company_profile(
        "c1",
        companies=_FakeCompanies({"c1": "Acme"}),
        profiles=_FakeProfiles(None),
        jobs=_FakeJobs([{"comp_id": "c1", "_id": "j1"}]),
        applications=apps,
        now=NOW,
    )
    assert out["trust"]["responds_in_days"] == 4
    assert out["trust"]["open_jobs"] == 1


@pytest.mark.asyncio
async def test_responds_in_days_zero_below_min_sample():
    apps = _FakeApps([_app(2), _app(4)])  # only 2 < min sample
    out = await cp.get_company_profile(
        "c1",
        companies=_FakeCompanies({"c1": "Acme"}),
        profiles=_FakeProfiles(None),
        jobs=_FakeJobs([{"comp_id": "c1", "_id": "j1"}]),
        applications=apps,
        now=NOW,
    )
    assert out["trust"]["responds_in_days"] == 0


@pytest.mark.asyncio
async def test_actively_reviewing_only_within_window():
    recent = _app(1, at=NOW - timedelta(days=2))  # moved 2 days ago -> active
    out = await cp.get_company_profile(
        "c1",
        companies=_FakeCompanies({"c1": "Acme"}),
        profiles=_FakeProfiles(None),
        jobs=_FakeJobs([{"comp_id": "c1", "_id": "j1"}]),
        applications=_FakeApps([recent]),
        now=NOW,
    )
    assert out["trust"]["actively_reviewing"] is True

    old = _app(1, at=NOW - timedelta(days=90))  # moved 90 days ago -> not active
    out2 = await cp.get_company_profile(
        "c1",
        companies=_FakeCompanies({"c1": "Acme"}),
        profiles=_FakeProfiles(None),
        jobs=_FakeJobs([{"comp_id": "c1", "_id": "j1"}]),
        applications=_FakeApps([old]),
        now=NOW,
    )
    assert out2["trust"]["actively_reviewing"] is False


@pytest.mark.asyncio
async def test_list_company_jobs_maps_cards_and_caps_page_size():
    jobs = _FakeJobs(
        [{"comp_id": "c1", "_id": f"j{i}", "title": f"T{i}"} for i in range(3)]
    )
    out = await cp.list_company_jobs(
        "c1", jobs=jobs, companies=_FakeCompanies({"c1": "Acme"}), page=1, page_size=999
    )
    assert out["page_size"] == 24 and out["total"] == 3
    assert out["jobs"][0]["company_name"] == "Acme"
    assert out["jobs"][0]["company_id"] == "c1"
    assert "comp_id" not in out["jobs"][0]
