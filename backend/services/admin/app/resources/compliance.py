"""Candidate data-rights (compliance) — consent ledger.

Self-service: the caller acts on their own data (`identity["id"]`). Consent is an
auditable, append-only ledger (one row per grant); `automated_evaluation` is the
candidate's explicit consent to AI-driven scoring (GDPR Art. 22 territory).
"""

import asyncio

from lib.errors import DependencyError
from lib.logging import bind_ids, get_logger, log_context

from app.errors import ValidationError
from app.model.audit import AuditLog
from app.model.compliance import ConsentRecord

log = get_logger(component="compliance.resources")

_SCOPES = {"data_processing", "automated_evaluation"}


async def record_consent(identity, scope, terms_version, *, consents):
    async with log_context(
        log,
        "resource.compliance.record_consent",
        **bind_ids(user_id=identity["id"]),
    ):
        if scope not in _SCOPES:
            raise ValidationError(f"unknown consent scope: {scope!r}")
        if not terms_version:
            raise ValidationError("terms_version is required")
        user_id = identity["id"]
        await consents.insert(
            ConsentRecord(user_id=user_id, scope=scope, terms_version=terms_version)
        )
        log.info(
            "consent recorded: user={} scope={} v={}", user_id, scope, terms_version
        )
        return {"user_id": user_id, "scope": scope, "terms_version": terms_version}


async def list_consent(identity, *, consents):
    async with log_context(
        log,
        "resource.compliance.list_consent",
        **bind_ids(user_id=identity["id"]),
    ):
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
        coding_attempts=None,
        user_preferences=None,
        consents,
        notifications=None,
        message_threads=None,
        messages=None,
        notification_prefs=None,
        practice=None,
        slots=None,
        bookings=None,
        sessions=None,
    ):
        self._users = users
        self._profiles = profiles
        self._storage = storage
        self._audit = audit
        self._applications = applications
        self._reports = reports
        self._interviews = interviews
        self._attempts = attempts
        self._coding_attempts = coding_attempts
        self._user_preferences = user_preferences
        self._consents = consents
        self._notifications = notifications
        self._message_threads = message_threads
        self._messages = messages
        self._notification_prefs = notification_prefs
        self._practice = practice
        self._slots = slots
        self._bookings = bookings
        self._sessions = sessions

    async def erase(self, user_id):
        async with log_context(
            log,
            "resource.compliance.erase",
            **bind_ids(user_id=user_id),
        ):
            failures: list[str] = []

            async def _step(name, coro):
                # Try one cascade step; collect the failure name if it errored.
                # The audit "erased" row is only written when every step passed —
                # partial failure leaves the sweep to retry from the top on next
                # tick, at which point idempotent delete_by_* calls are no-ops on
                # already-cleared collections.
                try:
                    await coro
                except Exception:
                    log.exception("erase.step_failed step={} user_id={}", name, user_id)
                    failures.append(name)

            applications = await self._applications.list_by_candidate(user_id)
            application_ids = [str(a["_id"]) for a in applications]
            await _step(
                "reports", self._reports.delete_by_applications(application_ids)
            )
            if self._message_threads is not None:
                for application_id in application_ids:
                    await _step(
                        f"message_threads:{application_id}",
                        self._message_threads.delete_by_application(application_id),
                    )
                    await _step(
                        f"messages:{application_id}",
                        self._messages.delete_by_application(application_id),
                    )
            await _step("interviews", self._interviews.delete_by_user(user_id))
            await _step("attempts", self._attempts.delete_by_candidate(user_id))
            if self._coding_attempts is not None:
                await _step(
                    "coding_attempts",
                    self._coding_attempts.delete_by_candidate(user_id),
                )
            await _step("consents", self._consents.delete_by_user(user_id))
            if self._notifications is not None:
                await _step(
                    "notifications", self._notifications.delete_by_user(user_id)
                )
            if self._notification_prefs is not None:
                await _step(
                    "notification_prefs",
                    self._notification_prefs.delete_by_user(user_id),
                )
            if self._user_preferences is not None:
                await _step(
                    "user_preferences",
                    self._user_preferences.delete_by_user(user_id),
                )
            if self._practice is not None:
                await _step("practice", self._practice.delete_by_user(user_id))
            if self._slots is not None:
                await _step(
                    "slots", self._slots.delete_by_applications(application_ids)
                )
                await _step(
                    "bookings", self._bookings.delete_by_applications(application_ids)
                )
            # S3 blob BEFORE the profile row (see earlier ordering fix). Re-raise on
            # S3 failure since a subsequent profile-delete would orphan the object.
            profile = await self._profiles.get_by_user(user_id)
            if profile and profile.get("resume_key"):
                try:
                    await self._storage.delete_raw(profile["resume_key"])
                except Exception:
                    log.exception("erase: resume delete failed for {}", user_id)
                    raise
            await _step("profiles", self._profiles.delete_by_user(user_id))
            if self._sessions is not None:
                await _step("sessions", self._sessions.revoke_user(user_id))
            await _step("anonymize", self._users.anonymize(user_id))
            if failures:
                # Do NOT write the audit row — the erasure is partial and the sweep
                # will retry next tick. Re-raise so the caller (sweep loop) treats
                # this as a failure to be counted / retried.
                raise DependencyError(
                    "erasure partial; some cascade steps failed",
                    context={"user_id": user_id, "steps": failures},
                )
            await self._audit.insert(
                AuditLog(entity="candidate", entity_id=user_id, action="erased")
            )
            log.info("candidate erased: {}", user_id)

    _SWEEP_CONCURRENCY = 10

    async def sweep(self, cutoff):
        async with log_context(log, "resource.compliance.sweep", **bind_ids()):
            users = await self._users.list_candidates_before(cutoff)
            if not users:
                log.info("retention sweep erased 0 candidates")
                return 0
            sem = asyncio.Semaphore(self._SWEEP_CONCURRENCY)
            erased = 0

            async def _erase_one(user):
                nonlocal erased
                async with sem:
                    # Per-candidate isolation: one poison record (e.g. a transient repo
                    # failure) must not abort the whole sweep + block every other
                    # candidate. erase() is idempotent, so the next sweep retries.
                    try:
                        await self.erase(str(user["_id"]))
                        erased += 1
                    except Exception:
                        log.exception("retention erase failed for {}", user["_id"])

            await asyncio.gather(*(_erase_one(u) for u in users))
            log.info("retention sweep erased {}/{} candidates", erased, len(users))
            return erased
