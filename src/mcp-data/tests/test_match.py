"""match_results: idempotent upsert keyed (job, candidate) + filtered reads."""

from app.tools import DataStore


class _Cursor:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, key, direction):
        self._docs = sorted(
            self._docs, key=lambda d: d.get(key, 0), reverse=direction < 0
        )
        return self

    async def to_list(self, length=None):
        return self._docs


class _Result:
    def __init__(self, upserted_id):
        self.upserted_id = upserted_id


class _MatchCollection:
    def __init__(self):
        self.docs = {}

    async def update_one(self, filt, update, upsert=False):
        key = (filt["job_id"], filt["candidate_user_id"])
        new = key not in self.docs
        self.docs[key] = update["$set"]
        return _Result("oid" if new else None)

    def find(self, query, projection=None):
        return _Cursor(
            [
                d
                for d in self.docs.values()
                if all(d.get(k) == v for k, v in query.items())
            ]
        )


class _FakeDB:
    def __init__(self, match):
        self._match = match

    def __getitem__(self, name):
        return self._match if name == "match_results" else _MatchCollection()


def _store():
    return DataStore(_FakeDB(_MatchCollection()))


async def test_save_match_result_is_idempotent():
    store = _store()
    assert await store.save_match_result("c1", "j1", "u1", 0.7, ["a"]) is True
    assert await store.save_match_result("c1", "j1", "u1", 0.9, ["b"]) is False
    rows = await store.get_match_results(job_id="j1")
    assert len(rows) == 1
    assert rows[0]["score"] == 0.9  # second write still updates, just doesn't re-emit


async def test_get_match_results_filters_by_job_and_candidate():
    store = _store()
    await store.save_match_result("c1", "j1", "u1", 0.7, [])
    await store.save_match_result("c1", "j2", "u1", 0.8, [])
    await store.save_match_result("c1", "j1", "u2", 0.6, [])
    by_candidate = await store.get_match_results(candidate_user_id="u1")
    assert {r["job_id"] for r in by_candidate} == {"j1", "j2"}
    by_job = await store.get_match_results(job_id="j1")
    assert {r["candidate_user_id"] for r in by_job} == {"u1", "u2"}


async def test_get_match_results_sorted_by_score_desc():
    store = _store()
    await store.save_match_result("c1", "j1", "u1", 0.3, [])
    await store.save_match_result("c1", "j1", "u2", 0.9, [])
    await store.save_match_result("c1", "j1", "u3", 0.6, [])
    rows = await store.get_match_results(job_id="j1")
    assert [r["score"] for r in rows] == [0.9, 0.6, 0.3]
