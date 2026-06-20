from typing import Any


class CodingTaskRepository:
    """Reads the coding_tasks collection (one task per job).

    Read-only here — A6 authoring is a seed/follow-up (see the plan) — so it does
    not extend BaseRepository.
    """

    def __init__(self, db: Any) -> None:
        self.col = db["coding_tasks"]

    async def get_by_job(self, job_id: str) -> dict | None:
        return await self.col.find_one({"job_id": job_id})
