from typing import Any


class ReportRepository:
    """Reads the reports collection (written by the ai-agents Report-Writer).

    Admin never authors reports — so it does not extend BaseRepository — but it does
    delete them on candidate erasure (compliance).
    """

    def __init__(self, db: Any) -> None:
        self.col = db["reports"]

    async def get_by_application(self, application_id: str) -> dict | None:
        return await self.col.find_one({"application_id": application_id})

    async def list_by_applications(self, application_ids: list[str]) -> list[dict]:
        # One batched read for analytics score-distribution (no per-applicant N+1).
        if not application_ids:
            return []
        cursor = self.col.find({"application_id": {"$in": application_ids}})
        return await cursor.to_list(length=len(application_ids))

    async def delete_by_applications(self, application_ids: list[str]) -> None:
        if application_ids:
            await self.col.delete_many({"application_id": {"$in": application_ids}})
