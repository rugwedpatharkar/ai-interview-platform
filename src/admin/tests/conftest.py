from datetime import UTC, datetime

import pytest
from pymongo.errors import DuplicateKeyError

# Fixed stand-in timestamp for fake transition records (deterministic in tests).
_NOW = datetime(2026, 6, 20, tzinfo=UTC)


class FakeUserRepo:
    """In-memory stand-in for UserRepository (the subset resources use)."""

    def __init__(self):
        self._docs: dict[str, dict] = {}
        self._seq = 0

    async def insert(self, user) -> str:
        self._seq += 1
        uid = str(self._seq)
        doc = user.model_dump()
        doc["_id"] = uid
        self._docs[uid] = doc
        return uid

    async def get(self, user_id):
        return self._docs.get(user_id)

    async def get_by_email(self, email):
        return next((d for d in self._docs.values() if d["email"] == email), None)

    async def set_email_verified(self, user_id):
        if user_id in self._docs:
            self._docs[user_id]["email_verified"] = True

    async def set_status(self, user_id, status):
        if user_id in self._docs:
            self._docs[user_id]["status"] = status

    async def update(self, user_id, fields):
        if user_id in self._docs:
            self._docs[user_id].update(fields)

    async def update_fields(self, user_id, fields):
        if user_id in self._docs:
            self._docs[user_id].update(fields)

    async def anonymize(self, user_id):
        if user_id in self._docs:
            self._docs[user_id].update(
                {"email": f"erased+{user_id}@example.invalid", "erased": True}
            )

    async def list_candidates_before(self, cutoff):
        return [
            d
            for d in self._docs.values()
            if d.get("role") == "candidate"
            and d["created_at"] < cutoff
            and not d.get("erased")
        ]


class FakeCompanyRepo:
    """In-memory stand-in for CompanyRepository."""

    def __init__(self):
        self._docs: dict[str, dict] = {}
        self._seq = 0

    async def insert(self, company) -> str:
        self._seq += 1
        cid = str(self._seq)
        doc = company.model_dump()
        doc["_id"] = cid
        self._docs[cid] = doc
        return cid

    async def get(self, comp_id):
        return self._docs.get(comp_id)

    async def names_by_ids(self, comp_ids):
        return {c: self._docs[c].get("name", "") for c in comp_ids if c in self._docs}


class FakeRedis:
    """In-memory async Redis stand-in for RateLimiter + RefreshSessionStore."""

    def __init__(self):
        self.kv: dict[str, str] = {}
        self.ttls: dict[str, int] = {}
        self.sets: dict[str, set] = {}
        self.hashes: dict[str, dict] = {}

    async def incr(self, key):
        # incr + get share kv (as real Redis does), so RateLimiter.peek reads it.
        val = int(self.kv.get(key, 0)) + 1
        self.kv[key] = str(val)
        return val

    async def expire(self, key, seconds):
        self.ttls[key] = seconds

    async def ttl(self, key):
        return self.ttls.get(key, -1)

    async def set(self, key, value, ex=None):
        self.kv[key] = value

    async def get(self, key):
        return self.kv.get(key)

    async def delete(self, key):
        existed = key in self.kv or key in self.sets or key in self.hashes
        self.kv.pop(key, None)
        self.sets.pop(key, None)
        self.ttls.pop(key, None)
        self.hashes.pop(key, None)
        return 1 if existed else 0

    async def exists(self, key):
        return 1 if key in self.kv else 0

    async def sadd(self, key, *members):
        self.sets.setdefault(key, set()).update(members)

    async def smembers(self, key):
        return set(self.sets.get(key, set()))

    async def srem(self, key, *members):
        self.sets.get(key, set()).difference_update(members)

    async def hset(self, key, mapping=None, **kwargs):
        h = self.hashes.setdefault(key, {})
        if mapping:
            h.update(mapping)
        if kwargs:
            h.update(kwargs)
        return len(mapping or kwargs)

    async def hgetall(self, key):
        return dict(self.hashes.get(key, {}))

    async def eval(self, script, numkeys, *keys_and_args):
        # Model Redis's atomic EVAL for revoke_user: delete each jti key in the user's
        # set, then the set itself — one indivisible step (the only script we run).
        keys, args = keys_and_args[:numkeys], keys_and_args[numkeys:]
        user_key, prefix = keys[0], args[0]
        for jti in self.sets.get(user_key, set()):
            self.kv.pop(prefix + jti, None)
            self.ttls.pop(prefix + jti, None)
        self.sets.pop(user_key, None)
        return 0


