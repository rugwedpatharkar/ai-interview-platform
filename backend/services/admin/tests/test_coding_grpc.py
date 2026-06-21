"""CodingService over gRPC-web: auth, ownership, and a real end-to-end submit."""

import os
import struct

import httpx
import pytest
from lib.grpcweb import GrpcWebASGI
from lib.security import TokenService

from app.routes.coding import CodingServicer
from app.routes.pb import coding_pb2, coding_pb2_grpc

_SECRET = "test-secret-" + "x" * 32
_SVC = "/admin.coding.v1.CodingService"
posix_only = pytest.mark.skipif(os.name != "posix", reason="executor is POSIX-only")


class _FakeApps:
    def __init__(self, candidate_user_id="cand"):
        self._uid = candidate_user_id

    async def get(self, aid):
        return {
            "_id": aid,
            "comp_id": "c1",
            "candidate_user_id": self._uid,
            "job_id": "j1",
        }


class _FakeTasks:
    async def get_by_job(self, job_id):
        return {
            "job_id": "j1",
            "title": "Sum",
            "prompt": "Read two ints, print their sum.",
            "languages": ["python"],
            "starter_code": "",
            "sample_cases": [{"stdin": "1 2", "expected_stdout": "3"}],
            "hidden_cases": [{"stdin": "4 5", "expected_stdout": "9"}],
            "typed_questions": [{"id": "t1", "prompt": "Big-O?", "accepted": ["O(1)"]}],
            "cpu_seconds": 2,
            "wall_seconds": 5,
        }


class _FakeAttempts:
    def __init__(self):
        self.inserted = []

    async def insert(self, attempt):
        self.inserted.append(attempt)

    async def get_by_application(self, application_id):
        return None


class _FakePub:
    def __init__(self):
        self.events = []

    async def publish(self, key, payload):
        self.events.append((key, payload))


class _Hit:
    allowed = True
    retry_after = 0


class _FakeLimiter:
    async def hit(self, key, limit, window):
        return _Hit()


def _app(candidate_user_id="cand"):
    grpc_app = GrpcWebASGI()
    coding_pb2_grpc.add_CodingServiceServicer_to_server(
        CodingServicer(
            applications=_FakeApps(candidate_user_id),
            tasks=_FakeTasks(),
            attempts=_FakeAttempts(),
            publisher=_FakePub(),
            limiter=_FakeLimiter(),
            tokens=TokenService(_SECRET),
        ),
        grpc_app,
    )
    return grpc_app


def _frame(b):
    return b"\x00" + struct.pack(">I", len(b)) + b


def _ds(body):
    data, status, i = None, None, 0
    while i + 5 <= len(body):
        flag = body[i]
        (n,) = struct.unpack(">I", body[i + 1 : i + 5])
        p = body[i + 5 : i + 5 + n]
        if flag & 0x80:
            for line in p.decode().replace("\r\n", "\n").splitlines():
                if line.startswith("grpc-status:"):
                    status = int(line.split(":", 1)[1])
        else:
            data = p
        i += 5 + n
    return data, status


async def _call(app, method, req, *, metadata=None):
    transport = httpx.ASGITransport(app=app)
    headers = {"content-type": "application/grpc-web+proto", **(metadata or {})}
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        return await client.post(
            f"{_SVC}/{method}", content=_frame(req.SerializeToString()), headers=headers
        )


def _candidate(sub="cand"):
    token = TokenService(_SECRET).access_token(sub, "candidate", "", "")
    return {"authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_get_task_requires_auth():
    resp = await _call(
        _app(), "GetCodingTask", coding_pb2.GetCodingTaskRequest(application_id="a1")
    )
    _, status = _ds(resp.content)
    assert status == 16  # UNAUTHENTICATED


@pytest.mark.asyncio
async def test_get_task_rejects_non_owner():
    resp = await _call(
        _app(candidate_user_id="someone_else"),
        "GetCodingTask",
        coding_pb2.GetCodingTaskRequest(application_id="a1"),
        metadata=_candidate(sub="cand"),
    )
    _, status = _ds(resp.content)
    assert status == 7  # PERMISSION_DENIED — not the owner


@pytest.mark.asyncio
async def test_get_task_hides_hidden_cases_over_the_wire():
    resp = await _call(
        _app(),
        "GetCodingTask",
        coding_pb2.GetCodingTaskRequest(application_id="a1"),
        metadata=_candidate(),
    )
    data, status = _ds(resp.content)
    assert status == 0
    out = coding_pb2.CodingTask.FromString(data)
    assert [c.stdin for c in out.sample_cases] == ["1 2"]  # sample only
    assert out.typed_questions[0].id == "t1"


@posix_only
@pytest.mark.asyncio
async def test_submit_correct_solution_passes_end_to_end():
    # Real execution: a correct Python solution passes the hidden case + typed answer.
    resp = await _call(
        _app(),
        "SubmitCoding",
        coding_pb2.SubmitCodingRequest(
            application_id="a1",
            language="python",
            source="print(sum(map(int, input().split())))",
            typed_answers=[coding_pb2.TypedAnswer(id="t1", answer="O(1)")],
        ),
        metadata=_candidate(),
    )
    data, status = _ds(resp.content)
    assert status == 0
    out = coding_pb2.SubmitResult.FromString(data)
    assert out.passed is True
    assert out.cases_passed == 1 and out.cases_total == 1
    assert out.typed_correct == 1 and out.typed_total == 1
