from datetime import UTC, datetime

import grpc
import pytest
from lib.security import TokenService

from app.model.application import Application
from app.routes.aptitude import AptitudeServicer
from app.routes.pb import aptitude_pb2

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
    return AptitudeServicer(
        applications=fakes["applications"],
        jobs=fakes["jobs"],
        banks=fakes["banks"],
        attempts=fakes["attempts"],
        deliveries=fakes["deliveries"],
        publisher=fakes["publisher"],
        tokens=TokenService(SECRET),
    )


def _md(user_id="u1"):
    token = TokenService(SECRET).access_token(
        sub=user_id, role="candidate", comp_id=None, jti="j1"
    )
    return FakeContext(metadata=[("authorization", f"Bearer {token}")])


def _bank():
    return {
        "job_id": "j1",
        "questions": [
            {
                "question": f"q{i}",
                "options": ["a", "b", "c", "d"],
                "correct_index": i,
                "topic": "python",
            }
            for i in range(3)
        ],
    }


async def _seed(fakes, candidate="u1", state="aptitude_pending"):
    aid = await fakes["applications"].insert(
        Application(comp_id="c1", job_id="j1", candidate_user_id=candidate, state=state)
    )
    fakes["banks"]._by_job["j1"] = _bank()
    fakes["jobs"]._docs["j1"] = {
        "_id": "j1",
        "comp_id": "c1",
        "aptitude_config": {"pass_threshold": 60, "time_limit_min": 20},
    }
    # Identity-order delivery so GET reuses it and SUBMIT [0,1,2] is deterministic.
    fakes["deliveries"]._docs[aid] = {
        "application_id": aid,
        "comp_id": "c1",
        "job_id": "j1",
        "order": [0, 1, 2],
        "delivered_at": datetime.now(UTC),
    }
    return aid


@pytest.mark.asyncio
async def test_get_test_rpc_returns_questions(fakes):
    aid = await _seed(fakes)
    resp = await _servicer(fakes).GetAptitudeTest(
        aptitude_pb2.GetTestRequest(application_id=aid), _md("u1")
    )
    assert len(resp.questions) == 3
    assert list(resp.questions[0].options) == ["a", "b", "c", "d"]


@pytest.mark.asyncio
async def test_submit_rpc_grades_and_passes(fakes):
    aid = await _seed(fakes)
    resp = await _servicer(fakes).SubmitAptitude(
        aptitude_pb2.SubmitRequest(application_id=aid, answers=[0, 1, 2]), _md("u1")
    )
    assert resp.score == 100
    assert resp.passed is True


@pytest.mark.asyncio
async def test_submit_rpc_rejects_non_owner(fakes):
    aid = await _seed(fakes, candidate="owner")
    with pytest.raises(_Aborted) as ei:
        await _servicer(fakes).SubmitAptitude(
            aptitude_pb2.SubmitRequest(application_id=aid, answers=[0, 1, 2]),
            _md("intruder"),
        )
    assert ei.value.code == grpc.StatusCode.PERMISSION_DENIED
