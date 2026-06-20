from typing import Any


class ProctorEventsRepository:
    """proctoring_events is written by ai-agents (advisory signals; no raw media). Admin
    is the first READER — the recruiter integrity timeline. Comp-scoped reads via the
    (comp_id, application_id) index."""

    def __init__(self, db: Any) -> None:
        self.col = db["proctoring_events"]

    async def find_by_application(
        self, comp_id: str, application_id: str
    ) -> list[dict]:
        cursor = (
            self.col.find({"comp_id": comp_id, "application_id": application_id})
            .sort("at", 1)
            .limit(1000)
        )
        return await cursor.to_list(length=1000)