class FakeProfileRepo:
    """In-memory stand-in for CandidateProfileRepository."""

    def __init__(self):
        self._docs: dict[str, dict] = {}

    async def get_by_user(self, user_id):
        return self._docs.get(user_id)

    async def insert(self, profile) -> str:
        doc = profile.model_dump()
        self._docs[doc["user_id"]] = doc
        return doc["user_id"]

    async def update_by_user(self, user_id, fields):
        if user_id in self._docs:
            self._docs[user_id].update(fields)

    async def delete_by_user(self, user_id):
        self._docs.pop(user_id, None)


class FakeStorage:
    """In-memory stand-in for lib ObjectStorage."""

    def __init__(self):
        self.objects: dict[str, tuple] = {}
        self.deleted: list[str] = []

    async def put(self, comp_id, category, key, data, content_type):
        object_key = f"{comp_id}/{category}/{key}"
        self.objects[object_key] = (data, content_type)
        return object_key

    async def delete_raw(self, object_key):
        self.deleted.append(object_key)


class FakePublisher:
    """In-memory stand-in for lib RabbitMQ Publisher."""

    def __init__(self):
        self.published: list[tuple] = []

    async def publish(self, routing_key, payload):
        self.published.append((routing_key, payload))


class FakeJobRepo:
    """In-memory stand-in for JobRepository (comp_id-scoped)."""

    def __init__(self):
        self._docs: dict[str, dict] = {}
        self._seq = 0

    async def insert(self, job) -> str:
        self._seq += 1
        jid = str(self._seq)
        doc = job.model_dump()
        doc["_id"] = jid
        self._docs[jid] = doc
        return jid

    async def get_scoped(self, job_id, comp_id):
        doc = self._docs.get(job_id)
        return doc if doc and doc["comp_id"] == comp_id else None

    async def list_by_company(self, comp_id):
        return [d for d in self._docs.values() if d["comp_id"] == comp_id]

    async def set_status(self, job_id, comp_id, status):
        doc = self._docs.get(job_id)
        if doc and doc["comp_id"] == comp_id:
            doc["status"] = status
            return 1
        return 0

    async def get_by_id(self, job_id):
        return self._docs.get(job_id)

    async def update_fields(self, job_id, comp_id, fields):
        doc = self._docs.get(job_id)
        if not doc or doc["comp_id"] != comp_id:
            return 0
        for key, val in fields.items():
            if "." in key:  # dotted key -> one-level nested set (mirrors Mongo $set)
                head, tail = key.split(".", 1)
                doc.setdefault(head, {})[tail] = val
            else:
                doc[key] = val
        return 1


class FakeApplicationRepo:
    """In-memory stand-in for ApplicationRepository."""

    def __init__(self):
        self._docs: dict[str, dict] = {}
        self._seq = 0

    async def insert(self, application) -> str:
        self._seq += 1
        aid = str(self._seq)
        doc = application.model_dump()
        doc["_id"] = aid
        self._docs[aid] = doc
        return aid

    async def get_by_job_and_candidate(self, job_id, candidate_user_id):
        return next(
            (
                d
                for d in self._docs.values()
                if d["job_id"] == job_id and d["candidate_user_id"] == candidate_user_id
            ),
            None,
        )

    async def list_by_candidate(self, candidate_user_id):
        return [
            d
            for d in self._docs.values()
            if d["candidate_user_id"] == candidate_user_id
        ]

    async def list_by_job(self, job_id, comp_id):
        return [
            d
            for d in self._docs.values()
            if d["job_id"] == job_id and d["comp_id"] == comp_id
        ]

    async def get(self, application_id):
        return self._docs.get(application_id)

    async def set_state(self, application_id, state):
        doc = self._docs.get(application_id)
        if doc is not None:
            doc["state"] = state
            doc.setdefault("transitions", []).append({"state": state, "at": _NOW})

    async def set_state_if(self, application_id, expected_current, new):
        doc = self._docs.get(application_id)
        if doc is None or doc["state"] != expected_current:
            return False
        doc["state"] = new
        doc.setdefault("transitions", []).append({"state": new, "at": _NOW})
        return True


class FakeAuditRepo:
    """In-memory stand-in for AuditLogRepository."""

    def __init__(self):
        self.records: list[dict] = []

    async def insert(self, entry) -> str:
        self.records.append(entry.model_dump())
        return str(len(self.records))


class FakeAptitudeBankRepo:
    """In-memory stand-in for AptitudeBankRepository (reads the aptitude_banks)."""

    def __init__(self):
        self._by_job: dict[str, dict] = {}

    async def get_by_job(self, job_id):
        return self._by_job.get(job_id)


