"""PracticeService over gRPC-web — the detached candidate mock-interview surface.

Drives the real PracticeServicer through lib.grpcweb (no REST). Same coverage the old
/practice REST test had (auth, exactly-one source, ownership, finalize 409, owner-scoped
list), now as gRPC status codes.
"""

import struct

import httpx
import pytest
from lib.grpcweb import GrpcWebASGI
from lib.security import TokenService

from app.model.interview import (
    CompetencyArea,
    InterviewBlueprint,
    InterviewTurnDecision,
)
from app.model.practice import GrowthFeedback, PracticeSession
from app.resources.practice import _SynthJD
from app.routes.pb import practice_pb2, practice_pb2_grpc
from app.routes.practice import PracticeServicer

_SECRET = "test-secret"
_SVC = "/aiagents.practice.v1.PracticeService"


class _FakeSessions:
    def __init__(self):
        self.saved = {}

    async def save(self, session):
        self.saved[session.practice_id] = session

    async def get(self, practice_id):
        return self.saved.get(practice_id)


class _FakeData:
    def __init__(self, profile=None, summaries=None):
        self._profile = profile
        self.saved_summaries = []
        self._summaries = list(summaries or [])

    async def get_profile(self, user_id):
        return self._profile

    async def save_practice_summary(self, user_id, summary):
        self.saved_summaries.append((user_id, summary))

    async def get_practice_summary(self, user_id, practice_id):
        return next(
            (
                s
                for s in self._summaries
                if s["user_id"] == user_id and s["practice_id"] == practice_id
            ),
            None,
        )

    async def list_practice_summaries(self, user_id):
        return [s for s in self._summaries if s["user_id"] == user_id]


class _SchemaLLM:
    def __init__(self, mapping):
        self._mapping = mapping

    async def structured(self, prompt, schema):
        return self._mapping[schema]


def _blueprint():
    return InterviewBlueprint(
        competencies=[CompetencyArea(name="Python")], time_budget_min=30
    )


