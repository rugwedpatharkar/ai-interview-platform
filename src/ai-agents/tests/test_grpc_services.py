"""ai-agents gRPC servicer tests — drive each servicer over the real GrpcWebASGI.

Mirrors the old test_interview_api cases but over gRPC-web: build the app via
create_grpc_app(deps) with the conftest fakes, POST a length-prefixed proto frame, and
assert the data frame + trailer grpc-status. This exercises proto (de)serialization, the
shared translator (incl. server-streaming for Chat), and the servicer logic together.
"""

import struct

import httpx
import jwt
import pytest
from lib.security import TokenService

from app.model.chat import AssistantAnswer, AssistantPlan
from app.model.interview import (
    CompetencyArea,
    InterviewBlueprint,
    InterviewSession,
    InterviewTurnDecision,
)
from app.model.jd import JdDraft
from app.routes.pb import chat_pb2, interview_pb2, jd_pb2
from app.routes.web import create_grpc_app

_SECRET = "test-secret"
_INTERVIEW = "/aiagents.interview.v1.InterviewService"
_CHAT = "/aiagents.chat.v1.ChatService"
_JD = "/aiagents.jd.v1.JdService"


def _token(user_id, role="candidate", comp_id=None):
    return TokenService(secret=_SECRET).access_token(user_id, role, comp_id, "j1")


def _auth(user_id, **kw):
    return {"authorization": f"Bearer {_token(user_id, **kw)}"}


def _settings(**over):
    base = {
        "max_proctor_events": 100,
        "max_chat_messages": 20,
        "livekit_api_key": None,
        "livekit_api_secret": None,
        "livekit_url": "",
        "voice_rtc_token_ttl_seconds": 900,
    }
    base.update(over)
    return type("S", (), base)()


def _app(*, data, sessions, llm, settings=None, capability=None, publisher=None):
    deps = {
        "tokens": TokenService(secret=_SECRET),
        "data": data,
        "sessions": sessions,
        "llm": llm,
        "publisher": publisher,
        "capability": capability,
        "settings": settings or _settings(),
    }
    return create_grpc_app(deps)


def _frame(b):
    return b"\x00" + struct.pack(">I", len(b)) + b


def _frames(body):
    out, i = [], 0
    while i + 5 <= len(body):
        flag = body[i]
        (n,) = struct.unpack(">I", body[i + 1 : i + 5])
        out.append((flag, body[i + 5 : i + 5 + n]))
        i += 5 + n
    return out


def _data_and_status(body):
    data, status = None, None
    for flag, payload in _frames(body):
        if flag & 0x80:
            for line in payload.decode().replace("\r\n", "\n").splitlines():
                if line.startswith("grpc-status:"):
                    status = int(line.split(":", 1)[1])
        else:
            data = payload
    return data, status


def _stream(body):
    data, status = [], None
    for flag, payload in _frames(body):
        if flag & 0x80:
            for line in payload.decode().replace("\r\n", "\n").splitlines():
                if line.startswith("grpc-status:"):
                    status = int(line.split(":", 1)[1])
        else:
            data.append(payload)
    return data, status


async def _call(app, path, request, *, metadata=None):
    transport = httpx.ASGITransport(app=app)
    headers = {"content-type": "application/grpc-web+proto", **(metadata or {})}
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        return await client.post(
            path, content=_frame(request.SerializeToString()), headers=headers
        )


def _setup():
    return {
        "comp_id": "c1",
        "job_id": "j1",
        "candidate_user_id": "u1",
        "jd_text": "Backend role",
        "profile": {"headline": "Eng", "skills": ["python"]},
        "state": "interview_pending",
    }


def _session():
    return InterviewSession(
        application_id="a1",
        comp_id="c1",
        candidate_user_id="u1",
        current_question="Q1",
        blueprint=InterviewBlueprint(competencies=[CompetencyArea(name="python")]),
    )


