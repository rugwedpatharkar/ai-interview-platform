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
from uuid import uuid4

from lib.errors import DependencyError
from lib.logging import bind_ids, get_logger, log_context

from app.errors import ValidationError
from app.resources.discovery import job_card
from app.resources.permissions import require_permission

log = get_logger(component="company_profile.resources")

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


async def _logo_url(comp_id, logo_key, storage):
    """A presigned GET URL for the stored logo key (regenerated per read); "" when no
    logo or no storage. The page caches ~5m, well within the URL lifetime. Storage
    failures raise DependencyError so the client sees UNAVAILABLE instead of an empty
    image silently rendering."""
    if not logo_key or storage is None:
        return ""
    try:
        return await storage.presigned_get_url(comp_id, "branding", logo_key)
    except Exception as exc:
        log.exception(
            "company_profile: presigned URL generation failed for key={}", logo_key
        )
        raise DependencyError(
            "logo presign failed", context={"comp_id": comp_id, "key": logo_key}
        ) from exc


async def get_company_profile(
    comp_id, *, companies, profiles, jobs, applications, storage=None, now=None
) -> dict | None:
    async with log_context(
        log, "resource.company_profile.get_company_profile", **bind_ids(comp_id=comp_id)
    ):
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
            "logo": await _logo_url(comp_id, branding.get("logo") or "", storage),
            "locations": branding.get("locations") or [],
            "trust": _trust_signals(apps, open_jobs, now=now),
        }


async def list_company_jobs(comp_id, *, jobs, companies, page=1, page_size=24) -> dict:
    async with log_context(
        log, "resource.company_profile.list_company_jobs", **bind_ids(comp_id=comp_id)
    ):
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


_LOGO_TYPES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
_MAX_ABOUT = 4096
_MAX_WEBSITE = 512
_MAX_LOCATIONS = 20
_MAX_LOCATION_LEN = 120


def _validate_branding(payload):
    about = payload.get("about", "") or ""
    website = payload.get("website", "") or ""
    locations = payload.get("locations") or []
    if len(about) > _MAX_ABOUT:
        raise ValidationError("about is too long")
    if len(website) > _MAX_WEBSITE:
        raise ValidationError("website is too long")
    if website and not website.startswith(("http://", "https://")):
        raise ValidationError("website must be an http(s) URL")
    if len(locations) > _MAX_LOCATIONS:
        raise ValidationError(f"at most {_MAX_LOCATIONS} locations")
    if any(len(loc) > _MAX_LOCATION_LEN for loc in locations):
        raise ValidationError("a location is too long")
    return {
        "about": about,
        "website": website,
        "logo": payload.get("logo", "") or "",
        "locations": list(locations),
    }


async def upsert_company_profile(
    identity, payload, *, profiles, companies, jobs, applications, storage=None
):
    async with log_context(
        log,
        "resource.company_profile.upsert_company_profile",
        **bind_ids(comp_id=identity["comp_id"]),
    ):
        # Company-admin edits branding (branding:edit scope).
        # Returns the merged public profile DTO (freshly-presigned logo URL).
        require_permission(identity, "branding:edit")
        fields = _validate_branding(payload)
        await profiles.upsert_branding(identity["comp_id"], fields)
        return await get_company_profile(
            identity["comp_id"],
            companies=companies,
            profiles=profiles,
            jobs=jobs,
            applications=applications,
            storage=storage,
        )


async def presign_logo_upload(identity, content_type, *, storage):
    async with log_context(
        log,
        "resource.company_profile.presign_logo_upload",
        **bind_ids(comp_id=identity["comp_id"]),
    ):
        # Presigned PUT for the company logo (branding:edit).
        # The returned object_key is echoed back as UpsertCompanyProfile.logo.
        require_permission(identity, "branding:edit")
        ext = _LOGO_TYPES.get(content_type)
        if ext is None:
            raise ValidationError("logo must be PNG, JPEG, or WebP")
        key = f"logo-{uuid4().hex}.{ext}"
        upload_url = await storage.presigned_put_url(
            identity["comp_id"], "branding", key, content_type
        )
        return {"upload_url": upload_url, "object_key": key}
