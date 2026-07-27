"""Funnel analytics (recruiter-facing, read-only).

Aggregates the company's applications into per-state counts + the bottom-of-funnel
conversion (hired / total). Manager-only, comp-scoped. C3 (+ follow-up): the
funnel and the no-ghosting KPI dashboard both run as single server-side $facet
aggregations — no row streaming into Python, no 200-row cap.
"""

from datetime import UTC, datetime

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
_DECISION_STATES = [
    ApplicationState.shortlisted.value,
    ApplicationState.rejected.value,
    ApplicationState.hired.value,
    ApplicationState.gated_out.value,
]
_TERMINAL_STATES = [
    *_DECISION_STATES,
    ApplicationState.expired.value,
    ApplicationState.withdrawn.value,
    ApplicationState.abandoned.value,
]


def _utcnow():
    return datetime.now(UTC)


async def get_no_ghosting_kpis(identity, *, applications, clock=_utcnow):
    # Responsiveness KPIs from the application transition-log: candidates awaiting
    # a first action, how fast the company responds, and recent decisions. C3
    # follow-up: one server-side $facet fans out into all six numbers — no
    # collection stream, no 200-row cap.
    async with log_context(
        log,
        "resource.analytics.get_no_ghosting_kpis",
        **bind_ids(comp_id=identity["comp_id"]),
    ):
        if identity["role"] not in _MANAGER_ROLES:
            raise ForbiddenError("Only company users can view analytics")
        kpis = await applications.aggregate_no_ghosting_kpis(
            identity["comp_id"],
            now=clock(),
            sla_hours=_SLA_HOURS,
            decision_states=_DECISION_STATES,
            terminal_states=_TERMINAL_STATES,
        )
        total = kpis["total"]
        return {
            "pending_review": kpis["pending_review"],
            "stale_over_sla": kpis["stale_over_sla"],
            "median_response_hours": kpis["median_response_hours"],
            "response_rate": (kpis["responded"] / total) if total else 0.0,
            "decided_last_7d": kpis["decided_last_7d"],
        }
