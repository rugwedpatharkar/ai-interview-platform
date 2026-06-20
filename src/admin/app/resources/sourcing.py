"""Talent sourcing: keyword search over the company's OWN applicants.

The candidate universe is **every candidate with an application to a job owned by this
comp_id** (the same seed `get_talent_pool` uses) — application-existence, never current
funnel state, so rejected / closed-job applicants stay searchable. There is no global
candidate index. The DTO carries only the human-in-the-loop subset (masked handle, counts,
fit score, furthest stage, matched skills) — no ID / background / biometric data.
"""

from collections import defaultdict

from lib.logging import get_logger
from lib.schemas import Role

from app.errors import ForbiddenError

log = get_logger(component="sourcing.resources")

_MANAGER_ROLES = {Role.company_admin.value, Role.recruiter.value}
_MAX_PAGE_SIZE = 50

# Furthest-reached ranking for top_stage (deeper in the pipeline = higher).
_STAGE_RANK = {
    "applied": 1,
    "expired": 1,
    "withdrawn": 1,
    "abandoned": 1,
    "aptitude_pending": 2,
    "gated_out": 2,
    "interview_pending": 3,
    "interviewed": 4,
    "scored": 5,
    "rejected": 6,
    "shortlisted": 6,
    "hired": 7,
}


def _clamp_page(value) -> int:
    return value if isinstance(value, int) and value >= 1 else 1


def _clamp_page_size(value) -> int:
    if not isinstance(value, int) or value < 1:
        return _MAX_PAGE_SIZE
    return min(value, _MAX_PAGE_SIZE)


def _top_stage(states) -> str:
    return max(states, key=lambda s: _STAGE_RANK.get(s, 0))


async def search_candidates(
    identity,
    query,
    *,
    applications,
    profiles,
    stage="",
    min_score=0.0,
    page=1,
    page_size=24,
):
    if identity["role"] not in _MANAGER_ROLES:
        raise ForbiddenError("Only company users can search candidates")
    page = _clamp_page(page)
    page_size = _clamp_page_size(page_size)

    rows = await applications.list_by_comp(identity["comp_id"])
    states_by_candidate = defaultdict(list)
    for r in rows:
        uid = r.get("candidate_user_id", "")
        if uid:
            states_by_candidate[uid].append(r.get("state", "applied"))
    if not states_by_candidate:
        return {"hits": [], "total": 0, "page": page, "page_size": page_size}

    docs = await profiles.find_by_user_ids(list(states_by_candidate))
    profile_by_uid = {d.get("user_id", ""): d for d in docs}

    terms = [t for t in query.lower().split() if t]
    hits = []
    for uid, states in states_by_candidate.items():
        profile = profile_by_uid.get(uid, {})
        skills = [str(s) for s in profile.get("skills", [])]
        text = " ".join(
            skills
            + [str(e) for e in profile.get("experience", [])]
            + [profile.get("full_name") or ""]
        ).lower()
        matched_skills = [s for s in skills if any(t in s.lower() for t in terms)]
        matched_terms = {t for t in terms if t in text}
        if terms and not matched_terms:
            continue  # a query was given but nothing matched -> not a hit
        top = _top_stage(states)
        if stage and top != stage:
            continue
        fit_score = len(matched_terms) / len(terms) if terms else 1.0
        if fit_score < min_score:
            continue
        hits.append(
            {
                "candidate_user_id": uid,
                "application_count": len(states),
                "fit_score": fit_score,
                "top_stage": top,
                "matched_skills": matched_skills,
            }
        )

    hits.sort(key=lambda h: (-h["fit_score"], h["candidate_user_id"]))
    start = (page - 1) * page_size
    return {
        "hits": hits[start : start + page_size],
        "total": len(hits),
        "page": page,
        "page_size": page_size,
    }
