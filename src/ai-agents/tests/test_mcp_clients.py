import pytest

from app.infra.mcp_capability import McpCapability
from app.infra.mcp_data import McpDataGateway
from app.infra.mcp_result import unwrap


class _Result:
    """Mimics FastMCP's CallToolResult (value wrapped in structured_content.result)."""

    def __init__(self, value=None, *, is_error=False):
        self.structured_content = {"result": value}
        self.is_error = is_error
        self.content = []


class _NoStructured:
    is_error = False
    structured_content = None


def test_unwrap_raises_on_missing_structured_content():
    # A malformed tool response (no structured content) must NOT read as None/"not
    # found" — that could skip an idempotency-guarded re-run. It is a tool error.
    with pytest.raises(RuntimeError):
        unwrap(_NoStructured())


class _FakeSession:
    def __init__(self, returns=None, error_tools=()):
        self.returns = returns or {}
        self.error_tools = set(error_tools)
        self.calls = []

    async def call_tool(self, name, args):
        self.calls.append((name, args))
        if name in self.error_tools:
            return _Result(is_error=True)
        return _Result(self.returns.get(name))


async def test_save_profile_calls_tool_with_args():
    session = _FakeSession()
    await McpDataGateway(session).save_profile("u1", {"headline": "Eng"})
    assert session.calls == [
        ("save_profile", {"user_id": "u1", "profile": {"headline": "Eng"}})
    ]


async def test_get_job_unwraps_structured_result():
    session = _FakeSession(returns={"get_job": {"jd_text": "role"}})
    job = await McpDataGateway(session).get_job("j1")
    assert job == {"jd_text": "role"}
    assert session.calls[0] == ("get_job", {"job_id": "j1"})


async def test_get_job_none_result():
    session = _FakeSession(returns={"get_job": None})
    assert await McpDataGateway(session).get_job("j1") is None


async def test_tool_error_raises_not_swallowed():
    # A tool that raised server-side (isError) must surface as an exception so the
    # Consumer dead-letters it — not look like a None ("not found") result.
    session = _FakeSession(error_tools={"get_job"})
    with pytest.raises(RuntimeError):
        await McpDataGateway(session).get_job("j1")


async def test_get_profile_unwraps():
    session = _FakeSession(returns={"get_profile": {"headline": "Eng"}})
    assert await McpDataGateway(session).get_profile("u1") == {"headline": "Eng"}
    assert session.calls[0] == ("get_profile", {"user_id": "u1"})


async def test_get_interview_context_unwraps():
    ctx = {"jd_text": "x", "profile": {}, "transcript": {}, "blueprint": {}}
    session = _FakeSession(returns={"get_interview_context": ctx})
    assert await McpDataGateway(session).get_interview_context("a1") == ctx


async def test_save_report_and_interview_call_tools():
    session = _FakeSession()
    gw = McpDataGateway(session)
    await gw.save_report("a1", {"x": 1})
    await gw.save_interview("a1", {"y": 2})
    assert [c[0] for c in session.calls] == ["save_report", "save_interview"]


async def test_capability_parse_document_unwraps_text():
    session = _FakeSession(returns={"parse_document": "extracted text"})
    text = await McpCapability(session).parse_document(
        "u1/resumes/u1/r.pdf", owner="u1"
    )
    assert text == "extracted text"
    assert session.calls[0] == (
        "parse_document",
        {"object_key": "u1/resumes/u1/r.pdf", "owner": "u1"},
    )


async def test_capability_embed_forwards_and_unwraps():
    session = _FakeSession(returns={"embed": [[1.0, 2.0]]})
    vectors = await McpCapability(session).embed(["hello"])
    assert vectors == [[1.0, 2.0]]
    assert session.calls[0] == ("embed", {"texts": ["hello"]})


async def test_capability_kb_search_forwards_and_unwraps():
    payload = {"chunks": ["c"], "citations": [{"url": "u", "topic": "python"}]}
    session = _FakeSession(returns={"kb_search": payload})
    out = await McpCapability(session).kb_search("q", "python", "comp1", k=3)
    assert out == payload
    assert session.calls[0] == (
        "kb_search",
        {"query": "q", "topic": "python", "owner": "comp1", "k": 3},
    )


async def test_capability_ingest_forwards_and_unwraps():
    session = _FakeSession(returns={"ingest": {"ingested": 2, "skipped": 1}})
    out = await McpCapability(session).ingest("t1", [{"topic": "python", "url": "u"}])
    assert out == {"ingested": 2, "skipped": 1}
    assert session.calls[0] == (
        "ingest",
        {"owner": "t1", "sources": [{"topic": "python", "url": "u"}]},
    )


async def test_save_match_result_forwards_args():
    session = _FakeSession()
    await McpDataGateway(session).save_match_result("c1", "j1", "u1", 0.8, ["fit"])
    assert session.calls[0] == (
        "save_match_result",
        {
            "comp_id": "c1",
            "job_id": "j1",
            "candidate_user_id": "u1",
            "score": 0.8,
            "reasons": ["fit"],
        },
    )


async def test_get_match_results_forwards_and_unwraps():
    rows = [{"job_id": "j1", "candidate_user_id": "u1", "score": 0.8}]
    session = _FakeSession(returns={"get_match_results": rows})
    out = await McpDataGateway(session).get_match_results(job_id="j1")
    assert out == rows
    assert session.calls[0] == (
        "get_match_results",
        {"job_id": "j1", "candidate_user_id": ""},
    )


async def test_save_question_plan_forwards_args():
    session = _FakeSession()
    await McpDataGateway(session).save_question_plan("j1", {"competencies": []})
    assert session.calls[0] == (
        "save_question_plan",
        {"job_id": "j1", "plan": {"competencies": []}},
    )


async def test_get_question_plan_forwards_and_unwraps():
    plan = {"job_id": "j1", "competencies": []}
    session = _FakeSession(returns={"get_question_plan": plan})
    assert await McpDataGateway(session).get_question_plan("j1") == plan
    assert session.calls[0] == ("get_question_plan", {"job_id": "j1"})


async def test_list_applicants_forwards_scope():
    session = _FakeSession(returns={"list_applicants": [{"state": "applied"}]})
    scope = {"role": "recruiter", "comp_id": "c1", "user_id": "r1"}
    out = await McpDataGateway(session).list_applicants(scope, "j1")
    assert out == [{"state": "applied"}]
    assert session.calls[0] == ("list_applicants", {"scope": scope, "job_id": "j1"})


async def test_get_application_status_forwards_scope():
    session = _FakeSession(returns={"get_application_status": {"state": "scored"}})
    scope = {"role": "candidate", "comp_id": None, "user_id": "u1"}
    out = await McpDataGateway(session).get_application_status(scope, "a1")
    assert out == {"state": "scored"}
    assert session.calls[0] == (
        "get_application_status",
        {"scope": scope, "application_id": "a1"},
    )
