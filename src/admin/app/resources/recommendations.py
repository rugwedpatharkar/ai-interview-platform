"""Recommendation reads: a candidate's own matches + a job's ranked applicants.

The AI Matcher (ai-agents) writes match_results; this surfaces them. A candidate sees
only their own; a recruiter sees only their own-comp job's ranked candidates (scoped via
the job). Results are score-desc; reads are repository-capped.
"""

from lib.logging import get_logger
from lib.schemas import Role

from app.errors import ForbiddenError, NotFoundError

log = get_logger(component="recommendation.resources")

_MANAGER_ROLES = {Role.company_admin.value, Role.recruiter.value}


def _to_match(row):
    return {
        "job_id": row.get("job_id", ""),
        "candidate_user_id": row.get("candidate_user_id", ""),
        "score": row.get("score", 0.0),
        "reasons": row.get("reasons", []),
    }


def _ranked(rows):
    ordered = sorted(rows, key=lambda r: r.get("score", 0.0), reverse=True)
    return [_to_match(r) for r in ordered]


async def get_candidate_recommendations(identity, *, matches):
    if identity["role"] != Role.candidate.value:
        raise ForbiddenError("Only candidates have recommendations")
    return _ranked(await matches.list_by_candidate(identity["id"]))


async def get_job_ranked_candidates(identity, job_id, *, jobs, matches):
    if identity["role"] not in _MANAGER_ROLES:
        raise ForbiddenError("Only company users can view ranked candidates")
    if await jobs.get_scoped(job_id, identity["comp_id"]) is None:
        raise NotFoundError("Job not found")
    return _ranked(await matches.list_by_job(job_id, identity["comp_id"]))
