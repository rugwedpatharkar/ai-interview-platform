"""GET /public/jobs: unauthenticated, scrubbed DTO, page_size cap, IP rate-limit."""

import httpx
import pytest
from lib.redis import RateLimiter

from app.routes.public_api import create_public_app


class _FakeJobs:
    def __init__(self, results=None, total=0, detail=None):
        self._results = results or []
        self._total = total
        self._detail = detail

    async def search_published(self, **kwargs):
        return {
            "results": self._results,
            "total": [{"n": self._total}] if self._total else [],
            "remote_mode": [],
            "employment_type": [],
            "experience_level": [],
        }

    async def get_by_id(self, job_id):
        return self._detail


class _FakeCompanies:
    async def names_by_ids(self, comp_ids):
        return {}


def _app(fakes, *, results=None, total=0, rate_limit=60, detail=None):
    return create_public_app(
        {
            "jobs": _FakeJobs(results=results, total=total, detail=detail),
            "companies": _FakeCompanies(),
            "limiter": RateLimiter(fakes["redis"]),
            "trusted_proxy": False,
            "rate_limit": rate_limit,
            "rate_window": 60,
            "cors_origins": ["http://fe"],
        }
    )


async def _get(app, url="/public/jobs"):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        return await client.get(url)


@pytest.mark.asyncio
async def test_public_jobs_no_auth_returns_scrubbed_dto(fakes):
    raw = {
        "_id": "j1",
        "comp_id": "c1",
        "title": "Eng",
        "jd_text": "do work",
        "location": "NYC",
        "experience_level": "mid",
        "created_at": None,
        "aptitude_config": {"x": 1},
        "required_topics": ["a"],
    }
    resp = await _get(_app(fakes, results=[raw], total=1))
    assert resp.status_code == 200  # no token required
    assert "public" in resp.headers["cache-control"]
    body = resp.json()
    assert body["total"] == 1 and body["page"] == 1
    card = body["jobs"][0]
    assert card["job_id"] == "j1" and card["company_id"] == "c1"
    assert card["title"] == "Eng" and card["snippet"] == "do work"
    # snake_case DTO with internals scrubbed.
    assert "aptitude_config" not in card
    assert "required_topics" not in card
    assert "jd_text" not in card


@pytest.mark.asyncio
async def test_public_jobs_caps_page_size(fakes):
    resp = await _get(_app(fakes), url="/public/jobs?page_size=999")
    assert resp.json()["page_size"] == 24


@pytest.mark.asyncio
async def test_public_jobs_rate_limited(fakes):
    app = _app(fakes, rate_limit=2)
    await _get(app)
    await _get(app)
    resp = await _get(app)
    assert resp.status_code == 429
    assert "Retry-After" in resp.headers


@pytest.mark.asyncio
async def test_public_job_detail_returns_scrubbed_dto(fakes):
    raw = {
        "_id": "j1",
        "comp_id": "c1",
        "title": "Eng",
        "jd_text": "full description",
        "status": "published",
        "remote_mode": "remote",
        "skills": ["python"],
        "created_at": None,
        "aptitude_config": {"gate_mode": "auto"},
        "required_topics": ["a"],
    }
    resp = await _get(_app(fakes, detail=raw), url="/public/jobs/j1")
    assert resp.status_code == 200
    assert resp.headers["cache-control"] == "public, max-age=120"
    body = resp.json()
    assert body["job_id"] == "j1" and body["jd_text"] == "full description"
    assert body["remote_mode"] == "remote" and body["skills"] == ["python"]
    assert body["company"] == {"id": "c1", "name": "", "logo": ""}
    assert "aptitude_config" not in body and "comp_id" not in body
    assert "required_topics" not in body


@pytest.mark.asyncio
async def test_public_job_detail_unpublished_is_404(fakes):
    raw = {"_id": "j1", "comp_id": "c1", "title": "Eng", "status": "draft"}
    resp = await _get(_app(fakes, detail=raw), url="/public/jobs/j1")
    assert resp.status_code == 404
    assert resp.json() == {"error": "not_found"}


@pytest.mark.asyncio
async def test_public_job_detail_missing_is_404(fakes):
    resp = await _get(_app(fakes, detail=None), url="/public/jobs/nope")
    assert resp.status_code == 404
