"""Recommendation fan-out: on profile.parsed, match the new candidate against open jobs.

Capped to `limit` published jobs so one parse can't fan out unbounded match.run events;
this pre-populates the candidate's recommendations before they apply (discovery).
Recency-ordering is a follow-up; today it's a bounded published-jobs read.
"""

from lib.logging import bind_ids, get_logger, log_context

log = get_logger(component="recommend.resources")


async def fan_out_match(payload, *, jobs, publisher, limit):
    async with log_context(
        log,
        "resource.recommend.fan_out_match",
        **bind_ids(),
    ):
        user_id = payload.get("user_id")
        if not user_id:
            # Malformed profile.parsed: raise so the consumer dead-letters it.
            # A silent ack would lose the candidate's fan-out.
            raise ValueError("profile.parsed missing user_id")
        open_jobs = await jobs.list_published_capped(limit)
        for job in open_jobs:
            await publisher.publish(
                "match.run",
                {
                    "comp_id": job["comp_id"],
                    "job_id": str(job["_id"]),
                    "candidate_user_id": user_id,
                },
            )
        if len(open_jobs) >= limit:
            log.warning(
                "recommend fan-out capped at {} jobs for user {}", limit, user_id
            )
        log.info("recommend fan-out: {} match.run for user {}", len(open_jobs), user_id)
        return len(open_jobs)