def _app(*, data=None, sessions=None, llm=None):
    grpc_app = GrpcWebASGI()
    practice_pb2_grpc.add_PracticeServiceServicer_to_server(
        PracticeServicer(
            tokens=TokenService(secret=_SECRET),
            data=data or _FakeData(),
            sessions=sessions or _FakeSessions(),
            llm=llm or _SchemaLLM({}),
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


def _auth(user_id, role="candidate"):
    token = TokenService(secret=_SECRET).access_token(user_id, role, None, "j1")
    return {"authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_start_returns_practice_id_and_question():
    llm = _SchemaLLM(
        {
            _SynthJD: _SynthJD(jd_text="A role."),
            InterviewBlueprint: _blueprint(),
            InterviewTurnDecision: InterviewTurnDecision(question="Q1?"),
        }
    )
    resp = await _call(
        _app(sessions=_FakeSessions(), llm=llm),
        "StartPractice",
        practice_pb2.StartPracticeRequest(topic="Backend"),
        metadata=_auth("u1"),
    )
    data, status = _ds(resp.content)
    assert status == 0
    out = practice_pb2.QuestionResponse.FromString(data)
    assert out.question == "Q1?" and out.practice_id


@pytest.mark.asyncio
async def test_start_requires_exactly_one_source():
    resp = await _call(
        _app(),
        "StartPractice",
        practice_pb2.StartPracticeRequest(),
        metadata=_auth("u1"),
    )
    _, status = _ds(resp.content)
    assert status == 3  # INVALID_ARGUMENT


@pytest.mark.asyncio
async def test_start_requires_auth():
    resp = await _call(
        _app(), "StartPractice", practice_pb2.StartPracticeRequest(topic="x")
    )
    _, status = _ds(resp.content)
    assert status == 16  # UNAUTHENTICATED


@pytest.mark.asyncio
async def test_turn_advances():
    sessions = _FakeSessions()
    await sessions.save(
        PracticeSession(
            practice_id="p1",
            user_id="u1",
            blueprint=_blueprint(),
            current_question="Q1?",
        )
    )
    llm = _SchemaLLM(
        {InterviewTurnDecision: InterviewTurnDecision(done=False, question="Q2?")}
    )
    resp = await _call(
        _app(sessions=sessions, llm=llm),
        "SubmitPracticeTurn",
        practice_pb2.SubmitPracticeTurnRequest(practice_id="p1", answer="ans"),
        metadata=_auth("u1"),
    )
    data, status = _ds(resp.content)
    assert status == 0
    out = practice_pb2.TurnResponse.FromString(data)
    assert out.done is False and out.question == "Q2?"


@pytest.mark.asyncio
async def test_turn_blank_answer_invalid_argument():
    sessions = _FakeSessions()
    await sessions.save(
        PracticeSession(practice_id="p1", user_id="u1", blueprint=_blueprint())
    )
    resp = await _call(
        _app(sessions=sessions),
        "SubmitPracticeTurn",
        practice_pb2.SubmitPracticeTurnRequest(practice_id="p1", answer="   "),
        metadata=_auth("u1"),
    )
    _, status = _ds(resp.content)
    assert status == 3  # INVALID_ARGUMENT (was 422 under Pydantic REST)


@pytest.mark.asyncio
async def test_turn_another_users_session_denied():
    sessions = _FakeSessions()
    await sessions.save(
        PracticeSession(practice_id="p1", user_id="owner", blueprint=_blueprint())
    )
    resp = await _call(
        _app(sessions=sessions),
        "SubmitPracticeTurn",
        practice_pb2.SubmitPracticeTurnRequest(practice_id="p1", answer="a"),
        metadata=_auth("intruder"),
    )
    _, status = _ds(resp.content)
    assert status == 7  # PERMISSION_DENIED


@pytest.mark.asyncio
async def test_feedback_returns_summary_then_finalizing_precondition():
    sessions = _FakeSessions()
    summary = {
        "user_id": "u1",
        "practice_id": "p1",
        "evaluation_summary": "Practiced Backend.",
        "feedback": GrowthFeedback(summary="Good.").model_dump(),
    }
    app = _app(data=_FakeData(summaries=[summary]), sessions=sessions)
    resp = await _call(
        app,
        "GetPracticeFeedback",
        practice_pb2.GetPracticeFeedbackRequest(practice_id="p1"),
        metadata=_auth("u1"),
    )
    data, status = _ds(resp.content)
    assert status == 0
    assert practice_pb2.PracticeFeedback.FromString(data).feedback.summary == "Good."
    # A still-finalizing own run is FAILED_PRECONDITION so the UI polls.
    await sessions.save(
        PracticeSession(practice_id="p2", user_id="u1", status="in_progress")
    )
    resp2 = await _call(
        app,
        "GetPracticeFeedback",
        practice_pb2.GetPracticeFeedbackRequest(practice_id="p2"),
        metadata=_auth("u1"),
    )
    _, status2 = _ds(resp2.content)
    assert status2 == 9  # FAILED_PRECONDITION


@pytest.mark.asyncio
async def test_sessions_list_owner_scoped():
    data = _FakeData(
        summaries=[
            {
                "user_id": "u1",
                "practice_id": "p1",
                "role_label": "Backend",
                "created_at": "t1",
            },
            {
                "user_id": "u2",
                "practice_id": "p9",
                "role_label": "X",
                "created_at": "t9",
            },
        ]
    )
    resp = await _call(
        _app(data=data),
        "ListPracticeSessions",
        practice_pb2.ListPracticeSessionsRequest(),
        metadata=_auth("u1"),
    )
    out = practice_pb2.PracticeSessionList.FromString(_ds(resp.content)[0])
    assert [s.practice_id for s in out.sessions] == ["p1"]
    assert out.sessions[0].role_label == "Backend"
