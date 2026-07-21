from bson import ObjectId
from lib.mongodb import BaseRepository
from lib.schemas import Role

from app.model.auth import User


class UserRepository(BaseRepository[User]):
    collection = "users"

    async def get_by_email(self, email: str) -> dict | None:
        return await self.find_one({"email": email})

    async def get(self, user_id: str) -> dict | None:
        return await self.find_one({"_id": ObjectId(user_id)})

    async def update_fields(self, user_id: str, fields: dict) -> None:
        await self.col.update_one({"_id": ObjectId(user_id)}, {"$set": fields})

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
                    "totp_secret": "",
                    "totp_enabled": False,
                    "recovery_codes": [],
                    "pending_email": "",
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

    # --- Team seats (company members) ---
    async def list_company(
        self, comp_id: str, *, skip: int = 0, limit: int = 50
    ) -> list[dict]:
        cursor = (
            self.col.find({"comp_id": comp_id})
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)

    async def count_company(self, comp_id: str) -> int:
        return await self.col.count_documents({"comp_id": comp_id})

    async def set_status(self, user_id: str, status: str) -> None:
        await self.col.update_one(
            {"_id": ObjectId(user_id)}, {"$set": {"status": status}}
        )

    async def set_role(self, user_id: str, role: str) -> None:
        await self.col.update_one({"_id": ObjectId(user_id)}, {"$set": {"role": role}})

    async def count_active_admins(self, comp_id: str) -> int:
        return await self.col.count_documents(
            {"comp_id": comp_id, "role": Role.company_admin.value, "status": "active"}
        )

    async def revoke_seat(self, user_id: str) -> None:
        # Revoke an employee seat: blank the password (locks login) + mark revoked.
        await self.col.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"status": "revoked", "password_hash": ""}},
        )

    async def consume_recovery_code(self, user_id: str, code_hash: str) -> bool:
        """Atomically remove one recovery-code hash. Returns True iff the hash was
        present (i.e. this caller successfully consumed it). Two concurrent verifies
        with the same code both matched the read-copy but only one $pull removes;
        the loser returns False and the caller treats the code as already used.
        """
        result = await self.col.update_one(
            {"_id": ObjectId(user_id), "recovery_codes": code_hash},
            {"$pull": {"recovery_codes": code_hash}},
        )
        return result.modified_count > 0
