"""Funnel analytics (recruiter-facing, read-only).

Aggregates the company's applications into per-state counts + the bottom-of-funnel
conversion (hired / total). Manager-only, comp-scoped, repository-capped.
"""

from collections import Counter
from datetime import UTC, datetime, timedelta

from lib.logging import get_logger
from lib.schemas import ApplicationState, Role

from app.errors import ForbiddenError

log = get_logger(component="analytics.resources")

_MANAGER_ROLES = {Role.company_admin.value, Role.recruiter.value}


def _percentile(sorted_scores, q):
    """Type-7 (linear) percentile; `sorted_scores` non-empty, q in [0,1]."""
    if len(sorted_scores) == 1:
        return sorted_scores[0]
    pos = q * (len(sorted_scores) - 1)
    lo = int(pos)
    if lo + 1 >= len(sorted_scores):
        return sorted_scores[lo]
    return sorted_scores[lo] + (pos - lo) * (sorted_scores[lo + 1] - sorted_scores[lo])


async def get_funnel_analytics(identity, *, applications):
    if identity["role"] not in _MANAGER_ROLES:
        raise ForbiddenError("Only company users can view analytics")
    rows = await applications.list_by_comp(identity["comp_id"])
    counts = Counter(r.get("state", "") for r in rows)
    total = len(rows)
    hired = counts.get(ApplicationState.hired.value, 0)
    return {
        "states": [{"state": s, "count": c} for s, c in sorted(counts.items())],
        "total": total,
        "conversion_rate": (hired / total) if total else 0.0,
    }


async def get_job_score_distribution(identity, job_id, *, applications, reports):
    """Bias view: overall-score spread across a job's scored candidates."""
    if identity["role"] not in _MANAGER_ROLES:
        raise ForbiddenError("Only company users can view analytics")
    apps = await applications.list_by_job(job_id, identity["comp_id"])
    app_ids = [str(a["_id"]) for a in apps]
    scores = [
        r.get("overall_score", 0.0) for r in await reports.list_by_applications(app_ids)
    ]
    if not scores:
        return dict.fromkeys(("count", "min", "max", "mean", "p25", "p50", "p75"), 0.0)
    scores.sort()
    return {
        "count": len(scores),
        "min": scores[0],
        "max": scores[-1],
        "mean": sum(scores) / len(scores),
        "p25": _percentile(scores, 0.25),
        "p50": _percentile(scores, 0.50),
        "p75": _percentile(scores, 0.75),
    }


_SLA_HOURS = 7 * 24  # a candidate waiting longer than this with no movement is "stale"
_DECISION_STATES = {
    ApplicationState.shortlisted.value,
    ApplicationState.rejected.value,
    ApplicationState.hired.value,
    ApplicationState.gated_out.value,
}
_TERMINAL_STATES = _DECISION_STATES | {
    ApplicationState.expired.value,
    ApplicationState.withdrawn.value,
    ApplicationState.abandoned.value,
}


def _utcnow():
    return datetime.now(UTC)


def _as_utc(value):
    """Coerce a stored instant (Mongo datetime or ISO str) to aware UTC."""
    if value is None:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value)
        except ValueError:
            return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _median(values):
    if not values:
        return 0.0
    s = sorted(values)
    mid = len(s) // 2
    return s[mid] if len(s) % 2 else (s[mid - 1] + s[mid]) / 2


async def get_no_ghosting_kpis(identity, *, applications, clock=_utcnow):
    """Responsiveness KPIs from the application transition-log: candidates awaiting a
    first action, how fast the company responds, and recent decisions. No new
    collection — reads each Application's `transitions` array + `created_at`."""
    if identity["role"] not in _MANAGER_ROLES:
        raise ForbiddenError("Only company users can view analytics")
    rows = await applications.list_by_comp(identity["comp_id"])
    now = clock()
    pending_review = stale_over_sla = responded = decided_last_7d = 0
    response_hours = []
    for r in rows:
        created = _as_utc(r.get("created_at"))
        transitions = r.get("transitions") or []
        if transitions:
            responded += 1
            first_at = _as_utc(transitions[0].get("at"))
            if created and first_at:
                response_hours.append((first_at - created).total_seconds() / 3600)
            last = transitions[-1]
            last_at = _as_utc(last.get("at"))
            if (
                last.get("state") in _DECISION_STATES
                and last_at
                and (now - last_at) <= timedelta(days=7)
            ):
                decided_last_7d += 1
        elif r.get("state", "") not in _TERMINAL_STATES:
            pending_review += 1
            if created and (now - created).total_seconds() / 3600 >= _SLA_HOURS:
                stale_over_sla += 1
    total = len(rows)
    return {
        "pending_review": pending_review,
        "stale_over_sla": stale_over_sla,
        "median_response_hours": _median(response_hours),
        "response_rate": (responded / total) if total else 0.0,
        "decided_last_7d": decided_last_7d,
    }
