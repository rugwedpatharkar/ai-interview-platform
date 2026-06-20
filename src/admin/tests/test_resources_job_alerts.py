"""resources/job_alerts — candidate-scoped saved searches (create/list/delete)."""

from datetime import UTC, datetime, timedelta

import pytest

from app.errors import LimitExceededError, NotFoundError, ValidationError
from app.resources import job_alerts


class _FakeAlerts:
    def __init__(self):
        self._docs = {}
        self._seq = 0

    async def count_by_candidate(self, uid):
        return sum(1 for d in self._docs.values() if d["candidate_user_id"] == uid)

    async def create(self, alert):
        self._seq += 1
        aid = str(self._seq)
        doc = alert.model_dump()
        doc["_id"] = aid
        # stagger created_at so list ordering is deterministic
        doc["created_at"] = datetime(2026, 6, 20, tzinfo=UTC) + timedelta(
            seconds=self._seq
        )
        self._docs[aid] = doc
        return aid

    async def get_scoped(self, aid, uid):
        d = self._docs.get(aid)
        return d if d and d["candidate_user_id"] == uid else None

    async def list_by_candidate(self, uid):
        rows = [d for d in self._docs.values() if d["candidate_user_id"] == uid]
        return sorted(rows, key=lambda d: d["created_at"], reverse=True)

    async def delete_scoped(self, aid, uid):
        d = self._docs.get(aid)
        if d and d["candidate_user_id"] == uid:
            del self._docs[aid]
            return True
        return False


def _filters(**kw):
    base = {
        "location": "",
        "remote_mode": "",
        "employment_type": "",
        "experience_level": "",
        "skills": [],
    }
    base.update(kw)
    return base


@pytest.mark.asyncio
async def test_create_returns_dto_with_normalized_skills():
    alerts = _FakeAlerts()
    out = await job_alerts.create_alert(
        "u1",
        "react",
        _filters(remote_mode="remote", skills=["React", "react", "GO"]),
        "weekly",
        alerts=alerts,
    )
    assert out["keyword"] == "react" and out["frequency"] == "weekly"
    assert out["filters"]["remote_mode"] == "remote"
    assert out["filters"]["skills"] == ["go", "react"]  # lowercased + de-duped
    assert out["last_run_at"] == ""  # unset until the sweep runs
    assert out["created_at"] != ""


@pytest.mark.asyncio
async def test_create_rejects_bad_frequency():
    with pytest.raises(ValidationError):
        await job_alerts.create_alert(
            "u1", "x", _filters(), "hourly", alerts=_FakeAlerts()
        )


@pytest.mark.asyncio
async def test_create_enforces_cap():
    alerts = _FakeAlerts()
    for _ in range(20):
        await job_alerts.create_alert("u1", "x", _filters(), "daily", alerts=alerts)
    with pytest.raises(LimitExceededError):
        await job_alerts.create_alert("u1", "x", _filters(), "daily", alerts=alerts)


@pytest.mark.asyncio
async def test_list_is_candidate_scoped_newest_first():
    alerts = _FakeAlerts()
    a1 = (await job_alerts.create_alert("u1", "a", _filters(), "daily", alerts=alerts))[
        "alert_id"
    ]
    a2 = (await job_alerts.create_alert("u1", "b", _filters(), "daily", alerts=alerts))[
        "alert_id"
    ]
    await job_alerts.create_alert("u2", "c", _filters(), "daily", alerts=alerts)
    out = await job_alerts.list_alerts("u1", alerts=alerts)
    assert [o["alert_id"] for o in out] == [a2, a1]  # newest first, only u1


@pytest.mark.asyncio
async def test_delete_scoped_and_cross_tenant_not_found():
    alerts = _FakeAlerts()
    a1 = (await job_alerts.create_alert("u1", "a", _filters(), "daily", alerts=alerts))[
        "alert_id"
    ]
    with pytest.raises(NotFoundError):  # another candidate cannot delete it
        await job_alerts.delete_alert("u2", a1, alerts=alerts)
    assert await job_alerts.delete_alert("u1", a1, alerts=alerts) is True
    with pytest.raises(NotFoundError):  # already gone
        await job_alerts.delete_alert("u1", a1, alerts=alerts)
