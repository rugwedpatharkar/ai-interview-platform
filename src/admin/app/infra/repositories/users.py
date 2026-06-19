from bson import ObjectId
from lib.mongodb import BaseRepository

from app.model.auth import User


class UserRepository(BaseRepository[User]):
    collection = "users"

    async def get_by_email(self, email: str) -> dict | None:
        return await self.find_one({"email": email})

    async def set_email_verified(self, user_id: str) -> None:
        await self.col.update_one(
            {"_id": ObjectId(user_id)}, {"$set": {"email_verified": True}}
        )

    async def anonymize(self, user_id: str) -> None:
        # Strip directly-identifying PII but keep the _id so applications + audit logs
        # stay referentially intact (the user becomes a pseudonymous tombstone).
        await self.col.update_one(
            {"_id": ObjectId(user_id)},
            {
                "$set": {
                    "email": f"erased+{user_id}@example.invalid",
                    "password_hash": "",
                    "email_verified": False,
                    "erased": True,
                }
            },
        )

    async def list_candidates_before(
        self, cutoff, *, limit: int = 500, skip: int = 0
    ) -> list[dict]:
        return await self.find(
            {
                "role": "candidate",
                "created_at": {"$lt": cutoff},
                "erased": {"$ne": True},
            },
            limit=limit,
            skip=skip,
        )
