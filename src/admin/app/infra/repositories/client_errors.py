from datetime import UTC, datetime

from lib.mongodb import BaseRepository


class ClientErrorRepository(BaseRepository[dict]):
    """Append-only store for client-side error events.

    TTL: 30 days. The `created_at` Date field (set at insert time) carries the
    MongoDB TTL index because `occurred_at_ms` is a client-supplied integer, not a
    Date object — only BSON Date fields are eligible for TTL expiration.

    Dedup is Redis-based (24h SET NX EX), not a unique index here, so the repo's
    `insert_dedup` delegates the dedup decision to the caller-supplied async callable.
    """

    collection = "client_errors"

    async def insert_dedup(self, doc: dict, *, dedup) -> bool:
        """Insert `doc` if `dedup(event_id)` returns True (newly-seen).

        `dedup` is an async callable(event_id: str) -> bool supplied by the route
        layer (wraps a Redis SET NX EX 86400). False means duplicate — skip silently.
        """
        if not await dedup(doc["event_id"]):
            return False
        await self.col.insert_one({**doc, "created_at": datetime.now(UTC)})
        return True