class FakeAptitudeAttemptRepo:
    """In-memory stand-in for AptitudeAttemptRepository.

    Enforces the production unique index on application_id (a second insert for the
    same application raises DuplicateKeyError) so idempotency paths are exercised.
    """

    def __init__(self):
        self.records: list[dict] = []

    async def insert(self, attempt) -> str:
        doc = attempt.model_dump()
        if any(r["application_id"] == doc["application_id"] for r in self.records):
            raise DuplicateKeyError("duplicate application_id")
        self.records.append(doc)
        return str(len(self.records))

    async def get_by_application(self, application_id):
        return next(
            (r for r in self.records if r["application_id"] == application_id), None
        )

    async def delete_by_candidate(self, candidate_user_id):
        self.records = [
            r for r in self.records if r["candidate_user_id"] != candidate_user_id
        ]


class FakeCodingAttemptRepo:
    """In-memory stand-in for CodingAttemptRepository."""

    def __init__(self):
        self.records: list[dict] = []

    async def insert(self, attempt) -> str:
        self.records.append(attempt.model_dump())
        return str(len(self.records))

    async def delete_by_candidate(self, candidate_user_id):
        self.records = [
            r for r in self.records if r["candidate_user_id"] != candidate_user_id
        ]


class FakeInterviewRepo:
    """In-memory stand-in for InterviewRepository (transcripts, keyed by user)."""

    def __init__(self):
        self.docs: dict[str, dict] = {}

    async def delete_by_user(self, user_id):
        self.docs = {k: v for k, v in self.docs.items() if v.get("user_id") != user_id}


class FakeAptitudeDeliveryRepo:
    """In-memory stand-in for AptitudeDeliveryRepository (order + clock-start)."""

    def __init__(self):
        self._docs: dict[str, dict] = {}

    async def get_by_application(self, application_id):
        return self._docs.get(application_id)

    async def insert(self, delivery) -> str:
        doc = delivery.model_dump()
        self._docs[doc["application_id"]] = doc
        return doc["application_id"]

    async def list_stale(self, cutoff):
        return [d for d in self._docs.values() if d["delivered_at"] < cutoff]


class FakeReportRepo:
    """In-memory stand-in for ReportRepository (reads ai-agents' reports)."""

    def __init__(self):
        self._by_app: dict[str, dict] = {}
        self.list_by_applications_calls: list[list[str]] = []

    async def get_by_application(self, application_id):
        return self._by_app.get(application_id)

    async def list_by_applications(self, application_ids):
        self.list_by_applications_calls.append(list(application_ids))
        return [self._by_app[aid] for aid in application_ids if aid in self._by_app]

    async def delete_by_applications(self, application_ids):
        for aid in application_ids:
            self._by_app.pop(aid, None)


class FakeConsentRepo:
    """In-memory stand-in for ConsentRepository (append-only consent ledger)."""

    def __init__(self):
        self.records: list[dict] = []

    async def insert(self, record) -> str:
        self.records.append(record.model_dump())
        return str(len(self.records))

    async def list_by_user(self, user_id):
        return [r for r in self.records if r["user_id"] == user_id]

    async def delete_by_user(self, user_id):
        self.records = [r for r in self.records if r["user_id"] != user_id]


class FakePracticeRepo:
    """In-memory stand-in for PracticeSessionRepository (ai-agents practice runs)."""

    def __init__(self):
        self.docs: dict[str, dict] = {}

    async def delete_by_user(self, user_id):
        self.docs = {k: v for k, v in self.docs.items() if v.get("user_id") != user_id}


class FakeInterviewSlotsRepo:
    """In-memory stand-in for InterviewSlotsRepository (cascade by application)."""

    def __init__(self):
        self.docs: list[dict] = []

    async def delete_by_applications(self, application_ids):
        self.docs = [d for d in self.docs if d["application_id"] not in application_ids]


class FakeInterviewBookingRepo:
    """In-memory stand-in for InterviewBookingRepository (cascade by application)."""

    def __init__(self):
        self.docs: dict[str, dict] = {}

    async def delete_by_applications(self, application_ids):
        for aid in application_ids:
            self.docs.pop(aid, None)


@pytest.fixture
def fakes():
    return {
        "users": FakeUserRepo(),
        "companies": FakeCompanyRepo(),
        "redis": FakeRedis(),
        "profiles": FakeProfileRepo(),
        "storage": FakeStorage(),
        "publisher": FakePublisher(),
        "jobs": FakeJobRepo(),
        "applications": FakeApplicationRepo(),
        "audit": FakeAuditRepo(),
        "banks": FakeAptitudeBankRepo(),
        "attempts": FakeAptitudeAttemptRepo(),
        "coding_attempts": FakeCodingAttemptRepo(),
        "deliveries": FakeAptitudeDeliveryRepo(),
        "reports": FakeReportRepo(),
        "interviews": FakeInterviewRepo(),
        "consents": FakeConsentRepo(),
        "practice": FakePracticeRepo(),
        "interview_slots": FakeInterviewSlotsRepo(),
        "interview_bookings": FakeInterviewBookingRepo(),
    }