# --- InterviewService ----------------------------------------------------
@pytest.mark.asyncio
async def test_start_returns_first_question(
    fake_data, fake_sessions, fake_publisher, fake_llm_by_schema
):
    llm = fake_llm_by_schema(
        {
            InterviewBlueprint: InterviewBlueprint(
                competencies=[CompetencyArea(name="python")]
            ),
            InterviewTurnDecision: InterviewTurnDecision(
                done=False, question="Explain async"
            ),
        }
    )
    app = _app(
        data=fake_data(interview_setup=_setup()),
        sessions=fake_sessions(),
        publisher=fake_publisher(),
        llm=llm,
    )
    resp = await _call(
        app,
        f"{_INTERVIEW}/StartInterview",
        interview_pb2.StartInterviewRequest(application_id="a1"),
        metadata=_auth("u1"),
    )
    data, status = _data_and_status(resp.content)
    assert status == 0
    assert interview_pb2.QuestionResponse.FromString(data).question == "Explain async"


@pytest.mark.asyncio
async def test_start_requires_auth(fake_data, fake_sessions, fake_publisher, fake_llm):
    app = _app(
        data=fake_data(interview_setup=_setup()),
        sessions=fake_sessions(),
        publisher=fake_publisher(),
        llm=fake_llm(None),
    )
    resp = await _call(
        app,
        f"{_INTERVIEW}/StartInterview",
        interview_pb2.StartInterviewRequest(application_id="a1"),
    )
    _, status = _data_and_status(resp.content)
    assert status == 16  # UNAUTHENTICATED


@pytest.mark.asyncio
async def test_start_rejects_non_owner(
    fake_data, fake_sessions, fake_publisher, fake_llm
):
    app = _app(
        data=fake_data(interview_setup=_setup()),
        sessions=fake_sessions(),
        publisher=fake_publisher(),
        llm=fake_llm(None),
    )
    resp = await _call(
        app,
        f"{_INTERVIEW}/StartInterview",
        interview_pb2.StartInterviewRequest(application_id="a1"),
        metadata=_auth("intruder"),
    )
    _, status = _data_and_status(resp.content)
    assert status == 7  # PERMISSION_DENIED


@pytest.mark.asyncio
async def test_turn_advances(
    fake_data, fake_sessions, fake_publisher, fake_llm_by_schema
):
    sessions = fake_sessions()
    sessions.saved["a1"] = _session()
    llm = fake_llm_by_schema(
        {InterviewTurnDecision: InterviewTurnDecision(done=False, question="Q2")}
    )
    app = _app(
        data=fake_data(),
        sessions=sessions,
        publisher=fake_publisher(),
        llm=llm,
    )
    resp = await _call(
        app,
        f"{_INTERVIEW}/SubmitTurn",
        interview_pb2.SubmitTurnRequest(application_id="a1", answer="my answer"),
        metadata=_auth("u1"),
    )
    data, status = _data_and_status(resp.content)
    assert status == 0
    turn = interview_pb2.TurnResponse.FromString(data)
    assert (turn.done, turn.question) == (False, "Q2")


@pytest.mark.asyncio
async def test_turn_rejects_empty_answer(
    fake_data, fake_sessions, fake_publisher, fake_llm
):
    sessions = fake_sessions()
    sessions.saved["a1"] = _session()
    app = _app(
        data=fake_data(),
        sessions=sessions,
        publisher=fake_publisher(),
        llm=fake_llm(None),
    )
    resp = await _call(
        app,
        f"{_INTERVIEW}/SubmitTurn",
        interview_pb2.SubmitTurnRequest(application_id="a1", answer="   "),
        metadata=_auth("u1"),
    )
    _, status = _data_and_status(resp.content)
    assert status == 3  # INVALID_ARGUMENT


