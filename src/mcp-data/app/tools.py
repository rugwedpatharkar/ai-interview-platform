"""mcp-data tools — the platform's data-access operations over MongoDB.

`DataStore` reads/writes the collections admin owns, by admin's own keys. Writes are
idempotent upserts so an at-least-once redelivered event re-runs cleanly. Transport-
agnostic + testable; the MCP server (server.py) wraps each method as a tool.
"""

import asyncio
import time

from bson import ObjectId
from bson.errors import InvalidId
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, histogram, span
from lib.resilience import with_timeout
from lib.schemas import Role
from pymongo.errors import DuplicateKeyError

from lib import timeouts

log = get_logger(component="mcp_data.tools")

_MANAGER_ROLES = {Role.company_admin.value, Role.recruiter.value}
# Hard ceiling on a single interview's proctoring events — bounds the read so a runaway
# or adversarial client can't make the integrity fold load an unbounded set.
_PROCTOR_CAP = 5000

# ---------------------------------------------------------------------------
# Prometheus metrics — defined at module level (safe at import time).
# ---------------------------------------------------------------------------
_mongo_duration = histogram(
    "mongo_op_duration_ms",
    "Duration of mcp-data MongoDB operations in milliseconds",
    labels=["op"],
)
_mongo_total = counter(
    "mongo_op_total",
    "Total mcp-data MongoDB operations",
    labels=["op"],
)
_mongo_errors = counter(
    "mongo_op_errors_total",
    "Failed mcp-data MongoDB operations",
    labels=["op"],
)


def _ms(t0: float) -> float:
    return (time.monotonic() - t0) * 1000


