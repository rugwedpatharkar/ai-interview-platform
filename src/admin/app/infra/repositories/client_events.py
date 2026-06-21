from datetime import UTC, datetime

from lib.mongodb import BaseRepository


class ClientEventRepository(BaseRepository[dict]):
    """Append-only store for client-side analytics events.

    TTL: 90 days. See ClientErrorRepository for the created_at / Date-field rationale.
    """

    collection = "client_events"

    async def insert_dedup(self, doc: dict, *, dedup) -> bool:
        """Insert `doc` if `dedup(event_id)` returns True (newly-seen)."""
        if not await dedup(doc["event_id"]):
            return False
        await self.col.insert_one({**doc, "created_at": datetime.now(UTC)})
        return True