@pytest.mark.asyncio
async def test_turn_rejects_oversized_answer(
    fake_data, fake_sessions, fake_publisher, fake_llm
):
    sessions = fake_sessions()
    sessions.saved["a1"] = _session()
    app = _app(
        data=fake_data(),
        sessions=sessions,
        publisher=fake_publisher(),
        llm=fake_llm(None),
    )
    resp = await _call(
        app,
        f"{_INTERVIEW}/SubmitTurn",
        interview_pb2.SubmitTurnRequest(application_id="a1", answer="x" * 32_001),
        metadata=_auth("u1"),
    )
    _, status = _data_and_status(resp.content)
    assert status == 3  # INVALID_ARGUMENT


@pytest.mark.asyncio
async def test_proctor_records_events(fake_data, fake_sessions, fake_llm):
    sessions = fake_sessions()
    sessions.saved["a1"] = _session()
    data = fake_data()
    app = _app(data=data, sessions=sessions, llm=fake_llm(None))
    resp = await _call(
        app,
        f"{_INTERVIEW}/RecordProctorEvents",
        interview_pb2.ProctorEventsRequest(
            application_id="a1",
            events=[interview_pb2.ProctorEvent(type="tab_hidden", at="t0")],
        ),
        metadata=_auth("u1"),
    )
    data_bytes, status = _data_and_status(resp.content)
    assert status == 0
    assert interview_pb2.ProctorAccepted.FromString(data_bytes).accepted == 1
    assert len(data.saved_proctoring) == 1  # (application_id, comp_id, docs) recorded


@pytest.mark.asyncio
async def test_proctor_rejects_unknown_type(fake_data, fake_sessions, fake_llm):
    sessions = fake_sessions()
    sessions.saved["a1"] = _session()
    app = _app(data=fake_data(), sessions=sessions, llm=fake_llm(None))
    resp = await _call(
        app,
        f"{_INTERVIEW}/RecordProctorEvents",
        interview_pb2.ProctorEventsRequest(
            application_id="a1",
            events=[interview_pb2.ProctorEvent(type="not_a_real_event", at="t0")],
        ),
        metadata=_auth("u1"),
    )
    _, status = _data_and_status(resp.content)
    assert status == 3  # INVALID_ARGUMENT — unknown type fails pydantic Literal


@pytest.mark.asyncio
async def test_rtc_token_not_configured(fake_data, fake_sessions, fake_llm):
    sessions = fake_sessions()
    sessions.saved["a1"] = _session()
    app = _app(data=fake_data(), sessions=sessions, llm=fake_llm(None))
    resp = await _call(
        app,
        f"{_INTERVIEW}/RtcToken",
        interview_pb2.RtcTokenRequest(application_id="a1"),
        metadata=_auth("u1"),
    )
    _, status = _data_and_status(resp.content)
    assert status == 9  # FAILED_PRECONDITION — voice not configured


@pytest.mark.asyncio
async def test_rtc_token_rejects_non_owner(fake_data, fake_sessions, fake_llm):
    sessions = fake_sessions()
    sessions.saved["a1"] = _session()
    app = _app(data=fake_data(), sessions=sessions, llm=fake_llm(None))
    resp = await _call(
        app,
        f"{_INTERVIEW}/RtcToken",
        interview_pb2.RtcTokenRequest(application_id="a1"),
        metadata=_auth("intruder"),
    )
    _, status = _data_and_status(resp.content)
    assert status == 7  # PERMISSION_DENIED


# --- ChatService (server-streaming) --------------------------------------
@pytest.mark.asyncio
async def test_chat_streams_text_then_done(
    fake_data, fake_capability, fake_llm_by_schema
):
    llm = fake_llm_by_schema(
        {
            AssistantPlan: AssistantPlan(intent="chat"),
            AssistantAnswer: AssistantAnswer(text="hello"),
        }
    )
    app = _app(data=fake_data(), sessions=None, llm=llm, capability=fake_capability())
    resp = await _call(
        app,
        f"{_CHAT}/Chat",
        chat_pb2.ChatRequest(
            messages=[chat_pb2.ChatMessage(role="user", content="hi")]
        ),
        metadata=_auth("u1"),
    )
    frames, status = _stream(resp.content)
    assert status == 0
    events = [chat_pb2.ChatEvent.FromString(f) for f in frames]
    kinds = [e.WhichOneof("event") for e in events]
    assert "text" in kinds and kinds[-1] == "done"
    assert events[0].text == "hello"


