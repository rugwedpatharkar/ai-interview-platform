from typing import Any

from app.model.scheduling import InterviewSlots


class InterviewSlotsRepository:
    """interview_slots — append-only proposal history; one open set per application."""

    def __init__(self, db: Any) -> None:
        self.col = db["interview_slots"]

    async def create(self, slots: InterviewSlots) -> str:
        res = await self.col.insert_one(slots.model_dump())
        return str(res.inserted_id)

    async def get_open_for_application(self, application_id: str) -> dict | None:
        return await self.col.find_one(
            {"application_id": application_id, "status": "open"}
        )

    async def supersede_open(self, application_id: str) -> None:
        await self.col.update_many(
            {"application_id": application_id, "status": "open"},
            {"$set": {"status": "superseded"}},
        )

    async def list_for_application(self, application_id: str) -> list[dict]:
        cursor = self.col.find({"application_id": application_id}).sort(
            "created_at", -1
        )
        return await cursor.to_list(length=100)

    async def delete_by_applications(self, application_ids: list[str]) -> None:
        await self.col.delete_many({"application_id": {"$in": application_ids}})
