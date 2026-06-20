"""resources/discovery.search_jobs: scrubbed DTO, facets, clamp, sort defaults.

The Mongo $text+$facet aggregation lives in JobRepository.search_published (integration-
tested against a real Mongo); here we fake it with canned $facet output to test the pure
orchestration the resource owns.
"""

from datetime import UTC, datetime

import pytest

from app.resources import discovery


class _FakeJobs:
    def __init__(self, results=None, total=0, facets=None):
        self._results = results or []
        self._total = total
        self._facets = facets or {}
        self.calls = []

    async def search_published(self, **kwargs):
        self.calls.append(kwargs)
        return {
            "results": self._results,
            "total": [{"n": self._total}] if self._total else [],
            "remote_mode": self._facets.get("remote_mode", []),
            "employment_type": self._facets.get("employment_type", []),
            "experience_level": self._facets.get("experience_level", []),
        }


class _FakeCompanies:
    def __init__(self, names=None):
        self._names = names or {}
        self.calls = []

    async def names_by_ids(self, comp_ids):
        self.calls.append(list(comp_ids))
        return {c: self._names[c] for c in comp_ids if c in self._names}


def _raw_job():
    return {
        "_id": "job1",
        "comp_id": "c1",
        "title": "Senior Python Engineer",
        "jd_text": "x" * 300,
        "status": "published",
        "location": "Remote",
        "experience_level": "senior",
        "created_at": datetime(2026, 6, 1, tzinfo=UTC),
        # internals that must NEVER leak into the public DTO:
        "aptitude_config": {"topics": ["python"]},
        "required_topics": ["asyncio"],
    }


@pytest.mark.asyncio
async def test_maps_to_scrubbed_dto():
    jobs = _FakeJobs(results=[_raw_job()], total=1)
    out = await discovery.search_jobs(
        {"q": "python"}, jobs=jobs, companies=_FakeCompanies(names={"c1": "Acme"})
    )
    assert out["total"] == 1
    card = out["jobs"][0]
    assert card["job_id"] == "job1"
    assert card["title"] == "Senior Python Engineer"
    assert card["company_id"] == "c1"  # comp_id exposed only as the linkable company_id
    assert card["company_name"] == "Acme"
    assert card["location"] == "Remote"
    assert card["posted_at"] == "2026-06-01T00:00:00+00:00"  # from created_at
    assert len(card["snippet"]) == 160  # jd truncated to ~160 chars
    # grep-test: company/job internals are scrubbed.
    assert "comp_id" not in card
    assert "aptitude_config" not in card
    assert "required_topics" not in card
    assert "jd_text" not in card


@pytest.mark.asyncio
async def test_unset_marketplace_fields_default_empty():
    # remote_mode/employment_type/salary/skills aren't on Job yet (added by extend-Job);
    # they read as empty until then, with no change needed here.
    out = await discovery.search_jobs(
        {}, jobs=_FakeJobs(results=[_raw_job()], total=1), companies=_FakeCompanies()
    )
    card = out["jobs"][0]
    assert card["remote_mode"] == "" and card["employment_type"] == ""
    assert card["salary_min"] == 0 and card["salary_max"] == 0
    assert card["salary_currency"] == "" and card["skills"] == []
    assert card["company_name"] == ""  # no name known for c1


@pytest.mark.asyncio
async def test_facets_drop_null_bucket():
    jobs = _FakeJobs(
        facets={
            "experience_level": [
                {"_id": "senior", "count": 3},
                {"_id": None, "count": 5},  # jobs missing the field -> dropped
            ],
            "remote_mode": [{"_id": "remote", "count": 2}],
        },
    )
    out = await discovery.search_jobs({}, jobs=jobs, companies=_FakeCompanies())
    assert out["facets"]["experience_level"] == [{"value": "senior", "count": 3}]
    assert out["facets"]["remote_mode"] == [{"value": "remote", "count": 2}]
    assert out["facets"]["employment_type"] == []


@pytest.mark.asyncio
async def test_page_size_capped_and_page_floored():
    jobs = _FakeJobs()
    await discovery.search_jobs(
        {"page": 0, "page_size": 999}, jobs=jobs, companies=_FakeCompanies()
    )
    call = jobs.calls[0]
    assert call["limit"] == 24  # capped at MAX_PAGE_SIZE
    assert call["skip"] == 0  # page floored to 1


@pytest.mark.asyncio
async def test_sort_defaults_relevance_with_query_recent_without():
    with_q = _FakeJobs()
    await discovery.search_jobs({"q": "react"}, jobs=with_q, companies=_FakeCompanies())
    assert with_q.calls[0]["sort"] == "relevance"
    no_q = _FakeJobs()
    await discovery.search_jobs({}, jobs=no_q, companies=_FakeCompanies())
    assert no_q.calls[0]["sort"] == "recent"


@pytest.mark.asyncio
async def test_skips_company_lookup_when_no_results():
    companies = _FakeCompanies()
    await discovery.search_jobs({}, jobs=_FakeJobs(), companies=companies)
    assert companies.calls == []  # no comp_ids -> no batch lookup


class _DetailJobs:
    def __init__(self, doc=None):
        self._doc = doc

    async def get_by_id(self, job_id):
        return self._doc


def _published_doc():
    return {
        "_id": "job1",
        "comp_id": "c1",
        "title": "Senior Python Engineer",
        "jd_text": "x" * 300,
        "status": "published",
        "location": "Remote",
        "remote_mode": "remote",
        "employment_type": "full_time",
        "salary_min": 100000,
        "salary_max": 140000,
        "salary_currency": "USD",
        "skills": ["python"],
        "created_at": datetime(2026, 6, 1, tzinfo=UTC),
        # internals that must NEVER leak into the public DTO:
        "aptitude_config": {"gate_mode": "auto"},
        "required_topics": ["asyncio"],
    }


@pytest.mark.asyncio
async def test_get_public_job_detail_full_dto():
    out = await discovery.get_public_job_detail(
        "job1",
        jobs=_DetailJobs(_published_doc()),
        companies=_FakeCompanies(names={"c1": "Acme"}),
    )
    assert out["job_id"] == "job1"
    assert out["title"] == "Senior Python Engineer"
    assert out["jd_text"] == "x" * 300  # FULL JD, not the search snippet
    assert out["location"] == "Remote" and out["remote_mode"] == "remote"
    assert out["employment_type"] == "full_time"
    assert out["salary_min"] == 100000 and out["salary_max"] == 140000
    assert out["salary_currency"] == "USD" and out["skills"] == ["python"]
    assert out["posted_at"] == "2026-06-01T00:00:00+00:00"  # from created_at
    assert out["company"] == {"id": "c1", "name": "Acme", "logo": ""}
    # grep-test: internals are scrubbed (comp_id surfaces only as company.id).
    assert "comp_id" not in out
    assert "aptitude_config" not in out
    assert "required_topics" not in out
    assert "snippet" not in out


@pytest.mark.asyncio
async def test_get_public_job_detail_unpublished_is_none():
    doc = _published_doc()
    doc["status"] = "draft"
    out = await discovery.get_public_job_detail(
        "job1", jobs=_DetailJobs(doc), companies=_FakeCompanies()
    )
    assert out is None  # drafts are never publicly discoverable


@pytest.mark.asyncio
async def test_get_public_job_detail_missing_is_none():
    out = await discovery.get_public_job_detail(
        "nope", jobs=_DetailJobs(None), companies=_FakeCompanies()
    )
    assert out is None