@pytest.mark.asyncio
async def test_chat_requires_auth(fake_data, fake_capability, fake_llm):
    app = _app(
        data=fake_data(),
        sessions=None,
        llm=fake_llm(None),
        capability=fake_capability(),
    )
    resp = await _call(
        app,
        f"{_CHAT}/Chat",
        chat_pb2.ChatRequest(
            messages=[chat_pb2.ChatMessage(role="user", content="hi")]
        ),
    )
    _, status = _stream(resp.content)
    assert status == 16  # UNAUTHENTICATED — aborts before the stream opens


@pytest.mark.asyncio
async def test_chat_rejects_empty_messages(fake_data, fake_capability, fake_llm):
    app = _app(
        data=fake_data(),
        sessions=None,
        llm=fake_llm(None),
        capability=fake_capability(),
    )
    resp = await _call(
        app, f"{_CHAT}/Chat", chat_pb2.ChatRequest(messages=[]), metadata=_auth("u1")
    )
    _, status = _stream(resp.content)
    assert status == 3  # INVALID_ARGUMENT


@pytest.mark.asyncio
async def test_chat_planning_failure_yields_error_event(fake_data, fake_capability):
    class _BoomLLM:
        async def structured(self, prompt, schema):
            raise RuntimeError("planner down")

        async def stream(self, prompt):
            yield ""

    app = _app(
        data=fake_data(), sessions=None, llm=_BoomLLM(), capability=fake_capability()
    )
    resp = await _call(
        app,
        f"{_CHAT}/Chat",
        chat_pb2.ChatRequest(
            messages=[chat_pb2.ChatMessage(role="user", content="hi")]
        ),
        metadata=_auth("u1"),
    )
    frames, status = _stream(resp.content)
    assert status == 0  # stream still ends cleanly
    events = [chat_pb2.ChatEvent.FromString(f) for f in frames]
    assert [e.WhichOneof("event") for e in events] == ["error"]


# --- JdService -----------------------------------------------------------
@pytest.mark.asyncio
async def test_jd_improve_for_recruiter(fake_llm):
    app = _app(
        data=None,
        sessions=None,
        llm=fake_llm(JdDraft(jd_text="Polished JD", suggestions=["add salary"])),
    )
    resp = await _call(
        app,
        f"{_JD}/ImproveJd",
        jd_pb2.ImproveJdRequest(brief="we need a backend eng"),
        metadata=_auth("u2", role="recruiter", comp_id="c1"),
    )
    data, status = _data_and_status(resp.content)
    assert status == 0
    out = jd_pb2.JdResponse.FromString(data)
    assert out.jd_text == "Polished JD"
    assert list(out.suggestions) == ["add salary"]


@pytest.mark.asyncio
async def test_jd_rejects_candidate(fake_llm):
    app = _app(data=None, sessions=None, llm=fake_llm(None))
    resp = await _call(
        app,
        f"{_JD}/ImproveJd",
        jd_pb2.ImproveJdRequest(brief="hi"),
        metadata=_auth("u1", role="candidate"),
    )
    _, status = _data_and_status(resp.content)
    assert status == 7  # PERMISSION_DENIED


@pytest.mark.asyncio
async def test_jd_rejects_oversized_brief(fake_llm):
    app = _app(data=None, sessions=None, llm=fake_llm(None))
    resp = await _call(
        app,
        f"{_JD}/ImproveJd",
        jd_pb2.ImproveJdRequest(brief="x" * 16_001),
        metadata=_auth("u2", role="recruiter", comp_id="c1"),
    )
    _, status = _data_and_status(resp.content)
    assert status == 3  # INVALID_ARGUMENT


