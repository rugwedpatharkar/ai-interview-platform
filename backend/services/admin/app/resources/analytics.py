"""Funnel analytics (recruiter-facing, read-only).

Aggregates the company's applications into per-state counts + the bottom-of-funnel
conversion (hired / total). Manager-only, comp-scoped. C3: no longer bounded to
the first 200 rows — funnel uses server-side $facet, KPIs stream via iter_by_comp
with a projection so multi-thousand-app tenants see accurate numbers.
"""

from datetime import UTC, datetime, timedelta

from lib.logging import bind_ids, get_logger, log_context
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
    async with log_context(
        log,
        "resource.analytics.get_funnel_analytics",
        **bind_ids(comp_id=identity["comp_id"]),
    ):
        if identity["role"] not in _MANAGER_ROLES:
            raise ForbiddenError("Only company users can view analytics")
        # C3: server-side $facet — was list_by_comp which capped at 200 rows.
        agg = await applications.aggregate_state_counts(identity["comp_id"])
        total = agg["total"]
        hired = agg["hired"]
        return {
            "states": agg["states"],
            "total": total,
            "conversion_rate": (hired / total) if total else 0.0,
        }


async def get_job_score_distribution(identity, job_id, *, applications, reports):
    # Bias view: overall-score spread across a job's scored candidates.
    async with log_context(
        log,
        "resource.analytics.get_job_score_distribution",
        **bind_ids(comp_id=identity["comp_id"], job_id=job_id),
    ):
        if identity["role"] not in _MANAGER_ROLES:
            raise ForbiddenError("Only company users can view analytics")
        apps = await applications.list_by_job(job_id, identity["comp_id"])
        app_ids = [str(a["_id"]) for a in apps]
        scores = [
            r.get("overall_score", 0.0)
            for r in await reports.list_by_applications(app_ids)
        ]
        if not scores:
            return dict.fromkeys(
                ("count", "min", "max", "mean", "p25", "p50", "p75"), 0.0
            )
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
    # Responsiveness KPIs from the application transition-log: candidates awaiting a
    # first action, how fast the company responds, and recent decisions. No new
    # collection — reads each Application's `transitions` array + `created_at`.
    async with log_context(
        log,
        "resource.analytics.get_no_ghosting_kpis",
        **bind_ids(comp_id=identity["comp_id"]),
    ):
        if identity["role"] not in _MANAGER_ROLES:
            raise ForbiddenError("Only company users can view analytics")
        # C3: uncapped stream + tight projection (only fields the loop reads) —
        # was list_by_comp which capped at 200 rows and returned full docs. This
        # walks the (comp_id, ...) index without buffering the whole result set.
        now = clock()
        pending_review = stale_over_sla = responded = decided_last_7d = 0
        response_hours = []
        total = 0
        projection = {
            "_id": 0,
            "state": 1,
            "created_at": 1,
            "transitions": 1,
        }
        async for r in applications.iter_by_comp(
            identity["comp_id"], projection=projection
        ):
            total += 1
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
        return {
            "pending_review": pending_review,
            "stale_over_sla": stale_over_sla,
            "median_response_hours": _median(response_hours),
            "response_rate": (responded / total) if total else 0.0,
            "decided_last_7d": decided_last_7d,
        }
