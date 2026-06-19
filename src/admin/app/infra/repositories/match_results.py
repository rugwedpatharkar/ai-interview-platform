from typing import Any


class MatchResultRepository:
    """Reads the match_results collection (written by the ai-agents Matcher).

    Admin never authors match results — it surfaces them to candidates (their own) and
    recruiters (a job's ranked applicants). Reads are capped (bounded find).
    """

    def __init__(self, db: Any) -> None:
        self.col = db["match_results"]

    async def list_by_candidate(self, candidate_user_id: str) -> list[dict]:
        # Sort by score in the query so the cap keeps the true top-N (not an arbitrary
        # natural-order slice that a later in-memory sort can no longer recover).
        cursor = (
            self.col.find({"candidate_user_id": candidate_user_id})
            .sort("score", -1)
            .limit(200)
        )
        return await cursor.to_list(length=200)

    async def list_by_job(self, job_id: str, comp_id: str) -> list[dict]:
        # comp_id scopes the read defense-in-depth: even past the job-ownership check, a
        # match row from another tenant must never surface in a recruiter's ranking.
        cursor = (
            self.col.find({"job_id": job_id, "comp_id": comp_id})
            .sort("score", -1)
            .limit(200)
        )
        return await cursor.to_list(length=200)
