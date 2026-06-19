"""MatchResultRepository reads: score-desc in the query (true top-N), comp-scoped.

The cap must be applied AFTER sorting by score, or with >cap candidates the genuine top
scorers (inserted late) would be truncated before the sort ever sees them.
"""

from app.infra.repositories.match_results import MatchResultRepository


class _Cursor:
    def __init__(self, docs):
        self._docs = docs
        self._limit = None

    def sort(self, key, direction):
        self._docs = sorted(
            self._docs, key=lambda d: d.get(key, 0), reverse=direction < 0
        )
        return self

    def limit(self, n):
        self._limit = n
        return self

    async def to_list(self, length=None):
        return self._docs if self._limit is None else self._docs[: self._limit]


class _Col:
    def __init__(self, docs):
        self._docs = docs

    def find(self, query):
        return _Cursor(
            [d for d in self._docs if all(d.get(k) == v for k, v in query.items())]
        )


class _DB:
    def __init__(self, docs):
        self._col = _Col(docs)

    def __getitem__(self, name):
        return self._col


async def test_list_by_job_returns_true_top_by_score_then_caps():
    # 250 rows; the top scorer is inserted LAST, so a cap-before-sort would drop it.
    docs = [
        {"job_id": "j1", "comp_id": "c1", "candidate_user_id": f"u{i}", "score": i}
        for i in range(250)
    ]
    repo = MatchResultRepository(_DB(docs))
    out = await repo.list_by_job("j1", "c1")
    assert len(out) == 200
    assert out[0]["candidate_user_id"] == "u249"  # genuine top scorer survived the cap


async def test_list_by_job_is_comp_scoped():
    docs = [
        {"job_id": "j1", "comp_id": "c1", "candidate_user_id": "u1", "score": 0.5},
        {"job_id": "j1", "comp_id": "c2", "candidate_user_id": "u9", "score": 0.9},
    ]
    repo = MatchResultRepository(_DB(docs))
    out = await repo.list_by_job("j1", "c1")
    assert [r["candidate_user_id"] for r in out] == ["u1"]  # the c2 row is invisible


async def test_list_by_candidate_sorted_by_score_desc():
    docs = [
        {"job_id": "j1", "comp_id": "c1", "candidate_user_id": "u1", "score": 0.3},
        {"job_id": "j2", "comp_id": "c1", "candidate_user_id": "u1", "score": 0.8},
    ]
    repo = MatchResultRepository(_DB(docs))
    out = await repo.list_by_candidate("u1")
    assert [r["score"] for r in out] == [0.8, 0.3]
