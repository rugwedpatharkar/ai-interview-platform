"""Public company profile: branding + funnel-derived trust signals.

`get_company_profile` is an unauthenticated read of a PUBLISHED company (>=1 published
job or a branding doc). Trust signals come from funnel ground-truth — the application
transition-log — never self-reported: `responds_in_days` = median(applied -> first
transition) over the company's applications (0 below the min-sample threshold);
`actively_reviewing` = any application moved within the trailing window.
`list_company_jobs` reuses the shared `job_card` projection so the company page renders
the same JobCard as search. Internals (comp_id, funnel rows, applicant ids) never ship.
"""

from datetime import UTC, datetime, timedelta
from statistics import median

from app.resources.discovery import job_card

_MIN_SAMPLE = 3
_WINDOW_DAYS = 30
_MAX_PAGE_SIZE = 24


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _clamp_page(value) -> int:
    return value if isinstance(value, int) and value >= 1 else 1


def _clamp_page_size(value) -> int:
    if not isinstance(value, int) or value < 1:
        return _MAX_PAGE_SIZE
    return min(value, _MAX_PAGE_SIZE)


def _trust_signals(apps, open_jobs, *, now) -> dict:
    cutoff = now - timedelta(days=_WINDOW_DAYS)
    durations = []
    actively = False
    for a in apps:
        transitions = a.get("transitions") or []
        if not transitions:
            continue
        created = a.get("created_at")
        first_at = transitions[0].get("at")
        if created and first_at:
            durations.append((first_at - created).total_seconds() / 86400)
        if any(t.get("at") and t["at"] >= cutoff for t in transitions):
            actively = True
    responds = round(median(durations)) if len(durations) >= _MIN_SAMPLE else 0
    return {
        "actively_reviewing": actively,
        "responds_in_days": responds,
        "open_jobs": open_jobs,
    }


async def get_company_profile(
    comp_id, *, companies, profiles, jobs, applications, now=None
) -> dict | None:
    now = now or _utcnow()
    open_jobs = await jobs.count_published_by_comp(comp_id)
    branding = await profiles.get_by_comp(comp_id)
    if open_jobs == 0 and branding is None:
        return None  # no published presence -> 404 (opaque; never leak existence)
    names = await companies.names_by_ids([comp_id])
    apps = await applications.list_by_comp(comp_id)
    branding = branding or {}
    return {
        "id": comp_id,  # public id; raw comp scoping stays internal
        "name": names.get(comp_id, ""),
        "about": branding.get("about") or "",
        "website": branding.get("website") or "",
        "logo": branding.get("logo") or "",
        "locations": branding.get("locations") or [],
        "trust": _trust_signals(apps, open_jobs, now=now),
    }


async def list_company_jobs(comp_id, *, jobs, companies, page=1, page_size=24) -> dict:
    page = _clamp_page(page)
    page_size = _clamp_page_size(page_size)
    rows = await jobs.list_published_by_comp(
        comp_id, skip=(page - 1) * page_size, limit=page_size
    )
    total = await jobs.count_published_by_comp(comp_id)
    names = await companies.names_by_ids([comp_id]) if rows else {}
    return {
        "jobs": [job_card(r, names) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