class DataStore:
    def __init__(self, db):
        self._profiles = db["candidate_profiles"]
        self._jobs = db["jobs"]
        self._banks = db["aptitude_banks"]
        self._interviews = db["interviews"]
        self._reports = db["reports"]
        self._applications = db["applications"]
        self._match_results = db["match_results"]
        self._question_plans = db["job_question_plans"]
        self._proctoring = db["proctoring_events"]
        self._practice = db["practice_sessions"]

    async def save_profile(self, user_id, doc):
        async with log_context(log, "data.save_profile", **bind_ids(user_id=user_id)):
            t0 = time.monotonic()
            op = "save_profile"
            _mongo_total.labels(op=op).inc()
            try:
                async with span("mongo.save_profile", user_id=user_id):
                    await with_timeout(
                        self._profiles.update_one(
                            {"user_id": user_id},
                            {"$set": {**doc, "parsed": True}},
                            upsert=True,
                        ),
                        timeouts.mongo(),
                        op=op,
                    )
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))

    async def get_profile(self, user_id):
        async with log_context(log, "data.get_profile", **bind_ids(user_id=user_id)):
            t0 = time.monotonic()
            op = "get_profile"
            _mongo_total.labels(op=op).inc()
            try:
                async with span("mongo.get_profile", user_id=user_id):
                    return await with_timeout(
                        self._profiles.find_one({"user_id": user_id}),
                        timeouts.mongo(),
                        op=op,
                    )
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))

    async def get_job(self, job_id):
        async with log_context(log, "data.get_job", **bind_ids(job_id=job_id)):
            try:
                oid = ObjectId(job_id)
            except InvalidId:
                log.warning("get_job: invalid job id {}", job_id)
                return None
            t0 = time.monotonic()
            op = "get_job"
            _mongo_total.labels(op=op).inc()
            try:
                async with span("mongo.get_job", job_id=job_id):
                    return await with_timeout(
                        self._jobs.find_one({"_id": oid}),
                        timeouts.mongo(),
                        op=op,
                    )
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))

    async def save_aptitude_bank(self, job_id, doc):
        async with log_context(
            log, "data.save_aptitude_bank", **bind_ids(job_id=job_id)
        ):
            t0 = time.monotonic()
            op = "save_aptitude_bank"
            _mongo_total.labels(op=op).inc()
            try:
                async with span("mongo.save_aptitude_bank", job_id=job_id):
                    await with_timeout(
                        self._banks.update_one(
                            {"job_id": job_id},
                            {"$set": {**doc, "job_id": job_id}},
                            upsert=True,
                        ),
                        timeouts.mongo(),
                        op=op,
                    )
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))

    async def get_aptitude_bank(self, job_id):
        async with log_context(
            log, "data.get_aptitude_bank", **bind_ids(job_id=job_id)
        ):
            t0 = time.monotonic()
            op = "get_aptitude_bank"
            _mongo_total.labels(op=op).inc()
            try:
                async with span("mongo.get_aptitude_bank", job_id=job_id):
                    return await with_timeout(
                        self._banks.find_one({"job_id": job_id}),
                        timeouts.mongo(),
                        op=op,
                    )
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))

    async def get_interview_context(self, application_id):
        async with log_context(
            log,
            "data.get_interview_context",
            **bind_ids(application_id=application_id),
        ):
            interview = await with_timeout(
                self._interviews.find_one({"application_id": application_id}),
                timeouts.mongo(),
                op="get_interview_context",
            )
            if interview is None:
                return None
            job, profile = await asyncio.gather(
                self.get_job(interview["job_id"]),
                with_timeout(
                    self._profiles.find_one({"user_id": interview["user_id"]}),
                    timeouts.mongo(),
                    op="get_interview_context.profile",
                ),
            )
            return {
                "transcript": interview.get("transcript", {}),
                "blueprint": interview.get("blueprint", {}),
                "jd_text": (job or {}).get("jd_text", ""),
                "profile": profile or {},
            }

    async def save_report(self, application_id, doc):
        async with log_context(
            log, "data.save_report", **bind_ids(application_id=application_id)
        ):
            t0 = time.monotonic()
            op = "save_report"
            _mongo_total.labels(op=op).inc()
            try:
                async with span("mongo.save_report", application_id=application_id):
                    await with_timeout(
                        self._reports.update_one(
                            {"application_id": application_id},
                            {"$set": {**doc, "application_id": application_id}},
                            upsert=True,
                        ),
                        timeouts.mongo(),
                        op=op,
                    )
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))

    async def get_report(self, application_id):
        async with log_context(
            log, "data.get_report", **bind_ids(application_id=application_id)
        ):
            t0 = time.monotonic()
            op = "get_report"
            _mongo_total.labels(op=op).inc()
            try:
                async with span("mongo.get_report", application_id=application_id):
                    return await with_timeout(
                        self._reports.find_one({"application_id": application_id}),
                        timeouts.mongo(),
                        op=op,
                    )
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))

    async def get_interview_setup(self, application_id):
        async with log_context(
            log,
            "data.get_interview_setup",
            **bind_ids(application_id=application_id),
        ):
            try:
                oid = ObjectId(application_id)
            except InvalidId:
                return None
            application = await with_timeout(
                self._applications.find_one({"_id": oid}),
                timeouts.mongo(),
                op="get_interview_setup",
            )
            if application is None:
                return None
            job, profile, question_plan = await asyncio.gather(
                self.get_job(application["job_id"]),
                with_timeout(
                    self._profiles.find_one(
                        {"user_id": application["candidate_user_id"]}
                    ),
                    timeouts.mongo(),
                    op="get_interview_setup.profile",
                ),
                self.get_question_plan(application.get("job_id", "")),
            )
            return {
                "comp_id": application.get("comp_id", ""),
                "job_id": application.get("job_id", ""),
                "candidate_user_id": application.get("candidate_user_id", ""),
                "state": application.get("state", ""),
                "jd_text": (job or {}).get("jd_text", ""),
                "profile": profile or {},
                "question_plan": question_plan,
            }

    async def save_interview(self, application_id, doc):
        async with log_context(
            log, "data.save_interview", **bind_ids(application_id=application_id)
        ):
            t0 = time.monotonic()
            op = "save_interview"
            _mongo_total.labels(op=op).inc()
            try:
                async with span("mongo.save_interview", application_id=application_id):
                    await with_timeout(
                        self._interviews.update_one(
                            {"application_id": application_id},
                            {"$set": {**doc, "application_id": application_id}},
                            upsert=True,
                        ),
                        timeouts.mongo(),
                        op=op,
                    )
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))

    async def save_proctoring_events(self, application_id, comp_id, events):
        # Append-only advisory integrity signals — typed events only, never raw media.
        async with log_context(
            log,
            "data.save_proctoring_events",
            **bind_ids(application_id=application_id, comp_id=comp_id),
        ):
            if not events:
                return 0
            docs = [
                {**e, "application_id": application_id, "comp_id": comp_id}
                for e in events
            ]
            t0 = time.monotonic()
            op = "save_proctoring_events"
            _mongo_total.labels(op=op).inc()
            try:
                async with span(
                    "mongo.save_proctoring_events",
                    application_id=application_id,
                    count=len(docs),
                ):
                    await with_timeout(
                        self._proctoring.insert_many(docs),
                        timeouts.mongo(),
                        op=op,
                    )
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))
            return len(docs)

    async def get_proctoring_events(self, application_id):
        # Chronological (insertion order, append-only); _id excluded — the report only
        # needs {type, severity} to fold the integrity snapshot.
        async with log_context(
            log,
            "data.get_proctoring_events",
            **bind_ids(application_id=application_id),
        ):
            t0 = time.monotonic()
            op = "get_proctoring_events"
            _mongo_total.labels(op=op).inc()
            try:
                async with span(
                    "mongo.get_proctoring_events", application_id=application_id
                ):
                    cursor = self._proctoring.find(
                        {"application_id": application_id}, {"_id": 0}
                    )
                    rows = await cursor.to_list(length=_PROCTOR_CAP)
                    if len(rows) >= _PROCTOR_CAP:
                        log.warning(
                            "get_proctoring_events: truncated at {} for {}",
                            _PROCTOR_CAP,
                            application_id,
                        )
                    return rows
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))

    async def save_match_result(
        self, comp_id, job_id, candidate_user_id, score, reasons
    ):
        # The unique (job_id, candidate_user_id) index is the idempotency authority: the
        # first writer inserts (True); a concurrent/late one updates or collides (False)
        # so match.completed is emitted exactly once.
        async with log_context(
            log,
            "data.save_match_result",
            **bind_ids(comp_id=comp_id, job_id=job_id),
        ):
            t0 = time.monotonic()
            op = "save_match_result"
            _mongo_total.labels(op=op).inc()
            try:
                async with span(
                    "mongo.save_match_result",
                    comp_id=comp_id,
                    job_id=job_id,
                ):
                    res = await with_timeout(
                        self._match_results.update_one(
                            {"job_id": job_id, "candidate_user_id": candidate_user_id},
                            {
                                "$set": {
                                    "comp_id": comp_id,
                                    "job_id": job_id,
                                    "candidate_user_id": candidate_user_id,
                                    "score": score,
                                    "reasons": reasons,
                                }
                            },
                            upsert=True,
                        ),
                        timeouts.mongo(),
                        op=op,
                    )
            except DuplicateKeyError:
                return False
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))
            return res.upserted_id is not None

    async def get_match_results(self, job_id=None, candidate_user_id=None):
        async with log_context(
            log,
            "data.get_match_results",
            **bind_ids(job_id=job_id or "", candidate_user_id=candidate_user_id or ""),
        ):
            query = {}
            if job_id is not None:
                query["job_id"] = job_id
            if candidate_user_id is not None:
                query["candidate_user_id"] = candidate_user_id
            t0 = time.monotonic()
            op = "get_match_results"
            _mongo_total.labels(op=op).inc()
            try:
                async with span("mongo.get_match_results"):
                    cursor = self._match_results.find(query).sort("score", -1)
                    return await with_timeout(
                        cursor.to_list(length=200),
                        timeouts.mongo(),
                        op=op,
                    )
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))

    async def save_question_plan(self, job_id, plan):
        async with log_context(
            log, "data.save_question_plan", **bind_ids(job_id=job_id)
        ):
            t0 = time.monotonic()
            op = "save_question_plan"
            _mongo_total.labels(op=op).inc()
            try:
                async with span("mongo.save_question_plan", job_id=job_id):
                    await with_timeout(
                        self._question_plans.update_one(
                            {"job_id": job_id},
                            {"$set": {**plan, "job_id": job_id}},
                            upsert=True,
                        ),
                        timeouts.mongo(),
                        op=op,
                    )
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))

    async def get_question_plan(self, job_id):
        async with log_context(
            log, "data.get_question_plan", **bind_ids(job_id=job_id)
        ):
            t0 = time.monotonic()
            op = "get_question_plan"
            _mongo_total.labels(op=op).inc()
            try:
                async with span("mongo.get_question_plan", job_id=job_id):
                    return await with_timeout(
                        self._question_plans.find_one({"job_id": job_id}),
                        timeouts.mongo(),
                        op=op,
                    )
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))

    async def list_applicants(self, scope, job_id):
        # Chat-scope guard: only company users with a comp_id, own-comp apps only.
        # (A manager token with comp_id=None must not wildcard-match null-comp rows.)
        async with log_context(
            log,
            "data.list_applicants",
            **bind_ids(job_id=job_id, comp_id=scope.get("comp_id", "")),
        ):
            if scope.get("role") not in _MANAGER_ROLES or not scope.get("comp_id"):
                return []
            t0 = time.monotonic()
            op = "list_applicants"
            _mongo_total.labels(op=op).inc()
            try:
                async with span(
                    "mongo.list_applicants",
                    job_id=job_id,
                    comp_id=scope.get("comp_id", ""),
                ):
                    apps = await with_timeout(
                        self._applications.find(
                            {"job_id": job_id, "comp_id": scope.get("comp_id")},
                            {"_id": 1, "candidate_user_id": 1, "state": 1},
                        ).to_list(length=200),
                        timeouts.mongo(),
                        op=op,
                    )
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))
            return [
                {
                    "application_id": str(a["_id"]),
                    "candidate_user_id": a.get("candidate_user_id"),
                    "state": a.get("state"),
                }
                for a in apps
            ]

    async def get_application_status(self, scope, application_id):
        async with log_context(
            log,
            "data.get_application_status",
            **bind_ids(application_id=application_id),
        ):
            try:
                oid = ObjectId(application_id)
            except InvalidId:
                return None
            t0 = time.monotonic()
            op = "get_application_status"
            _mongo_total.labels(op=op).inc()
            try:
                async with span(
                    "mongo.get_application_status",
                    application_id=application_id,
                ):
                    application = await with_timeout(
                        self._applications.find_one({"_id": oid}),
                        timeouts.mongo(),
                        op=op,
                    )
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))
            if application is None:
                return None
            role = scope.get("role")
            comp_id = scope.get("comp_id")
            if role in _MANAGER_ROLES:
                if not comp_id or application.get("comp_id") != comp_id:
                    return None  # cross-tenant / no tenant
            elif role == Role.candidate.value:
                if application.get("candidate_user_id") != scope.get("user_id"):
                    return None  # not your application
            else:
                return None
            return {
                "application_id": application_id,
                "job_id": application.get("job_id"),
                "state": application.get("state"),
            }

    async def save_practice_summary(self, user_id, summary):
        # Detached growth artifact: keyed by (user_id, practice_id) only — never
        # comp_id/application_id. Upsert is idempotent so a re-finalize re-writes
        # cleanly.
        async with log_context(
            log, "data.save_practice_summary", **bind_ids(user_id=user_id)
        ):
            t0 = time.monotonic()
            op = "save_practice_summary"
            _mongo_total.labels(op=op).inc()
            try:
                async with span("mongo.save_practice_summary", user_id=user_id):
                    await with_timeout(
                        self._practice.update_one(
                            {"user_id": user_id, "practice_id": summary["practice_id"]},
                            {"$set": {**summary, "user_id": user_id}},
                            upsert=True,
                        ),
                        timeouts.mongo(),
                        op=op,
                    )
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))

    async def get_practice_summary(self, user_id, practice_id):
        async with log_context(
            log, "data.get_practice_summary", **bind_ids(user_id=user_id)
        ):
            t0 = time.monotonic()
            op = "get_practice_summary"
            _mongo_total.labels(op=op).inc()
            try:
                async with span("mongo.get_practice_summary", user_id=user_id):
                    return await with_timeout(
                        self._practice.find_one(
                            {"user_id": user_id, "practice_id": practice_id}
                        ),
                        timeouts.mongo(),
                        op=op,
                    )
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))

    async def list_practice_summaries(self, user_id):
        # Owner-scoped history (user_id is the caller, never a client param); most
        # recent first. Powers the history list and the erasure delete_by_user.
        async with log_context(
            log, "data.list_practice_summaries", **bind_ids(user_id=user_id)
        ):
            t0 = time.monotonic()
            op = "list_practice_summaries"
            _mongo_total.labels(op=op).inc()
            try:
                async with span("mongo.list_practice_summaries", user_id=user_id):
                    cursor = self._practice.find({"user_id": user_id}).sort(
                        "created_at", -1
                    )
                    return await with_timeout(
                        cursor.to_list(length=200),
                        timeouts.mongo(),
                        op=op,
                    )
            except Exception:
                _mongo_errors.labels(op=op).inc()
                raise
            finally:
                _mongo_duration.labels(op=op).observe(_ms(t0))