# --- behaviors ported from the deleted REST adapter tests (G6) -----------
@pytest.mark.asyncio
async def test_chat_streams_incremental_deltas_and_citation(fake_data, fake_capability):
    class _StreamingKbLLM:
        async def structured(self, prompt, schema):
            return AssistantPlan(intent="kb_search", query="asyncio")

        async def stream(self, prompt):
            for chunk in ["Hel", "lo", "!"]:
                yield chunk

    kb = {
        "asyncio": {
            "chunks": ["c"],
            "citations": [{"url": "doc://py", "topic": "asyncio"}],
        }
    }
    app = _app(
        data=fake_data(),
        sessions=None,
        llm=_StreamingKbLLM(),
        capability=fake_capability(kb=kb),
    )
    resp = await _call(
        app,
        f"{_CHAT}/Chat",
        chat_pb2.ChatRequest(
            messages=[chat_pb2.ChatMessage(role="user", content="explain asyncio")]
        ),
        metadata=_auth("u1"),
    )
    frames, status = _stream(resp.content)
    assert status == 0
    events = [chat_pb2.ChatEvent.FromString(f) for f in frames]
    texts = [e.text for e in events if e.WhichOneof("event") == "text"]
    assert texts == ["Hel", "lo", "!"]  # genuinely incremental, not one blob
    citations = [e.citation for e in events if e.WhichOneof("event") == "citation"]
    assert len(citations) == 1 and citations[0].url == "doc://py"
    assert events[-1].WhichOneof("event") == "done"


@pytest.mark.asyncio
async def test_chat_threads_scope_from_claims(
    fake_data, fake_capability, fake_llm_by_schema
):
    data = fake_data(application_status={"state": "interview_pending"})
    llm = fake_llm_by_schema(
        {
            AssistantPlan: AssistantPlan(intent="status", application_id="a1"),
            AssistantAnswer: AssistantAnswer(text="In review."),
        }
    )
    app = _app(data=data, sessions=None, llm=llm, capability=fake_capability())
    resp = await _call(
        app,
        f"{_CHAT}/Chat",
        chat_pb2.ChatRequest(
            messages=[chat_pb2.ChatMessage(role="user", content="status?")]
        ),
        metadata=_auth("r1", role="recruiter", comp_id="c1"),
    )
    _, status = _stream(resp.content)
    assert status == 0
    # Scope is read straight from the signed JWT claims and threaded to the data call —
    # tenant + role isolation enforced server-side, never trusted from the request body.
    assert data.status_calls == [
        ({"user_id": "r1", "role": "recruiter", "comp_id": "c1"}, "a1")
    ]


@pytest.mark.asyncio
async def test_chat_mid_stream_failure_emits_error_after_text(
    fake_data, fake_capability
):
    class _MidStreamFailLLM:
        async def structured(self, prompt, schema):
            return AssistantPlan(intent="chat")

        async def stream(self, prompt):
            yield "partial"
            raise RuntimeError("stream died")

    app = _app(
        data=fake_data(),
        sessions=None,
        llm=_MidStreamFailLLM(),
        capability=fake_capability(),
    )
    resp = await _call(
        app,
        f"{_CHAT}/Chat",
        chat_pb2.ChatRequest(
            messages=[chat_pb2.ChatMessage(role="user", content="hi")]
        ),
        metadata=_auth("u1"),
    )
    frames, status = _stream(resp.content)
    assert status == 0  # headers/stream already open; the failure is an in-stream event
    kinds = [chat_pb2.ChatEvent.FromString(f).WhichOneof("event") for f in frames]
    assert kinds == [
        "text",
        "error",
    ]  # partial delta, then a clean error, no false done


