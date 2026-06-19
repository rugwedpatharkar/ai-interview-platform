from fastapi.testclient import TestClient
from lib.security import TokenService

from app.model.interview import (
    CompetencyArea,
    InterviewBlueprint,
    InterviewSession,
    InterviewTurnDecision,
)
from app.routes.interview_api import create_app

_SECRET = "test-secret"


def _token(user_id):
    return TokenService(secret=_SECRET).access_token(user_id, "candidate", None, "j1")


def _setup():
    return {
        "comp_id": "c1",
        "job_id": "j1",
        "candidate_user_id": "u1",
        "jd_text": "Backend role",
        "profile": {"headline": "Eng", "skills": ["python"]},
        "state": "interview_pending",
    }


def _deps(fake_data, fake_sessions, fake_publisher, llm, *, setup=None, sessions=None):
    return {
        "tokens": TokenService(secret=_SECRET),
        "data": fake_data(interview_setup=setup),
        "sessions": sessions if sessions is not None else fake_sessions(),
        "publisher": fake_publisher(),
        "llm": llm,
    }


def test_start_requires_auth(fake_data, fake_sessions, fake_publisher, fake_llm):
    deps = _deps(
        fake_data, fake_sessions, fake_publisher, fake_llm(None), setup=_setup()
    )
    client = TestClient(create_app(deps))
    assert client.post("/interview/a1/start").status_code == 401


def test_start_returns_first_question(
    fake_data, fake_sessions, fake_publisher, fake_llm_by_schema
):
    blueprint = InterviewBlueprint(competencies=[CompetencyArea(name="python")])
    first = InterviewTurnDecision(done=False, question="Explain async")
    llm = fake_llm_by_schema(
        {InterviewBlueprint: blueprint, InterviewTurnDecision: first}
    )
    deps = _deps(fake_data, fake_sessions, fake_publisher, llm, setup=_setup())
    client = TestClient(create_app(deps))
    resp = client.post(
        "/interview/a1/start", headers={"Authorization": f"Bearer {_token('u1')}"}
    )
    assert resp.status_code == 200
    assert resp.json()["question"] == "Explain async"


def test_start_rejects_non_owner(fake_data, fake_sessions, fake_publisher, fake_llm):
    deps = _deps(
        fake_data, fake_sessions, fake_publisher, fake_llm(None), setup=_setup()
    )
    client = TestClient(create_app(deps))
    resp = client.post(
        "/interview/a1/start",
        headers={"Authorization": f"Bearer {_token('intruder')}"},
    )
    assert resp.status_code == 403


def test_turn_advances(fake_data, fake_sessions, fake_publisher, fake_llm_by_schema):
    sessions = fake_sessions()
    sessions.saved["a1"] = InterviewSession(
        application_id="a1",
        comp_id="c1",
        candidate_user_id="u1",
        current_question="Q1",
        blueprint=InterviewBlueprint(competencies=[CompetencyArea(name="python")]),
    )
    llm = fake_llm_by_schema(
        {InterviewTurnDecision: InterviewTurnDecision(done=False, question="Q2")}
    )
    deps = _deps(fake_data, fake_sessions, fake_publisher, llm, sessions=sessions)
    client = TestClient(create_app(deps))
    resp = client.post(
        "/interview/a1/turn",
        json={"answer": "my answer"},
        headers={"Authorization": f"Bearer {_token('u1')}"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"done": False, "question": "Q2"}


def test_turn_rejects_empty_answer(fake_data, fake_sessions, fake_publisher, fake_llm):
    sessions = fake_sessions()
    sessions.saved["a1"] = InterviewSession(
        application_id="a1",
        comp_id="c1",
        candidate_user_id="u1",
        current_question="Q1",
        blueprint=InterviewBlueprint(competencies=[CompetencyArea(name="python")]),
    )
    deps = _deps(
        fake_data, fake_sessions, fake_publisher, fake_llm(None), sessions=sessions
    )
    client = TestClient(create_app(deps))
    resp = client.post(
        "/interview/a1/turn",
        json={"answer": "   "},
        headers={"Authorization": f"Bearer {_token('u1')}"},
    )
    assert resp.status_code == 400


def test_turn_rejects_oversized_answer(
    fake_data, fake_sessions, fake_publisher, fake_llm
):
    sessions = fake_sessions()
    sessions.saved["a1"] = InterviewSession(
        application_id="a1",
        comp_id="c1",
        candidate_user_id="u1",
        current_question="Q1",
        blueprint=InterviewBlueprint(competencies=[CompetencyArea(name="python")]),
    )
    deps = _deps(
        fake_data, fake_sessions, fake_publisher, fake_llm(None), sessions=sessions
    )
    client = TestClient(create_app(deps))
    resp = client.post(
        "/interview/a1/turn",
        json={"answer": "x" * 32_001},
        headers={"Authorization": f"Bearer {_token('u1')}"},
    )
    assert resp.status_code == 422


def test_jd_improve_rejects_oversized_brief(
    fake_data, fake_sessions, fake_publisher, fake_llm
):
    deps = _deps(fake_data, fake_sessions, fake_publisher, fake_llm(None))
    deps["settings"] = type(
        "S", (), {"livekit_api_key": None, "livekit_api_secret": None}
    )()
    recruiter_token = TokenService(secret=_SECRET).access_token(
        "u2", "recruiter", "c1", "j2"
    )
    client = TestClient(create_app(deps))
    resp = client.post(
        "/jd/improve",
        json={"brief": "x" * 16_001},
        headers={"Authorization": f"Bearer {recruiter_token}"},
    )
    assert resp.status_code == 422
