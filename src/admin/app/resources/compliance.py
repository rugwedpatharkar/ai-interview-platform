"""Candidate data-rights (compliance) — consent ledger.

Self-service: the caller acts on their own data (`identity["id"]`). Consent is an
auditable, append-only ledger (one row per grant); `automated_evaluation` is the
candidate's explicit consent to AI-driven scoring (GDPR Art. 22 territory).
"""

import asyncio

from lib.logging import get_logger

from app.errors import ValidationError
from app.model.audit import AuditLog
from app.model.compliance import ConsentRecord

log = get_logger(component="compliance.resources")

_SCOPES = {"data_processing", "automated_evaluation"}


async def record_consent(identity, scope, terms_version, *, consents):
    if scope not in _SCOPES:
        raise ValidationError(f"unknown consent scope: {scope!r}")
    if not terms_version:
        raise ValidationError("terms_version is required")
    user_id = identity["id"]
    await consents.insert(
        ConsentRecord(user_id=user_id, scope=scope, terms_version=terms_version)
    )
    log.info("consent recorded: user={} scope={} v={}", user_id, scope, terms_version)
    return {"user_id": user_id, "scope": scope, "terms_version": terms_version}


async def list_consent(identity, *, consents):
    return await consents.list_by_user(identity["id"])


class CandidateEraser:
    """Right-to-erasure / retention: purge a candidate's identifying data.

    Cascades into the AI artifacts holding candidate data — interview reports (by the
    candidate's applications), transcripts (by user), aptitude attempts (by candidate) —
    deletes the profile + resume, anonymizes the user (keeps `_id` so applications +
    audit stay intact) and audits the erasure (resume delete is best-effort).
    Applications are retained, pointing at the anonymized tombstone. `sweep` applies the
    same purge to candidates past the retention cutoff.
    """

    def __init__(
        self,
        *,
        users,
        profiles,
        storage,
        audit,
        applications,
        reports,
        interviews,
        attempts,
        consents,
        notifications=None,
    ):
        self._users = users
        self._profiles = profiles
        self._storage = storage
        self._audit = audit
        self._applications = applications
        self._reports = reports
        self._interviews = interviews
        self._attempts = attempts
        self._consents = consents
        self._notifications = notifications

    async def erase(self, user_id):
        applications = await self._applications.list_by_candidate(user_id)
        await self._reports.delete_by_applications(
            [str(a["_id"]) for a in applications]
        )
        await self._interviews.delete_by_user(user_id)
        await self._attempts.delete_by_candidate(user_id)
        # The consent ledger is keyed by user_id (identifying PII); erase it too so a
        # right-to-erasure leaves no residual linkage back to the candidate.
        await self._consents.delete_by_user(user_id)
        if self._notifications is not None:
            await self._notifications.delete_by_user(user_id)
        profile = await self._profiles.get_by_user(user_id)
        await self._profiles.delete_by_user(user_id)
        if profile and profile.get("resume_key"):
            try:
                await self._storage.delete_raw(profile["resume_key"])
            except Exception:
                log.exception("erase: resume delete failed for {}", user_id)
        await self._users.anonymize(user_id)
        await self._audit.insert(
            AuditLog(entity="candidate", entity_id=user_id, action="erased")
        )
        log.info("candidate erased: {}", user_id)

    _SWEEP_CONCURRENCY = 10

    async def sweep(self, cutoff):
        users = await self._users.list_candidates_before(cutoff)
        if not users:
            log.info("retention sweep erased 0 candidates")
            return 0
        sem = asyncio.Semaphore(self._SWEEP_CONCURRENCY)

        async def _erase_one(user):
            async with sem:
                await self.erase(str(user["_id"]))

        await asyncio.gather(*(_erase_one(u) for u in users))
        log.info("retention sweep erased {} candidates", len(users))
        return len(users)
