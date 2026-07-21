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
    # Coding assessment: one task per job; one attempt per application; candidate erase.
    IndexSpec("coding_tasks", "job_id", {"unique": True}),
    IndexSpec("coding_attempts", "application_id", {"unique": True}),
    IndexSpec("coding_attempts", "candidate_user_id"),
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
    # signals); admin reads comp-scoped for the recruiter integrity timeline. Every
    # reader includes comp_id, so the compound covers both single- and comp-scoped.
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
    # Marketplace sort/filter over published jobs (SearchJobs facets + recency sort).
    IndexSpec("jobs", [("status", 1), ("posted_at", -1)]),
    IndexSpec("jobs", [("status", 1), ("remote_mode", 1), ("employment_type", 1)]),
    IndexSpec("jobs", [("status", 1), ("city", 1)]),
    # company_profiles: employer branding; unique comp_id (one profile per company).
    IndexSpec("company_profiles", "comp_id", {"unique": True}),
    # job_alerts: a candidate's saved searches; list by recency + a sweep scan index.
    IndexSpec("job_alerts", [("candidate_user_id", 1), ("created_at", -1)]),
    IndexSpec("job_alerts", [("frequency", 1), ("last_run_at", 1)]),
    # notifications: per-recipient feed (recency), unread filter / fresh count, + a
    # sparse-unique (user_id, dedup_key) for idempotent triggers.
    IndexSpec("notifications", [("user_id", 1), ("created_at", -1)]),
    IndexSpec("notifications", [("user_id", 1), ("read_at", 1)]),
    IndexSpec(
        "notifications",
        [("user_id", 1), ("dedup_key", 1)],
        {"unique": True, "sparse": True},
    ),
    # messaging: thread 1:1 per application (the authz invariant) + the two inboxes.
    IndexSpec("message_threads", "application_id", {"unique": True}),
    IndexSpec("message_threads", [("candidate_user_id", 1), ("last_message_at", -1)]),
    IndexSpec("message_threads", [("comp_id", 1), ("last_message_at", -1)]),
    IndexSpec("messages", [("thread_id", 1), ("created_at", 1)]),
    IndexSpec("messages", "application_id"),
    # notification_prefs: one settings doc per user.
    IndexSpec("notification_prefs", "user_id", {"unique": True}),
    # user_preferences: one Appearance doc per user (v3).
    IndexSpec("user_preferences", "user_id", {"unique": True}),
    # saved_jobs: candidate bookmarks; unique (candidate, job) makes Save idempotent.
    IndexSpec(
        "saved_jobs", [("candidate_user_id", 1), ("job_id", 1)], {"unique": True}
    ),
    # audit_logs: entity+entity_id is the primary lookup pattern; comp_id backs scans.
    # 365-day TTL bounds growth; widen the window if compliance requires more.
    IndexSpec("audit_logs", [("entity", 1), ("entity_id", 1)]),
    IndexSpec("audit_logs", "comp_id"),
    IndexSpec("audit_logs", "at", {"expireAfterSeconds": 365 * 24 * 3600}),
    # practice_sessions written by ai-agents (detached candidate mock interviews). The
    # (user_id, created_at) index powers history + the erasure delete_by_user; the
    # unique (user_id, practice_id) backs single-run reads + the idempotent upsert.
    IndexSpec("practice_sessions", [("user_id", 1), ("created_at", -1)]),
    IndexSpec(
        "practice_sessions",
        [("user_id", 1), ("practice_id", 1)],
        {"unique": True},
    ),
    # interview scheduling: append-only proposal history + one current booking per
    # application (the unique application_id is the 1:1 invariant the CAS relies on).
    IndexSpec("interview_slots", [("application_id", 1), ("created_at", -1)]),
    IndexSpec("interview_slots", "comp_id"),
    IndexSpec("interview_bookings", "application_id", {"unique": True}),
    IndexSpec("interview_bookings", [("comp_id", 1), ("status", 1)]),
    IndexSpec("interview_bookings", [("candidate_user_id", 1), ("status", 1)]),
    # reminder sweep read path: booked bookings ordered by start time.
    IndexSpec("interview_bookings", [("status", 1), ("chosen_start_at", 1)]),
    # team roster reads + the last-admin count (comp_id, role, status).
    IndexSpec("users", [("comp_id", 1), ("role", 1), ("status", 1)]),
    # consents (GDPR consent ledger): every settings load + erasure looks up by user_id;
    # was scanning the full collection until this index was added.
    IndexSpec("consents", "user_id"),
    # read_state (per-user thread read markers): the $max upsert races without unique
    # on the natural key — docstring claimed unique but the index was never declared.
    IndexSpec(
        "read_state",
        [("user_id", 1), ("kind", 1), ("thread_id", 1)],
        {"unique": True},
    ),
    # client_errors: FE unhandled exceptions — 30-day TTL; event_id for dedup lookups.
    IndexSpec("client_errors", "created_at", {"expireAfterSeconds": 30 * 24 * 3600}),
    IndexSpec("client_errors", "event_id"),
    # client_events: FE analytics events — 90-day TTL; event_id for dedup lookups.
    IndexSpec("client_events", "created_at", {"expireAfterSeconds": 90 * 24 * 3600}),
    IndexSpec("client_events", "event_id"),
]


def get_db() -> Any:  # overridden in main (real Mongo) / in tests (fakes via repos)
    raise RuntimeError("get_db not configured")
