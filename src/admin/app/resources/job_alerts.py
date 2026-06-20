"""Candidate job alerts (saved searches): create / list / delete.

Candidate-scoped (owner from the token; `candidate_user_id` is never a request field).
An alert is a persisted SearchJobsParams + frequency. Running the searches + emitting
notifications is a SCHEDULED BACKEND SWEEP (not this request path); `last_run_at` is
sweep-written. Boundary rules: frequency must be daily|weekly; a per-candidate cap.
"""

from app.errors import LimitExceededError, NotFoundError, ValidationError
from app.model.job_alert import AlertFilters, JobAlert
from app.resources.discovery import iso

_VALID_FREQ = {"daily", "weekly"}
_MAX_ALERTS = 20


def _alert_dto(doc: dict) -> dict:
    f = doc.get("filters") or {}
    return {
        "alert_id": str(doc["_id"]),
        "keyword": doc.get("keyword", ""),
        "filters": {
            "location": f.get("location", ""),
            "remote_mode": f.get("remote_mode", ""),
            "employment_type": f.get("employment_type", ""),
            "experience_level": f.get("experience_level", ""),
            "skills": f.get("skills", []),
        },
        "frequency": doc.get("frequency", "daily"),
        "created_at": iso(doc.get("created_at")),
        "last_run_at": iso(doc.get("last_run_at")),
    }


async def create_alert(candidate_user_id, keyword, filters, frequency, *, alerts):
    if frequency not in _VALID_FREQ:
        raise ValidationError("frequency must be 'daily' or 'weekly'")
    if await alerts.count_by_candidate(candidate_user_id) >= _MAX_ALERTS:
        raise LimitExceededError(f"at most {_MAX_ALERTS} active alerts")
    skills = sorted(
        {s.strip().lower() for s in (filters.get("skills") or []) if s.strip()}
    )
    alert = JobAlert(
        candidate_user_id=candidate_user_id,
        keyword=keyword or "",
        filters=AlertFilters(
            location=filters.get("location") or "",
            remote_mode=filters.get("remote_mode") or "",
            employment_type=filters.get("employment_type") or "",
            experience_level=filters.get("experience_level") or "",
            skills=skills,
        ),
        frequency=frequency,
    )
    alert_id = await alerts.create(alert)
    return _alert_dto(await alerts.get_scoped(alert_id, candidate_user_id))


async def list_alerts(candidate_user_id, *, alerts):
    return [_alert_dto(r) for r in await alerts.list_by_candidate(candidate_user_id)]


async def delete_alert(candidate_user_id, alert_id, *, alerts):
    if not await alerts.delete_scoped(alert_id, candidate_user_id):
        raise NotFoundError("alert not found")
    return True
