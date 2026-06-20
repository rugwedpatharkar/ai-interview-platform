from datetime import UTC, datetime

from bson import ObjectId
from bson.errors import InvalidId
from lib.mongodb import BaseRepository

from app.model.message import Message, MessageThread


def _oid(value: str) -> ObjectId | None:
    try:
        return ObjectId(value)
    except InvalidId:
        return None


class MessageThreadRepository(BaseRepository[MessageThread]):
    collection = "message_threads"

    async def get(self, application_id: str) -> dict | None:
        return await self.col.find_one({"application_id": application_id})

    async def get_or_create(
        self,
        application_id: str,
        *,
        comp_id,
        candidate_user_id,
        job_title,
        company_name,
    ) -> dict:
        await self.col.update_one(
            {"application_id": application_id},
            {
                "$setOnInsert": {
                    "application_id": application_id,
                    "comp_id": comp_id,
                    "candidate_user_id": candidate_user_id,
                    "recruiter_user_id": "",
                    "job_title": job_title,
                    "company_name": company_name,
                    "last_message_at": None,
                    "last_snippet": "",
                    "unread_candidate": 0,
                    "unread_recruiter": 0,
                    "created_at": datetime.now(UTC),
                }
            },
            upsert=True,
        )
        return await self.col.find_one({"application_id": application_id})

    async def record_send(
        self,
        application_id,
        *,
        last_message_at,
        last_snippet,
        recipient,
        recruiter_user_id,
    ) -> None:
        inc = "unread_candidate" if recipient == "candidate" else "unread_recruiter"
        sets = {"last_message_at": last_message_at, "last_snippet": last_snippet}
        if recruiter_user_id:
            sets["recruiter_user_id"] = recruiter_user_id
        await self.col.update_one(
            {"application_id": application_id}, {"$set": sets, "$inc": {inc: 1}}
        )

    async def mark_read(self, application_id, side) -> None:
        field = "unread_candidate" if side == "candidate" else "unread_recruiter"
        await self.col.update_one(
            {"application_id": application_id}, {"$set": {field: 0}}
        )

    async def list_for_candidate(self, candidate_user_id, *, skip, limit) -> list[dict]:
        cursor = (
            self.col.find({"candidate_user_id": candidate_user_id})
            .sort("last_message_at", -1)
            .skip(skip)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)

    async def count_for_candidate(self, candidate_user_id) -> int:
        return await self.col.count_documents({"candidate_user_id": candidate_user_id})

    async def list_for_comp(self, comp_id, *, skip, limit) -> list[dict]:
        cursor = (
            self.col.find({"comp_id": comp_id})
            .sort("last_message_at", -1)
            .skip(skip)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)

    async def count_for_comp(self, comp_id) -> int:
        return await self.col.count_documents({"comp_id": comp_id})

    async def delete_by_application(self, application_id) -> None:
        await self.col.delete_many({"application_id": application_id})


class MessageRepository(BaseRepository[Message]):
    collection = "messages"

    async def add(self, message: Message) -> str:
        return await self.insert(message)

    async def list_by_thread(self, thread_id, *, skip, limit) -> list[dict]:
        cursor = (
            self.col.find({"thread_id": thread_id})
            .sort("created_at", 1)
            .skip(skip)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)

    async def count_by_thread(self, thread_id) -> int:
        return await self.col.count_documents({"thread_id": thread_id})

    async def mark_other_side_read(self, application_id, reader_side) -> None:
        """Advisory read_at stamp on the OTHER party's previously-unread rows."""
        await self.col.update_many(
            {
                "application_id": application_id,
                "sender_role": {"$ne": reader_side},
                "read_at": None,
            },
            {"$set": {"read_at": datetime.now(UTC)}},
        )

    async def delete_by_application(self, application_id) -> None:
        await self.col.delete_many({"application_id": application_id})
