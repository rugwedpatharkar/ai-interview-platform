from datetime import UTC, datetime

from lib.mongodb import BaseRepository

from app.model.notification_prefs import NotificationPrefs


class NotificationPrefsRepository(BaseRepository[NotificationPrefs]):
    collection = "notification_prefs"

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
