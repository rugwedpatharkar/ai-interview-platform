"""/interview/{id}/proctor: auth, ownership, typed catalog, canonical severity."""

from fastapi.testclient import TestClient
from lib.security import TokenService

from app.routes.interview_api import create_app

_SECRET = "test-secret"


def _token(user_id="u1"):
    return TokenService(secret=_SECRET).access_token(user_id, "candidate", None, "jti")


class _Sess:
    def __init__(self, owner="u1", comp="c1"):
        self.candidate_user_id = owner
        self.comp_id = comp


class _Sessions:
    def __init__(self, sess):
        self._s = sess

    async def get(self, application_id):
        return self._s


class _Data:
    def __init__(self):
        self.saved = []

    async def save_proctoring_events(self, application_id, comp_id, events):
        self.saved.append((application_id, comp_id, events))


def _client(sess=None, data=None):
    deps = {
        "tokens": TokenService(secret=_SECRET),
        "sessions": _Sessions(sess or _Sess()),
        "data": data or _Data(),
    }
    return TestClient(create_app(deps))


def test_proctor_requires_auth():
    resp = _client().post("/interview/a1/proctor", json={"events": []})
    assert resp.status_code == 401


def test_proctor_rejects_unknown_type():
    # An out-of-catalog type is rejected at the boundary (422), never persisted.
    resp = _client().post(
        "/interview/a1/proctor",
        json={"events": [{"type": "made_up", "at": "t"}]},
        headers={"Authorization": f"Bearer {_token()}"},
    )
    assert resp.status_code == 422


def test_proctor_rejects_non_owner():
    resp = _client(sess=_Sess(owner="someone_else")).post(
        "/interview/a1/proctor",
        json={"events": [{"type": "second_face", "at": "t"}]},
        headers={"Authorization": f"Bearer {_token('u1')}"},
    )
    assert resp.status_code == 403


def test_proctor_persists_with_canonical_severity():
    data = _Data()
    resp = _client(data=data).post(
        "/interview/a1/proctor",
        json={
            "events": [
                {"type": "second_face", "at": "t"},
                {"type": "tab_hidden", "at": "t"},
            ]
        },
        headers={"Authorization": f"Bearer {_token('u1')}"},
    )
    assert resp.status_code == 200
    assert resp.json()["accepted"] == 2
    application_id, comp_id, events = data.saved[0]
    assert (
        application_id == "a1" and comp_id == "c1"
    )  # comp_id from the session, not client
    sev = {e["type"]: e["severity"] for e in events}
    assert sev["second_face"] == "high" and sev["tab_hidden"] == "low"
