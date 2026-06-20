import grpc
import pytest
from lib.security import TokenService

from app.routes.job_alerts import JobAlertsServicer
from app.routes.pb import job_alerts_pb2

SECRET = "test-secret-" + "x" * 32


class _Aborted(Exception):
    def __init__(self, code, details):
        super().__init__(details)
        self.code = code


class FakeContext:
    def __init__(self, metadata=None):
        self._md = metadata or []

    def invocation_metadata(self):
        return self._md

    async def abort(self, code, details):
        raise _Aborted(code, details)


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
        self._docs[aid] = doc
        return aid

    async def get_scoped(self, aid, uid):
        d = self._docs.get(aid)
        return d if d and d["candidate_user_id"] == uid else None

    async def list_by_candidate(self, uid):
        return [d for d in self._docs.values() if d["candidate_user_id"] == uid]

    async def delete_scoped(self, aid, uid):
        d = self._docs.get(aid)
        if d and d["candidate_user_id"] == uid:
            del self._docs[aid]
            return True
        return False


def _md(uid="u1", role="candidate"):
    token = TokenService(SECRET).access_token(
        sub=uid, role=role, comp_id=None, jti="j1"
    )
    return FakeContext(metadata=[("authorization", f"Bearer {token}")])


def _servicer():
    return JobAlertsServicer(alerts=_FakeAlerts(), tokens=TokenService(SECRET))


@pytest.mark.asyncio
async def test_create_list_delete_roundtrip():
    svc = _servicer()
    created = await svc.CreateAlert(
        job_alerts_pb2.CreateAlertRequest(
            keyword="react",
            filters=job_alerts_pb2.AlertFilters(remote_mode="remote", skills=["React"]),
            frequency="weekly",
        ),
        _md(),
    )
    assert created.keyword == "react" and created.frequency == "weekly"
    assert list(created.filters.skills) == ["react"]
    listed = await svc.ListAlerts(job_alerts_pb2.ListAlertsRequest(), _md())
    assert len(listed.alerts) == 1
    out = await svc.DeleteAlert(
        job_alerts_pb2.DeleteAlertRequest(alert_id=created.alert_id), _md()
    )
    assert out.deleted is True


@pytest.mark.asyncio
async def test_create_rejects_bad_frequency():
    with pytest.raises(_Aborted) as ei:
        await _servicer().CreateAlert(
            job_alerts_pb2.CreateAlertRequest(keyword="x", frequency="hourly"), _md()
        )
    assert ei.value.code == grpc.StatusCode.INVALID_ARGUMENT


@pytest.mark.asyncio
async def test_delete_missing_is_not_found():
    with pytest.raises(_Aborted) as ei:
        await _servicer().DeleteAlert(
            job_alerts_pb2.DeleteAlertRequest(alert_id="nope"), _md()
        )
    assert ei.value.code == grpc.StatusCode.NOT_FOUND