@pytest.mark.asyncio
async def test_chat_rejects_too_many_messages(fake_data, fake_capability, fake_llm):
    app = _app(
        data=fake_data(),
        sessions=None,
        llm=fake_llm(None),
        capability=fake_capability(),
    )
    msgs = [chat_pb2.ChatMessage(role="user", content="x") for _ in range(21)]
    resp = await _call(
        app, f"{_CHAT}/Chat", chat_pb2.ChatRequest(messages=msgs), metadata=_auth("u1")
    )
    _, status = _stream(resp.content)
    assert (
        status == 3
    )  # INVALID_ARGUMENT — capped before the planner (max_chat_messages=20)


@pytest.mark.asyncio
async def test_proctor_rejects_non_owner(fake_data, fake_sessions, fake_llm):
    sessions = fake_sessions()
    sessions.saved["a1"] = _session()  # owned by u1
    app = _app(data=fake_data(), sessions=sessions, llm=fake_llm(None))
    resp = await _call(
        app,
        f"{_INTERVIEW}/RecordProctorEvents",
        interview_pb2.ProctorEventsRequest(
            application_id="a1",
            events=[interview_pb2.ProctorEvent(type="second_face", at="t")],
        ),
        metadata=_auth("intruder"),
    )
    _, status = _data_and_status(resp.content)
    assert status == 7  # PERMISSION_DENIED


@pytest.mark.asyncio
async def test_proctor_assigns_canonical_severity(fake_data, fake_sessions, fake_llm):
    sessions = fake_sessions()
    sessions.saved["a1"] = _session()
    data = fake_data()
    app = _app(data=data, sessions=sessions, llm=fake_llm(None))
    resp = await _call(
        app,
        f"{_INTERVIEW}/RecordProctorEvents",
        interview_pb2.ProctorEventsRequest(
            application_id="a1",
            events=[
                interview_pb2.ProctorEvent(type="second_face", at="t"),
                interview_pb2.ProctorEvent(type="tab_hidden", at="t"),
            ],
        ),
        metadata=_auth("u1"),
    )
    data_bytes, status = _data_and_status(resp.content)
    assert status == 0
    assert interview_pb2.ProctorAccepted.FromString(data_bytes).accepted == 2
    application_id, comp_id, docs = data.saved_proctoring[0]
    assert (
        application_id == "a1" and comp_id == "c1"
    )  # comp_id from session, not client
    sev = {d["type"]: d["severity"] for d in docs}
    assert sev["second_face"] == "high" and sev["tab_hidden"] == "low"


def _voice_settings():
    return _settings(
        livekit_api_key="devkey",
        livekit_api_secret="s" * 32,
        livekit_url="ws://localhost:7880",
    )


@pytest.mark.asyncio
async def test_rtc_token_not_found_session(fake_data, fake_sessions, fake_llm):
    app = _app(
        data=fake_data(),
        sessions=fake_sessions(),
        llm=fake_llm(None),
        settings=_voice_settings(),
    )
    resp = await _call(
        app,
        f"{_INTERVIEW}/RtcToken",
        interview_pb2.RtcTokenRequest(application_id="a1"),
        metadata=_auth("u1"),
    )
    _, status = _data_and_status(resp.content)
    assert status == 5  # NOT_FOUND


@pytest.mark.asyncio
async def test_rtc_token_mints_for_owner(fake_data, fake_sessions, fake_llm):
    sessions = fake_sessions()
    sessions.saved["a1"] = _session()  # owned by u1
    app = _app(
        data=fake_data(),
        sessions=sessions,
        llm=fake_llm(None),
        settings=_voice_settings(),
    )
    resp = await _call(
        app,
        f"{_INTERVIEW}/RtcToken",
        interview_pb2.RtcTokenRequest(application_id="a1"),
        metadata=_auth("u1"),
    )
    data_bytes, status = _data_and_status(resp.content)
    assert status == 0
    out = interview_pb2.RtcTokenResponse.FromString(data_bytes)
    assert out.url == "ws://localhost:7880" and out.room == "interview-a1"
    claims = jwt.decode(out.token, "s" * 32, algorithms=["HS256"])
    assert claims["video"]["room"] == "interview-a1" and claims["sub"] == "u1"
