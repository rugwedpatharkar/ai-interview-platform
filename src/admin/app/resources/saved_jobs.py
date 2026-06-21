"""Candidate job bookmarks: save / unsave / list over the saved_jobs collection.

Candidate-scoped (the caller, from the token). Save validates the job is published
(no bookmarking drafts → NotFound). ListSavedJobs joins each bookmark to the shared
discovery JobCardDTO projection (published-only), newest first, with `saved_at` added.
A job unpublished after saving drops from the list; the bookmark row stays harmless.
"""

from lib.logging import bind_ids, get_logger, log_context

from app.errors import NotFoundError
from app.resources.discovery import iso, job_card

log = get_logger(component="saved_jobs.resources")


async def save_job(candidate_user_id, job_id, *, saved_jobs, jobs):
    async with log_context(
        log,
        "resource.saved_jobs.save_job",
        **bind_ids(user_id=candidate_user_id, job_id=job_id),
    ):
        job = await jobs.get_by_id(job_id)
        if job is None or job.get("status") != "published":
            raise NotFoundError("job not found")
        await saved_jobs.save(candidate_user_id, job_id)


async def unsave_job(candidate_user_id, job_id, *, saved_jobs):
    async with log_context(
        log,
        "resource.saved_jobs.unsave_job",
        **bind_ids(user_id=candidate_user_id, job_id=job_id),
    ):
        await saved_jobs.unsave(candidate_user_id, job_id)


async def list_saved_jobs(candidate_user_id, *, saved_jobs, jobs, companies):
    async with log_context(
        log,
        "resource.saved_jobs.list_saved_jobs",
        **bind_ids(user_id=candidate_user_id),
    ):
        rows = await saved_jobs.list_by_candidate(candidate_user_id)  # newest first
        if not rows:
            return []
        docs = await jobs.find_published_by_ids([r["job_id"] for r in rows])
        by_id = {str(d["_id"]): d for d in docs}
        comp_ids = list({d.get("comp_id") for d in docs if d.get("comp_id")})
        names = await companies.names_by_ids(comp_ids) if comp_ids else {}
        out = []
        # preserve saved_at-desc order; skip jobs unpublished since saving
        for row in rows:
            doc = by_id.get(row["job_id"])
            if doc is None:
                continue
            card = job_card(doc, names)
            card["saved_at"] = iso(row.get("saved_at"))
            out.append(card)
        return out
