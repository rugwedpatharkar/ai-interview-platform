"""Practice REST app — over-the-wire via httpx.ASGITransport.

The one REST surface on ai-agents post-G6: authenticates the candidate token, drives the
detached practice resources, maps domain errors to HTTP status. Asserts the detached
invariant at the wire (no comp_id/application_id in any payload).
"""

import httpx
from lib.security import TokenService

from app.model.interview import (
    CompetencyArea,
    InterviewBlueprint,
    InterviewTurnDecision,
)
from app.model.practice import GrowthFeedback, PracticeSession
from app.resources.practice import _SynthJD
from app.routes.practice_api import create_practice_app

_SECRET = "test-secret"


def _token(user_id, role="candidate"):
    return TokenService(secret=_SECRET).access_token(user_id, role, None, "j1")


def _auth(user_id, **kw):
    return {"authorization": f"Bearer {_token(user_id, **kw)}"}


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
    return create_practice_app(
        {
            "tokens": TokenService(secret=_SECRET),
            "data": data or _FakeData(),
            "practice_sessions": sessions or _FakeSessions(),
            "llm": llm or _SchemaLLM({}),
            "cors_origins": ["http://fe"],
        }
    )


async def _req(app, method, url, **kw):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        return await client.request(method, url, **kw)


async def test_start_topic_returns_practice_id_and_question():
    sessions = _FakeSessions()
    llm = _SchemaLLM(
        {
            _SynthJD: _SynthJD(jd_text="A role."),
            InterviewBlueprint: _blueprint(),
            InterviewTurnDecision: InterviewTurnDecision(question="Q1?"),
        }
    )
    app = _app(sessions=sessions, llm=llm)
    resp = await _req(
        app, "POST", "/practice/start", json={"topic": "Backend"}, headers=_auth("u1")
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["question"] == "Q1?" and body["practice_id"]
    # Detached at the wire: the response carries no funnel identifiers.
    assert set(body) == {"practice_id", "question"}


async def test_start_requires_exactly_one_source_400():
    app = _app()
    resp = await _req(app, "POST", "/practice/start", json={}, headers=_auth("u1"))
    assert resp.status_code == 400


async def test_start_requires_auth_401():
    app = _app()
    resp = await _req(app, "POST", "/practice/start", json={"topic": "x"})
    assert resp.status_code == 401


async def test_turn_advances_to_next_question():
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
    app = _app(sessions=sessions, llm=llm)
    resp = await _req(
        app, "POST", "/practice/p1/turn", json={"answer": "ans"}, headers=_auth("u1")
    )
    assert resp.status_code == 200
    assert resp.json() == {"done": False, "question": "Q2?"}


async def test_turn_blank_answer_422():
    sessions = _FakeSessions()
    await sessions.save(
        PracticeSession(practice_id="p1", user_id="u1", blueprint=_blueprint())
    )
    app = _app(sessions=sessions)
    resp = await _req(
        app, "POST", "/practice/p1/turn", json={"answer": ""}, headers=_auth("u1")
    )
    assert resp.status_code == 422  # pydantic min_length boundary


async def test_turn_another_users_session_403():
    sessions = _FakeSessions()
    await sessions.save(
        PracticeSession(practice_id="p1", user_id="owner", blueprint=_blueprint())
    )
    app = _app(sessions=sessions)
    resp = await _req(
        app,
        "POST",
        "/practice/p1/turn",
        json={"answer": "a"},
        headers=_auth("intruder"),
    )
    assert resp.status_code == 403


async def test_feedback_returns_summary_and_409_while_finalizing():
    sessions = _FakeSessions()
    summary = {
        "user_id": "u1",
        "practice_id": "p1",
        "evaluation_summary": "Practiced Backend.",
        "feedback": GrowthFeedback(summary="Good.").model_dump(),
    }
    data = _FakeData(summaries=[summary])
    app = _app(data=data, sessions=sessions)
    resp = await _req(app, "GET", "/practice/p1/feedback", headers=_auth("u1"))
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {"evaluation_summary", "feedback"}
    assert body["feedback"]["summary"] == "Good."

    await sessions.save(
        PracticeSession(practice_id="p2", user_id="u1", status="in_progress")
    )
    resp2 = await _req(app, "GET", "/practice/p2/feedback", headers=_auth("u1"))
    assert resp2.status_code == 409


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
    app = _app(data=data)
    resp = await _req(app, "GET", "/practice/sessions", headers=_auth("u1"))
    assert resp.status_code == 200
    assert resp.json() == {
        "sessions": [{"practice_id": "p1", "role_label": "Backend", "created_at": "t1"}]
    }
