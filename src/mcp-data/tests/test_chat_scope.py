"""Chat-scope privacy boundary (§10.3): reads re-check tenant + role + relationship.

A recruiter sees only applicants to their own-comp jobs; a candidate sees only their
own application. Anything else returns empty/None, so chat never leaks others' PII.
"""

from bson import ObjectId

from app.tools import DataStore

_A1 = ObjectId()
_A2 = ObjectId()
_APPS = [
    {
        "_id": _A1,
        "comp_id": "c1",
        "job_id": "j1",
        "candidate_user_id": "u1",
        "state": "applied",
    },
    {
        "_id": _A2,
        "comp_id": "c2",
        "job_id": "j2",
        "candidate_user_id": "u2",
        "state": "scored",
    },
]


class _Cursor:
    def __init__(self, docs):
        self._docs = docs

    async def to_list(self, length=None):
        return self._docs


class _AppCollection:
    def __init__(self, docs):
        self._docs = docs

    def find(self, query, projection=None):
        return _Cursor(
            [d for d in self._docs if all(d.get(k) == v for k, v in query.items())]
        )

    async def find_one(self, query):
        return next(
            (d for d in self._docs if all(d.get(k) == v for k, v in query.items())),
            None,
        )


class _DB:
    def __init__(self, apps):
        self._apps = _AppCollection(apps)

    def __getitem__(self, name):
        return self._apps if name == "applications" else _AppCollection([])


def _store():
    return DataStore(_DB(_APPS))


async def test_recruiter_lists_own_comp_applicants():
    scope = {"role": "recruiter", "comp_id": "c1", "user_id": "r1"}
    out = await _store().list_applicants(scope, "j1")
    assert [a["candidate_user_id"] for a in out] == ["u1"]


async def test_candidate_cannot_list_applicants():
    scope = {"role": "candidate", "comp_id": None, "user_id": "u1"}
    assert await _store().list_applicants(scope, "j1") == []


async def test_recruiter_reads_own_comp_status():
    scope = {"role": "recruiter", "comp_id": "c1", "user_id": "r1"}
    status = await _store().get_application_status(scope, str(_A1))
    assert status["state"] == "applied"


async def test_recruiter_denied_cross_tenant_status():
    scope = {"role": "recruiter", "comp_id": "c1", "user_id": "r1"}
    assert await _store().get_application_status(scope, str(_A2)) is None


async def test_candidate_reads_own_status():
    scope = {"role": "candidate", "comp_id": None, "user_id": "u1"}
    status = await _store().get_application_status(scope, str(_A1))
    assert status["state"] == "applied"


async def test_candidate_denied_other_candidate_status():
    scope = {"role": "candidate", "comp_id": None, "user_id": "u1"}
    assert await _store().get_application_status(scope, str(_A2)) is None


async def test_manager_null_comp_cannot_list_applicants():
    # A recruiter token carrying no comp_id must not wildcard-match null-comp rows.
    scope = {"role": "recruiter", "comp_id": None, "user_id": "r9"}
    assert await _store().list_applicants(scope, "j1") == []


async def test_manager_null_comp_denied_status():
    scope = {"role": "recruiter", "comp_id": None, "user_id": "r9"}
    assert await _store().get_application_status(scope, str(_A1)) is None
