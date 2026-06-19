import grpc
import pytest
from lib.security import TokenService

from app.model.job import Job
from app.routes.application import ApplicationServicer
from app.routes.pb import application_pb2

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


def _servicer(fakes):
    return ApplicationServicer(
        applications=fakes["applications"],
        jobs=fakes["jobs"],
        publisher=fakes["publisher"],
        tokens=TokenService(SECRET),
        audit=fakes["audit"],
    )


def _candidate_md(user_id="u3"):
    token = TokenService(SECRET).access_token(
        sub=user_id, role="candidate", comp_id="", jti="j1"
    )
    return FakeContext(metadata=[("authorization", f"Bearer {token}")])


@pytest.mark.asyncio
async def test_apply_rpc(fakes):
    jid = await fakes["jobs"].insert(Job(comp_id="c1", title="Eng", status="published"))
    svc = _servicer(fakes)
    resp = await svc.Apply(
        application_pb2.ApplyRequest(job_id=jid, consent=True), _candidate_md()
    )
    assert resp.state == "applied"
    assert fakes["publisher"].published[0][0] == "application.created"


@pytest.mark.asyncio
async def test_apply_without_consent_aborts(fakes):
    jid = await fakes["jobs"].insert(Job(comp_id="c1", title="Eng", status="published"))
    svc = _servicer(fakes)
    with pytest.raises(_Aborted) as ei:
        await svc.Apply(
            application_pb2.ApplyRequest(job_id=jid, consent=False), _candidate_md()
        )
    assert ei.value.code == grpc.StatusCode.INVALID_ARGUMENT


@pytest.mark.asyncio
async def test_withdraw_application_rpc(fakes):
    jid = await fakes["jobs"].insert(Job(comp_id="c1", title="Eng", status="published"))
    svc = _servicer(fakes)
    applied = await svc.Apply(
        application_pb2.ApplyRequest(job_id=jid, consent=True), _candidate_md()
    )
    resp = await svc.WithdrawApplication(
        application_pb2.WithdrawApplicationRequest(
            application_id=applied.application_id
        ),
        _candidate_md(),
    )
    assert resp.state == "withdrawn"
