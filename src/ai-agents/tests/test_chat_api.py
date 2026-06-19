"""/chat/turn SSE: auth, scope derived from JWT claims, streamed cited answer."""

import json
import re

from fastapi.testclient import TestClient
from lib.security import TokenService

from app.model.chat import AssistantAnswer, AssistantPlan
from app.routes.interview_api import create_app

_SECRET = "test-secret"


def _token(user_id, role="candidate", comp_id=None):
    return TokenService(secret=_SECRET).access_token(user_id, role, comp_id, "jti")


def _deps(data, capability, llm):
    return {
        "tokens": TokenService(secret=_SECRET),
        "data": data,
        "capability": capability,
        "llm": llm,
        "cors_origins": ["http://fe"],
    }


def test_chat_requires_auth(fake_data, fake_capability, fake_llm):
    client = TestClient(
        create_app(_deps(fake_data(), fake_capability(), fake_llm(None)))
    )
    resp = client.post("/chat/turn", json={"messages": []})
    assert resp.status_code == 401


def test_chat_streams_text_and_citation(fake_data, fake_capability, fake_llm_by_schema):
    llm = fake_llm_by_schema(
        {
            AssistantPlan: AssistantPlan(intent="kb_search", query="asyncio"),
            AssistantAnswer: AssistantAnswer(text="Async awaits."),
        }
    )
    kb = {
        "asyncio": {
            "chunks": ["c"],
            "citations": [{"url": "doc://py", "topic": "asyncio"}],
        }
    }
    deps = _deps(fake_data(), fake_capability(kb=kb), llm)
    client = TestClient(create_app(deps))
    resp = client.post(
        "/chat/turn",
        json={"messages": [{"role": "user", "content": "explain asyncio"}]},
        headers={"Authorization": f"Bearer {_token('u1')}"},
    )
    assert resp.status_code == 200
    body = resp.text
    assert "event: text" in body
    assert "Async awaits." in body
    assert "event: citation" in body
    assert "doc://py" in body


def test_chat_threads_scope_from_claims(fake_data, fake_capability, fake_llm_by_schema):
    data = fake_data(application_status={"state": "interview_pending"})
    llm = fake_llm_by_schema(
        {
            AssistantPlan: AssistantPlan(intent="status", application_id="a1"),
            AssistantAnswer: AssistantAnswer(text="In review."),
        }
    )
    client = TestClient(create_app(_deps(data, fake_capability(), llm)))
    resp = client.post(
        "/chat/turn",
        json={"messages": [{"role": "user", "content": "status?"}]},
        headers={"Authorization": f"Bearer {_token('r1', 'recruiter', 'c1')}"},
    )
    assert resp.status_code == 200
    # Scope is read straight from the signed JWT claims and threaded to the data call.
    assert data.status_calls == [
        ({"user_id": "r1", "role": "recruiter", "comp_id": "c1"}, "a1")
    ]


def test_chat_rejects_empty_messages(fake_data, fake_capability, fake_llm):
    """An authenticated turn with no messages is a 400, not a degenerate LLM call."""
    client = TestClient(
        create_app(_deps(fake_data(), fake_capability(), fake_llm(None)))
    )
    resp = client.post(
        "/chat/turn",
        json={"messages": []},
        headers={"Authorization": f"Bearer {_token('u1')}"},
    )
    assert resp.status_code == 400


def test_chat_rejects_malformed_message(fake_data, fake_capability, fake_llm):
    """A message missing `content` is rejected at the boundary (422), never a 500."""
    client = TestClient(
        create_app(_deps(fake_data(), fake_capability(), fake_llm(None)))
    )
    resp = client.post(
        "/chat/turn",
        json={"messages": [{"role": "user"}]},
        headers={"Authorization": f"Bearer {_token('u1')}"},
    )
    assert resp.status_code == 422


def test_chat_rejects_too_many_messages(fake_data, fake_capability, fake_llm):
    """A flood of messages is capped before reaching the planner."""
    client = TestClient(
        create_app(_deps(fake_data(), fake_capability(), fake_llm(None)))
    )
    msgs = [{"role": "user", "content": "x"} for _ in range(51)]
    resp = client.post(
        "/chat/turn",
        json={"messages": msgs},
        headers={"Authorization": f"Bearer {_token('u1')}"},
    )
    assert resp.status_code == 400


class _StreamingLLM:
    """Routes to a plain chat answer, then streams it as several token deltas."""

    async def structured(self, prompt, schema):
        return AssistantPlan(intent="chat")

    async def stream(self, prompt):
        for chunk in ["Hel", "lo", "!"]:
            yield chunk


def test_chat_streams_incremental_text_deltas(fake_data, fake_capability):
    client = TestClient(
        create_app(_deps(fake_data(), fake_capability(), _StreamingLLM()))
    )
    resp = client.post(
        "/chat/turn",
        json={"messages": [{"role": "user", "content": "hi"}]},
        headers={"Authorization": f"Bearer {_token('u1')}"},
    )
    assert resp.status_code == 200
    deltas = [
        json.loads(m)["text"] for m in re.findall(r"event: text\ndata: (.+)", resp.text)
    ]
    assert len(deltas) == 3  # genuinely incremental, not a single blob
    assert "".join(deltas) == "Hello!"


class _BoomLLM:
    """An LLM seam that fails on the first call, standing in for a downstream outage."""

    async def structured(self, prompt, schema):
        raise RuntimeError("planner exploded")


def test_chat_assistant_failure_maps_to_502(fake_data, fake_capability):
    """A failing assistant turn is a clean 502 with no internal detail leaked."""
    client = TestClient(create_app(_deps(fake_data(), fake_capability(), _BoomLLM())))
    resp = client.post(
        "/chat/turn",
        json={"messages": [{"role": "user", "content": "hi"}]},
        headers={"Authorization": f"Bearer {_token('u1')}"},
    )
    assert resp.status_code == 502
    assert "planner exploded" not in resp.text


class _MidStreamFailLLM:
    """Streams one delta, then fails — exercises the mid-stream SSE error path."""

    async def structured(self, prompt, schema):
        return AssistantPlan(intent="chat")

    async def stream(self, prompt):
        yield "partial"
        raise RuntimeError("stream died")


def test_chat_mid_stream_failure_emits_error_event(fake_data, fake_capability):
    client = TestClient(
        create_app(_deps(fake_data(), fake_capability(), _MidStreamFailLLM()))
    )
    resp = client.post(
        "/chat/turn",
        json={"messages": [{"role": "user", "content": "hi"}]},
        headers={"Authorization": f"Bearer {_token('u1')}"},
    )
    assert resp.status_code == 200  # headers already sent; the failure is in-stream
    assert "event: text" in resp.text  # the partial delta arrived
    assert "event: error" in resp.text  # then a clean error frame
    assert "event: done" not in resp.text  # no false completion
    assert "stream died" not in resp.text  # internal detail not leaked


def test_chat_cors_preflight_allows_fe_origin(fake_data, fake_capability, fake_llm):
    # The SPAs call /chat/turn cross-origin with a Bearer token; the preflight must echo
    # the FE origin + allow the Authorization header (no CORS would block the browser).
    client = TestClient(
        create_app(_deps(fake_data(), fake_capability(), fake_llm(None)))
    )
    resp = client.options(
        "/chat/turn",
        headers={"Origin": "http://fe", "Access-Control-Request-Method": "POST"},
    )
    assert resp.status_code in (200, 204)
    assert resp.headers["access-control-allow-origin"] == "http://fe"
