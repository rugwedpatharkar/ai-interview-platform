from datetime import UTC, datetime

from bson import ObjectId
from bson.errors import InvalidId
from lib.mongodb import BaseRepository
from pymongo.errors import DuplicateKeyError

from app.model.notification import Notification


def _oid(notification_id: str) -> ObjectId | None:
    try:
        return ObjectId(notification_id)
    except InvalidId:
        return None


class NotificationRepository(BaseRepository[Notification]):
    collection = "notifications"

    async def insert_dedup(self, notification: Notification) -> bool:
        """Insert; the sparse-unique (user_id, dedup_key) index makes a redelivered
        trigger a no-op. True on insert, False on duplicate (already notified)."""
        try:
            await self.insert(notification)
            return True
        except DuplicateKeyError:
            return False

    async def list_by_user(
        self, user_id: str, *, unread_only: bool = False, limit: int = 50, skip: int = 0
    ) -> list[dict]:
        query: dict = {"user_id": user_id}
        if unread_only:
            query["read_at"] = None
        cursor = self.col.find(query).sort("created_at", -1).skip(skip).limit(limit)
        return await cursor.to_list(length=limit)

    async def count_for(self, user_id: str, unread_only: bool) -> int:
        query: dict = {"user_id": user_id}
        if unread_only:
            query["read_at"] = None
        return await self.col.count_documents(query)

    async def unread_count(self, user_id: str) -> int:
        """Always a fresh count (the badge freshness contract — never denormalized)."""
        return await self.col.count_documents({"user_id": user_id, "read_at": None})

    async def mark_read(self, user_id: str, notification_id: str) -> bool:
        """Scoped read-ack; False (-> NOT_FOUND) only when the row isn't theirs."""
        oid = _oid(notification_id)
        if oid is None:
            return False
        res = await self.col.update_one(
            {"_id": oid, "user_id": user_id},
            {"$set": {"read_at": datetime.now(UTC)}},
        )
        return res.matched_count == 1

    async def mark_all_read(self, user_id: str) -> None:
        await self.col.update_many(
            {"user_id": user_id, "read_at": None},
            {"$set": {"read_at": datetime.now(UTC)}},
        )

    async def delete_by_user(self, user_id: str) -> None:
        await self.col.delete_many({"user_id": user_id})
