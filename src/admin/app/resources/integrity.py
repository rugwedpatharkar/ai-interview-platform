"""Recruiter integrity timeline — the first reader of proctoring_events.

Manager-only, comp-scoped via the application (the tenant source of truth): a forged or
mismatched comp_id is NotFound. severity is server-authoritative — read from the stored
event (ai-agents stamps it at ingest), never recomputed here. `integrity_score` is the
weighted sum (weights mirror the ai-agents proctoring model — kept here because the two
services can't share a module). `auto_terminated`/`terminated_reason` come from the
interview doc's `terminated_by_proctor` finalize marker. An application with no events
is a clean zero (not 404). The DTO carries only {type, severity, at, meta} — no media.
"""

from lib.schemas import Role

from app.errors import ForbiddenError, NotFoundError
from app.resources.discovery import iso

_MANAGER_ROLES = {Role.company_admin.value, Role.recruiter.value}
_WEIGHT = {"low": 1, "medium": 3, "high": 8}


def _flag(e: dict) -> dict:
    return {
        "type": e.get("type", ""),
        "severity": e.get("severity", "low"),
        "at": iso(e.get("at")),
        "meta": {k: str(v) for k, v in (e.get("meta") or {}).items()},
    }


async def get_integrity_timeline(
    identity,
    application_id,
    *,
    applications,
    proctoring_events,
    interviews,
    storage=None,
):
    if identity["role"] not in _MANAGER_ROLES:
        raise ForbiddenError("Only company users can read integrity timelines")
    application = await applications.get(application_id)
    if application is None or application.get("comp_id") != identity["comp_id"]:
        raise NotFoundError("Application not found")
    events = await proctoring_events.find_by_application(
        identity["comp_id"], application_id
    )
    score = sum(_WEIGHT.get(e.get("severity", "low"), 1) for e in events)
    interview = await interviews.get_by_application(application_id) or {}
    reason = interview.get("terminated_by_proctor", "") or ""
    # The recording_key carries the tenant prefix and is presigned verbatim; tenant
    # authz already happened above (the application's comp_id == the caller's). Empty
    # until interview capture (LiveKit egress) lands the key — C1.
    recording_key = interview.get("recording_key", "")
    recording_url = (
        await storage.presigned_get_url_raw(recording_key)
        if recording_key and storage
        else ""
    )
    return {
        "integrity_score": score,
        "flags": [_flag(e) for e in events],
        "recording_url": recording_url,
        "auto_terminated": bool(reason),
        "terminated_reason": reason,
    }
