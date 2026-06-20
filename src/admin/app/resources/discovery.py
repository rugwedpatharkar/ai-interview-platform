"""Job-marketplace discovery: search the published catalog with filters + facets.

Shared by the authed `DiscoveryService.SearchJobs` (gRPC) and the public REST
`GET /public/jobs`. Only **published** jobs are returned; the JobCard DTO is scrubbed of
internals (`comp_id` exposed only as the linkable `company_id`; `aptitude_config`,
`required_topics`, draft jobs never ship). The `$text`+`$facet` aggregation lives in
`JobRepository.search_published`; this layer clamps input, maps raw docs → DTO, enriches
`company_name`, and shapes facets.

Fields the Job model lacks yet (remote_mode/employment_type/salary_*/skills) read as
null/empty via `.get` until the W1 extend-Job step adds + populates them. `posted_at`
falls back to `created_at` until a real publish stamp.
"""

MAX_PAGE_SIZE = 24
_VALID_SORT = {"relevance", "recent"}


def iso(value) -> str:  # shared by saved_jobs (datetime -> ISO 8601 or "")
    if value is None:
        return ""
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def _snippet(jd_text: str, limit: int = 160) -> str:
    return (jd_text or "")[:limit]


def _public_fields(doc: dict) -> dict:
    """The scrubbed marketplace scalar fields shared by the JobCard + the detail DTO."""
    return {
        "location": doc.get("location") or "",
        "remote_mode": doc.get("remote_mode") or "",
        "employment_type": doc.get("employment_type") or "",
        "salary_min": doc.get("salary_min") or 0,
        "salary_max": doc.get("salary_max") or 0,
        "salary_currency": doc.get("salary_currency") or "",
        "skills": doc.get("skills") or [],
        "posted_at": iso(doc.get("posted_at") or doc.get("created_at")),
    }


def job_card(doc: dict, company_names: dict[str, str]) -> dict:
    """Map a raw job doc to the public JobCard DTO (internals intentionally dropped)."""
    comp_id = doc.get("comp_id", "")
    return {
        "job_id": str(doc["_id"]),
        "title": doc.get("title", ""),
        "company_id": comp_id,  # linkable public id; raw comp scoping stays internal
        "company_name": company_names.get(comp_id, ""),
        **_public_fields(doc),
        "snippet": _snippet(doc.get("jd_text", "")),
    }


async def get_public_job_detail(job_id, *, jobs, companies) -> dict | None:
    """The full public job-detail DTO for a PUBLISHED job, or None (404).

    Single source of truth with search_jobs for the published-only gate + field scrub:
    full jd_text (not a snippet) + a {id,name,logo} company object. Internals
    (comp_id/aptitude_config/required_topics/gate_mode) never ship. logo stays "" until
    company branding (company_profiles) lands.
    """
    doc = await jobs.get_by_id(job_id)
    if doc is None or doc.get("status") != "published":
        return None
    comp_id = doc.get("comp_id", "")
    names = await companies.names_by_ids([comp_id]) if comp_id else {}
    return {
        "job_id": str(doc["_id"]),
        "title": doc.get("title", ""),
        "jd_text": doc.get("jd_text", ""),
        **_public_fields(doc),
        "company": {"id": comp_id, "name": names.get(comp_id, ""), "logo": ""},
    }


def _buckets(raw: list) -> list[dict]:
    # Drop the null bucket (jobs missing the faceted field) — "" is noise.
    return [{"value": b["_id"], "count": b["count"]} for b in raw if b.get("_id")]


def _clamp_page(value) -> int:
    return value if isinstance(value, int) and value >= 1 else 1


def _clamp_page_size(value) -> int:
    if not isinstance(value, int) or value < 1:
        return MAX_PAGE_SIZE
    return min(value, MAX_PAGE_SIZE)


async def search_jobs(params: dict, *, jobs, companies) -> dict:
    """Run a search; return the JobCard DTO page + facets + pagination."""
    q = params.get("q") or ""
    page = _clamp_page(params.get("page"))
    page_size = _clamp_page_size(params.get("page_size"))
    sort = params.get("sort")
    if sort not in _VALID_SORT:
        sort = "relevance" if q else "recent"

    raw = await jobs.search_published(
        text=q,
        location=params.get("location") or "",
        remote=params.get("remote") or "",
        employment_type=params.get("type") or "",
        level=params.get("level") or "",
        skills=params.get("skills") or [],
        sort=sort,
        skip=(page - 1) * page_size,
        limit=page_size,
    )

    results = raw.get("results", [])
    comp_ids = list({d.get("comp_id") for d in results if d.get("comp_id")})
    company_names = await companies.names_by_ids(comp_ids) if comp_ids else {}
    total_facet = raw.get("total") or []
    total = total_facet[0].get("n", 0) if total_facet else 0

    return {
        "jobs": [job_card(d, company_names) for d in results],
        "facets": {
            "remote_mode": _buckets(raw.get("remote_mode", [])),
            "employment_type": _buckets(raw.get("employment_type", [])),
            "experience_level": _buckets(raw.get("experience_level", [])),
        },
        "total": total,
        "page": page,
        "page_size": page_size,
    }
