"""resources/saved_jobs: save validates published; list reuses JobCardDTO + saved_at."""

from datetime import UTC, datetime

import pytest

from app.errors import NotFoundError
from app.resources import saved_jobs


class _FakeSaved:
    def __init__(self, rows=None):
        self._rows = rows or []
        self.saved = []
        self.unsaved = []

    async def save(self, cid, jid):
        self.saved.append((cid, jid))

    async def unsave(self, cid, jid):
        self.unsaved.append((cid, jid))

    async def list_by_candidate(self, cid):
        return list(self._rows)


class _FakeJobs:
    def __init__(self, by_id=None, published=None):
        self._by_id = by_id or {}
        self._published = published or []

    async def get_by_id(self, jid):
        return self._by_id.get(jid)

    async def find_published_by_ids(self, ids):
        return [d for d in self._published if str(d["_id"]) in ids]


class _FakeCompanies:
    def __init__(self, names=None):
        self._names = names or {}

    async def names_by_ids(self, ids):
        return {c: self._names[c] for c in ids if c in self._names}


@pytest.mark.asyncio
async def test_save_rejects_unpublished_job():
    jobs = _FakeJobs(by_id={"j1": {"_id": "j1", "status": "draft"}})
    with pytest.raises(NotFoundError):
        await saved_jobs.save_job("u1", "j1", saved_jobs=_FakeSaved(), jobs=jobs)


@pytest.mark.asyncio
async def test_save_published_job_records():
    saved = _FakeSaved()
    jobs = _FakeJobs(by_id={"j1": {"_id": "j1", "status": "published"}})
    await saved_jobs.save_job("u1", "j1", saved_jobs=saved, jobs=jobs)
    assert saved.saved == [("u1", "j1")]


@pytest.mark.asyncio
async def test_unsave_is_idempotent():
    saved = _FakeSaved()
    await saved_jobs.unsave_job("u1", "j1", saved_jobs=saved)
    assert saved.unsaved == [("u1", "j1")]


@pytest.mark.asyncio
async def test_list_joins_published_newest_first_drops_unpublished():
    rows = [
        {"job_id": "j2", "saved_at": datetime(2026, 6, 2, tzinfo=UTC)},
        {"job_id": "j1", "saved_at": datetime(2026, 6, 1, tzinfo=UTC)},
        {"job_id": "gone", "saved_at": datetime(2026, 6, 3, tzinfo=UTC)},
    ]
    published = [
        {
            "_id": "j1",
            "comp_id": "c1",
            "title": "A",
            "jd_text": "x",
            "status": "published",
        },
        {
            "_id": "j2",
            "comp_id": "c1",
            "title": "B",
            "jd_text": "y",
            "status": "published",
        },
    ]
    out = await saved_jobs.list_saved_jobs(
        "u1",
        saved_jobs=_FakeSaved(rows=rows),
        jobs=_FakeJobs(published=published),
        companies=_FakeCompanies(names={"c1": "Acme"}),
    )
    # saved_at desc preserved; 'gone' (unpublished) dropped.
    assert [c["job_id"] for c in out] == ["j2", "j1"]
    assert out[0]["saved_at"] == "2026-06-02T00:00:00+00:00"
    assert out[0]["company_name"] == "Acme"
    assert "candidate_user_id" not in out[0]  # scrubbed
