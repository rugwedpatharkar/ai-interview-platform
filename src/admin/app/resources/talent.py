"""Talent pool (recruiter-facing, read-only).

The pool is the set of candidates who have applied to the company's jobs, with their
application count. Manager-only, comp-scoped. (Explicit add-to-pool is a follow-up.)
"""

from collections import Counter

from lib.logging import get_logger
from lib.schemas import Role

from app.errors import ForbiddenError

log = get_logger(component="talent.resources")

_MANAGER_ROLES = {Role.company_admin.value, Role.recruiter.value}


async def get_talent_pool(identity, *, applications):
    if identity["role"] not in _MANAGER_ROLES:
        raise ForbiddenError("Only company users can view the talent pool")
    rows = await applications.list_by_comp(identity["comp_id"])
    counts = Counter(r.get("candidate_user_id", "") for r in rows)
    return [
        {"candidate_user_id": uid, "application_count": n}
        for uid, n in sorted(counts.items())
        if uid
    ]
