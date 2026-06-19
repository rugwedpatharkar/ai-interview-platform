"""Funnel analytics (recruiter-facing, read-only).

Aggregates the company's applications into per-state counts + the bottom-of-funnel
conversion (hired / total). Manager-only, comp-scoped, repository-capped.
"""

from collections import Counter

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
