from typing import Any


class InterviewRepository:
    """The interviews collection (transcripts) is written by ai-agents via mcp-data.

    Admin doesn't read it, but it deletes a candidate's transcripts on erasure
    (compliance) — admin is the source of truth that owns MongoDB.
    """

    def __init__(self, db: Any) -> None:
        self.col = db["interviews"]

    async def delete_by_user(self, user_id: str) -> None:
        await self.col.delete_many({"user_id": user_id})

    async def get_by_application(self, application_id: str) -> dict | None:
        """The interview doc (keyed by application_id) — for the proctor-termination
        marker on the integrity timeline."""
        return await self.col.find_one({"application_id": application_id})
