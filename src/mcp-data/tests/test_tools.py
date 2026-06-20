from bson import ObjectId

from app.tools import DataStore


class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs
        self.sorts = []

    def sort(self, field, direction):
        self.sorts.append((field, direction))
        return self

    async def to_list(self, length):
        return self._docs[:length]


class _FakeCollection:
    def __init__(self, find_result=None, find_list=None):
        self.find_result = find_result
        self.find_list = find_list or []
        self.updates = []
        self.queries = []
        self.inserted = []
        self.find_queries = []
        self.last_cursor = None

    async def update_one(self, filt, update, upsert=False):
        self.updates.append((filt, update, upsert))

    async def insert_many(self, docs):
        self.inserted.extend(docs)

    async def find_one(self, filt):
        self.queries.append(filt)
        return self.find_result

    def find(self, filt, projection=None):
        self.find_queries.append(filt)
        self.last_cursor = _FakeCursor(self.find_list)
        return self.last_cursor


class _FakeDB:
    def __init__(self, **cols):
        self._cols = cols

    def __getitem__(self, name):
        return self._cols[name]


def _store(**cols):
    for name in (
        "candidate_profiles",
        "jobs",
        "aptitude_banks",
        "interviews",
        "reports",
        "applications",
        "match_results",
        "job_question_plans",
        "proctoring_events",
        "practice_sessions",
    ):
        cols.setdefault(name, _FakeCollection())
    return DataStore(_FakeDB(**cols)), cols


async def test_save_proctoring_events_inserts_with_scope():
    store, cols = _store()
    n = await store.save_proctoring_events(
        "a1", "c1", [{"type": "second_face", "severity": "high", "at": "t"}]
    )
    assert n == 1
    doc = cols["proctoring_events"].inserted[0]
    assert doc["application_id"] == "a1" and doc["comp_id"] == "c1"
    assert doc["type"] == "second_face"


async def test_save_proctoring_events_empty_is_noop():
    store, cols = _store()
    assert await store.save_proctoring_events("a1", "c1", []) == 0
    assert cols["proctoring_events"].inserted == []


async def test_get_proctoring_events_reads_by_application_excluding_id():
    rows = [
        {"type": "tab_hidden", "severity": "low", "at": "t0"},
        {"type": "second_face", "severity": "high", "at": "t1"},
    ]
    store, cols = _store(proctoring_events=_FakeCollection(find_list=rows))
    result = await store.get_proctoring_events("a1")
    assert [e["type"] for e in result] == ["tab_hidden", "second_face"]
    assert cols["proctoring_events"].find_queries[0] == {"application_id": "a1"}


async def test_save_profile_upserts_and_marks_parsed():
    store, cols = _store()
    await store.save_profile("u1", {"headline": "Eng"})
    filt, update, upsert = cols["candidate_profiles"].updates[0]
    assert filt == {"user_id": "u1"}
    assert upsert is True
    assert update["$set"]["parsed"] is True


async def test_get_profile_queries_by_user_id():
    doc = {"user_id": "u1", "headline": "Eng"}
    store, cols = _store(candidate_profiles=_FakeCollection(find_result=doc))
    assert await store.get_profile("u1") == doc
    assert cols["candidate_profiles"].queries[0] == {"user_id": "u1"}


async def test_get_job_queries_by_objectid():
    oid = ObjectId()
    doc = {"_id": oid, "jd_text": "role"}
    store, cols = _store(jobs=_FakeCollection(find_result=doc))
    assert await store.get_job(str(oid)) == doc
    assert cols["jobs"].queries[0] == {"_id": oid}


async def test_get_job_invalid_id_returns_none():
    store, _ = _store()
    assert await store.get_job("not-an-objectid") is None


async def test_save_aptitude_bank_upserts_by_job_id():
    store, cols = _store()
    await store.save_aptitude_bank("j1", {"questions": []})
    filt, _, upsert = cols["aptitude_banks"].updates[0]
    assert filt == {"job_id": "j1"}
    assert upsert is True


