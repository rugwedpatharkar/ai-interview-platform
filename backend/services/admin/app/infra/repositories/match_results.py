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

    async def list_by_candidate_paginated(
        self, candidate_user_id: str, *, page_size: int, after_id=None
    ) -> tuple[list[dict], object | None]:
        """Paginated list_by_candidate using _id forward-only cursor."""
        query: dict = {"candidate_user_id": candidate_user_id}
        if after_id is not None:
            query["_id"] = {"$gt": after_id}
        cursor = self.col.find(query).sort("_id", 1).limit(page_size + 1)
        rows = await cursor.to_list(length=page_size + 1)
        if len(rows) > page_size:
            next_after = rows[page_size - 1]["_id"]
            return rows[:page_size], next_after
        return rows, None

    async def count_by_candidate(self, candidate_user_id: str) -> int:
        return await self.col.count_documents({"candidate_user_id": candidate_user_id})

    async def list_by_job(self, job_id: str, comp_id: str) -> list[dict]:
        # comp_id scopes the read defense-in-depth: even past the job-ownership check, a
        # match row from another tenant must never surface in a recruiter's ranking.
        cursor = (
            self.col.find({"job_id": job_id, "comp_id": comp_id})
            .sort("score", -1)
            .limit(200)
        )
        return await cursor.to_list(length=200)
