from datetime import UTC, datetime

from lib.mongodb import BaseRepository

from app.model.appearance_prefs import AppearancePrefs


class UserPreferencesRepository(BaseRepository[AppearancePrefs]):
    collection = "user_preferences"

    async def get_by_user(self, user_id: str) -> dict | None:
        return await self.find_one({"user_id": user_id})

    async def upsert(self, user_id: str, fields: dict) -> None:
        await self.col.update_one(
            {"user_id": user_id},
            {"$set": {**fields, "user_id": user_id, "updated_at": datetime.now(UTC)}},
            upsert=True,
        )

    async def delete_by_user(self, user_id: str) -> None:
        await self.col.delete_one({"user_id": user_id})