async def test_get_aptitude_bank_reads_by_job_id():
    bank = {"job_id": "j1", "questions": []}
    store, cols = _store(aptitude_banks=_FakeCollection(find_result=bank))
    assert await store.get_aptitude_bank("j1") == bank
    assert cols["aptitude_banks"].queries[0] == {"job_id": "j1"}


async def test_get_interview_context_assembles_join():
    oid = ObjectId()
    interviews = _FakeCollection(
        find_result={
            "application_id": "a1",
            "job_id": str(oid),
            "user_id": "u1",
            "transcript": {"turns": []},
            "blueprint": {"competencies": []},
        }
    )
    jobs = _FakeCollection(find_result={"_id": oid, "jd_text": "Backend role"})
    profiles = _FakeCollection(find_result={"user_id": "u1", "headline": "Eng"})
    store, _ = _store(interviews=interviews, jobs=jobs, candidate_profiles=profiles)
    ctx = await store.get_interview_context("a1")
    assert ctx["jd_text"] == "Backend role"
    assert ctx["profile"]["headline"] == "Eng"


async def test_get_interview_context_missing_returns_none():
    store, _ = _store()
    assert await store.get_interview_context("missing") is None


async def test_get_interview_setup_assembles_join():
    oid = ObjectId()
    apps = _FakeCollection(
        find_result={
            "_id": ObjectId(),
            "comp_id": "c1",
            "job_id": str(oid),
            "candidate_user_id": "u1",
            "state": "interview_pending",
        }
    )
    jobs = _FakeCollection(find_result={"_id": oid, "jd_text": "Backend role"})
    profiles = _FakeCollection(find_result={"user_id": "u1", "headline": "Eng"})
    store, _ = _store(applications=apps, jobs=jobs, candidate_profiles=profiles)
    setup = await store.get_interview_setup(str(ObjectId()))
    assert setup["comp_id"] == "c1"
    assert setup["jd_text"] == "Backend role"
    assert setup["state"] == "interview_pending"


async def test_save_report_and_interview_upsert_by_application():
    store, cols = _store()
    await store.save_report("a1", {"recommendation": "advance"})
    await store.save_interview("a1", {"transcript": {}})
    assert cols["reports"].updates[0][0] == {"application_id": "a1"}
    assert cols["interviews"].updates[0][0] == {"application_id": "a1"}


async def test_save_and_get_question_plan():
    plan_col = _FakeCollection(find_result={"job_id": "j1", "competencies": []})
    store, cols = _store(job_question_plans=plan_col)
    await store.save_question_plan("j1", {"competencies": [{"name": "x"}]})
    filt, _, upsert = cols["job_question_plans"].updates[0]
    assert filt == {"job_id": "j1"}
    assert upsert is True
    assert await store.get_question_plan("j1") == {"job_id": "j1", "competencies": []}


async def test_save_practice_summary_upserts_by_user_and_practice():
    store, cols = _store()
    await store.save_practice_summary(
        "u1", {"practice_id": "p1", "role_label": "Backend"}
    )
    filt, update, upsert = cols["practice_sessions"].updates[0]
    # Keyed by (user_id, practice_id) — never comp_id (the detached invariant).
    assert filt == {"user_id": "u1", "practice_id": "p1"}
    assert upsert is True
    assert update["$set"]["user_id"] == "u1"
    assert update["$set"]["role_label"] == "Backend"


async def test_get_practice_summary_reads_by_user_and_practice():
    doc = {"user_id": "u1", "practice_id": "p1", "feedback": {}}
    store, cols = _store(practice_sessions=_FakeCollection(find_result=doc))
    assert await store.get_practice_summary("u1", "p1") == doc
    assert cols["practice_sessions"].queries[0] == {
        "user_id": "u1",
        "practice_id": "p1",
    }


async def test_list_practice_summaries_owner_scoped_recent_first():
    rows = [{"practice_id": "p2"}, {"practice_id": "p1"}]
    col = _FakeCollection(find_list=rows)
    store, _ = _store(practice_sessions=col)
    assert await store.list_practice_summaries("u1") == rows
    assert col.find_queries[0] == {"user_id": "u1"}
    assert col.last_cursor.sorts == [("created_at", -1)]
