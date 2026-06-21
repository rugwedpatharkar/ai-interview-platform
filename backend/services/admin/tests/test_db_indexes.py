"""Admin is the single index authority — it declares indexes even for collections that
ai-agents/mcp-data write but never index themselves. Missing ones full-scan or race.
"""

from app.infra.db import INDEXES


def _has(collection, keys, *, unique=False):
    return any(
        s.collection == collection
        and s.keys == keys
        and bool(s.options.get("unique")) == unique
        for s in INDEXES
    )


def test_question_plan_unique_index_present():
    # get_question_plan reads by job_id on every interview start; unique hardens the
    # save_question_plan upsert against a duplicate plan under redelivery.
    assert _has("job_question_plans", "job_id", unique=True)


def test_interview_indexes_present():
    # get_interview_context reads by application_id (one transcript per app) and joins
    # the profile by user_id.
    assert _has("interviews", "application_id", unique=True)
    assert _has("interviews", "user_id")


def test_agent_written_collections_are_indexed_by_admin():
    for coll in (
        "aptitude_banks",
        "reports",
        "match_results",
        "interviews",
        "job_question_plans",
    ):
        assert any(s.collection == coll for s in INDEXES), coll
