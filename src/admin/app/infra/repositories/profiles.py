from lib.mongodb import BaseRepository

from app.model.profile import CandidateProfile


class CandidateProfileRepository(BaseRepository[CandidateProfile]):
    collection = "candidate_profiles"

    async def get_by_user(self, user_id: str) -> dict | None:
        return await self.find_one({"user_id": user_id})

    async def update_by_user(self, user_id: str, fields: dict) -> None:
        await self.col.update_one({"user_id": user_id}, {"$set": fields})

    async def delete_by_user(self, user_id: str) -> None:
        await self.col.delete_one({"user_id": user_id})
