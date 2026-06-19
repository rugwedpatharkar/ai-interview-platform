"""mcp-data tools — the platform's data-access operations over MongoDB.

`DataStore` reads/writes the collections admin owns, by admin's own keys. Writes are
idempotent upserts so an at-least-once redelivered event re-runs cleanly. Transport-
agnostic + testable; the MCP server (server.py) wraps each method as a tool.
"""

from bson import ObjectId
from bson.errors import InvalidId
from lib.logging import get_logger
from lib.schemas import Role
from pymongo.errors import DuplicateKeyError

log = get_logger(component="mcp_data.tools")

_MANAGER_ROLES = {Role.company_admin.value, Role.recruiter.value}


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

    async def save_profile(self, user_id, doc):
        await self._profiles.update_one(
            {"user_id": user_id}, {"$set": {**doc, "parsed": True}}, upsert=True
        )

    async def get_profile(self, user_id):
        return await self._profiles.find_one({"user_id": user_id})

    async def get_job(self, job_id):
        try:
            oid = ObjectId(job_id)
        except InvalidId:
            log.warning("get_job: invalid job id {}", job_id)
            return None
        return await self._jobs.find_one({"_id": oid})

    async def save_aptitude_bank(self, job_id, doc):
        await self._banks.update_one(
            {"job_id": job_id}, {"$set": {**doc, "job_id": job_id}}, upsert=True
        )

    async def get_aptitude_bank(self, job_id):
        return await self._banks.find_one({"job_id": job_id})

    async def get_interview_context(self, application_id):
        interview = await self._interviews.find_one({"application_id": application_id})
        if interview is None:
            return None
        job = await self.get_job(interview["job_id"]) or {}
        profile = await self._profiles.find_one({"user_id": interview["user_id"]}) or {}
        return {
            "transcript": interview.get("transcript", {}),
            "blueprint": interview.get("blueprint", {}),
            "jd_text": job.get("jd_text", ""),
            "profile": profile,
        }

    async def save_report(self, application_id, doc):
        await self._reports.update_one(
            {"application_id": application_id},
            {"$set": {**doc, "application_id": application_id}},
            upsert=True,
        )

    async def get_report(self, application_id):
        return await self._reports.find_one({"application_id": application_id})

    async def get_interview_setup(self, application_id):
        try:
            oid = ObjectId(application_id)
        except InvalidId:
            return None
        application = await self._applications.find_one({"_id": oid})
        if application is None:
            return None
        job = await self.get_job(application["job_id"]) or {}
        profile = await self._profiles.find_one(
            {"user_id": application["candidate_user_id"]}
        )
        question_plan = await self.get_question_plan(application.get("job_id", ""))
        return {
            "comp_id": application.get("comp_id", ""),
            "job_id": application.get("job_id", ""),
            "candidate_user_id": application.get("candidate_user_id", ""),
            "jd_text": job.get("jd_text", ""),
            "profile": profile or {},
            "question_plan": question_plan,
        }

    async def save_interview(self, application_id, doc):
        await self._interviews.update_one(
            {"application_id": application_id},
            {"$set": {**doc, "application_id": application_id}},
            upsert=True,
        )

    async def save_proctoring_events(self, application_id, comp_id, events):
        # Append-only advisory integrity signals — typed events only, never raw media.
        if not events:
            return 0
        docs = [
            {**e, "application_id": application_id, "comp_id": comp_id} for e in events
        ]
        await self._proctoring.insert_many(docs)
        return len(docs)

    async def save_match_result(
        self, comp_id, job_id, candidate_user_id, score, reasons
    ):
        # The unique (job_id, candidate_user_id) index is the idempotency authority: the
        # first writer inserts (True); a concurrent/late one updates or collides (False)
        # so match.completed is emitted exactly once.
        try:
            res = await self._match_results.update_one(
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
            )
        except DuplicateKeyError:
            return False
        return res.upserted_id is not None

    async def get_match_results(self, job_id=None, candidate_user_id=None):
        query = {}
        if job_id is not None:
            query["job_id"] = job_id
        if candidate_user_id is not None:
            query["candidate_user_id"] = candidate_user_id
        cursor = self._match_results.find(query).sort("score", -1)
        return await cursor.to_list(length=200)

    async def save_question_plan(self, job_id, plan):
        await self._question_plans.update_one(
            {"job_id": job_id}, {"$set": {**plan, "job_id": job_id}}, upsert=True
        )

    async def get_question_plan(self, job_id):
        return await self._question_plans.find_one({"job_id": job_id})

    async def list_applicants(self, scope, job_id):
        # Chat-scope guard: only company users with a comp_id, own-comp apps only.
        # (A manager token with comp_id=None must not wildcard-match null-comp rows.)
        if scope.get("role") not in _MANAGER_ROLES or not scope.get("comp_id"):
            return []
        apps = await self._applications.find(
            {"job_id": job_id, "comp_id": scope.get("comp_id")}
        ).to_list(length=200)
        return [
            {
                "application_id": str(a["_id"]),
                "candidate_user_id": a.get("candidate_user_id"),
                "state": a.get("state"),
            }
            for a in apps
        ]

    async def get_application_status(self, scope, application_id):
        try:
            oid = ObjectId(application_id)
        except InvalidId:
            return None
        application = await self._applications.find_one({"_id": oid})
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
