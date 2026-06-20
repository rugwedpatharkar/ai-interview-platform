from lib.mongodb import BaseRepository

from app.model.coding import CodingAttempt


class CodingAttemptRepository(BaseRepository[CodingAttempt]):
    collection = "coding_attempts"

    async def get_by_application(self, application_id: str) -> dict | None:
        return await self.find_one({"application_id": application_id})

    async def delete_by_candidate(self, candidate_user_id: str) -> None:
        await self.col.delete_many({"candidate_user_id": candidate_user_id})
