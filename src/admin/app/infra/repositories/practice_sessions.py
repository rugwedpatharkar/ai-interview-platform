from typing import Any


class PracticeSessionRepository:
    """The practice_sessions collection (detached candidate mock-interview summaries) is
    written by ai-agents via mcp-data. Admin doesn't read it, but it deletes a
    candidate's practice runs on erasure (compliance) — admin owns MongoDB.
    """

    def __init__(self, db: Any) -> None:
        self.col = db["practice_sessions"]

    async def delete_by_user(self, user_id: str) -> None:
        await self.col.delete_many({"user_id": user_id})
