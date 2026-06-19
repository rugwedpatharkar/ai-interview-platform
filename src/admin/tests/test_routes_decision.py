import grpc
import pytest
from lib.security import TokenService

from app.model.application import Application
from app.routes.decision import DecisionServicer
from app.routes.pb import decision_pb2

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
    return DecisionServicer(
        applications=fakes["applications"],
        audit=fakes["audit"],
        tokens=TokenService(SECRET),
    )


def _md(role="company_admin", comp_id="c1"):
    token = TokenService(SECRET).access_token(
        sub="u1", role=role, comp_id=comp_id, jti="j1"
    )
    return FakeContext(metadata=[("authorization", f"Bearer {token}")])


@pytest.mark.asyncio
async def test_decide_rpc(fakes):
    aid = await fakes["applications"].insert(
        Application(comp_id="c1", job_id="j1", candidate_user_id="u9", state="scored")
    )
    svc = _servicer(fakes)
    resp = await svc.DecideApplication(
        decision_pb2.DecideRequest(application_id=aid, outcome="hired"), _md()
    )
    assert resp.state == "hired"


@pytest.mark.asyncio
async def test_decide_non_scored_aborts_failed_precondition(fakes):
    aid = await fakes["applications"].insert(
        Application(comp_id="c1", job_id="j1", candidate_user_id="u9", state="applied")
    )
    svc = _servicer(fakes)
    with pytest.raises(_Aborted) as ei:
        await svc.DecideApplication(
            decision_pb2.DecideRequest(application_id=aid, outcome="hired"), _md()
        )
    assert ei.value.code == grpc.StatusCode.FAILED_PRECONDITION
