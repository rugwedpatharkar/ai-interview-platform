from typing import Any

from lib.mongodb import IndexSpec

# Indexes required for correctness + scale (idempotent). The unique users.email
# index is the real guard against duplicate registration under concurrency. admin is the
# single index authority: it also declares indexes for collections written by
# ai-agents/mcp-data (aptitude_banks, reports, match_results, interviews,
# job_question_plans), which never manage their own.
INDEXES: list[IndexSpec] = [
    IndexSpec("users", "email", {"unique": True}),
    IndexSpec("users", "comp_id"),
    IndexSpec("companies", "created_at"),
    IndexSpec("candidate_profiles", "user_id", {"unique": True}),
    IndexSpec("jobs", "comp_id"),
    IndexSpec("applications", [("comp_id", 1), ("job_id", 1)]),
    IndexSpec("applications", "candidate_user_id"),
    IndexSpec(
        "applications",
        [("job_id", 1), ("candidate_user_id", 1)],
        {"unique": True},
    ),
    # aptitude_banks is written by ai-agents (one per job); admin owns the index.
    IndexSpec("aptitude_banks", "job_id", {"unique": True}),
    # One graded attempt per application — defense-in-depth beyond the state guard.
    IndexSpec("aptitude_attempts", "application_id", {"unique": True}),
    IndexSpec("aptitude_attempts", "comp_id"),
    # One delivery (served order + clock-start) per application; stable on re-fetch.
    IndexSpec("aptitude_deliveries", "application_id", {"unique": True}),
    # reports written by ai-agents (one per application); admin reads + owns the index.
    IndexSpec("reports", "application_id", {"unique": True}),
    # match_results written by ai-agents (one per job+candidate); admin reads these.
    IndexSpec(
        "match_results", [("job_id", 1), ("candidate_user_id", 1)], {"unique": True}
    ),
    IndexSpec("match_results", "candidate_user_id"),
    IndexSpec("match_results", [("job_id", 1), ("score", -1)]),
    # job_question_plans written by ai-agents (one cited plan per job; read on every
    # interview start); unique also hardens the save_question_plan upsert.
    IndexSpec("job_question_plans", "job_id", {"unique": True}),
    # interviews written by ai-agents (one transcript per app, read for scoring); the
    # user_id index serves the profile join in get_interview_context.
    IndexSpec("interviews", "application_id", {"unique": True}),
    IndexSpec("interviews", "user_id"),
    IndexSpec("rubrics", "comp_id"),
    # proctoring_events written by ai-agents during the interview (append-only advisory
    # signals); admin reads them comp-scoped for the recruiter integrity timeline.
    IndexSpec("proctoring_events", "application_id"),
    IndexSpec("proctoring_events", [("comp_id", 1), ("application_id", 1)]),
    # BE-E: perf indexes for sweep queries and status filters.
    # aptitude_deliveries: list_stale filters on delivered_at.
    IndexSpec("aptitude_deliveries", "delivered_at"),
    # users: list_candidates_before filters (role, created_at); also backs list_by_role.
    IndexSpec("users", [("role", 1), ("created_at", 1)]),
    # jobs: status filter used by recruiter job-list queries.
    IndexSpec("jobs", "status"),
    # Full-text marketplace search (SearchJobs + /public/jobs). One text index per
    # collection; covers title + jd + skills (skills lands with extend-Job).
    IndexSpec("jobs", [("title", "text"), ("jd_text", "text"), ("skills", "text")]),
    # audit_logs: entity+entity_id is the primary lookup pattern; comp_id backs scans.
    IndexSpec("audit_logs", [("entity", 1), ("entity_id", 1)]),
    IndexSpec("audit_logs", "comp_id"),
]


def get_db() -> Any:  # overridden in main (real Mongo) / in tests (fakes via repos)
    raise RuntimeError("get_db not configured")
