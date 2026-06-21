from datetime import UTC, datetime

from lib.mongodb import BaseRepository

from app.model.saved_job import SavedJob


class SavedJobsRepository(BaseRepository[SavedJob]):
    collection = "saved_jobs"

    async def save(self, candidate_user_id: str, job_id: str) -> None:
        """Idempotent bookmark on the unique (candidate, job) pair; stamps saved_at."""
        await self.col.update_one(
            {"candidate_user_id": candidate_user_id, "job_id": job_id},
            {"$setOnInsert": {"saved_at": datetime.now(UTC)}},
            upsert=True,
        )

    async def unsave(self, candidate_user_id: str, job_id: str) -> None:
        await self.col.delete_one(
            {"candidate_user_id": candidate_user_id, "job_id": job_id}
        )

    async def list_by_candidate(self, candidate_user_id: str) -> list[dict]:
        """The candidate's bookmarks, newest first (capped)."""
        cursor = (
            self.col.find({"candidate_user_id": candidate_user_id})
            .sort("saved_at", -1)
            .limit(200)
        )
        return await cursor.to_list(length=200)
