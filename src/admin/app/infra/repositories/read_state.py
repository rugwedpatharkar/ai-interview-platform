"""Read-state high-water mark repository.

Collection: ``read_state``

Schema (one document per (comp_id, user_id, kind, thread_id) tuple):
    {
        "_id":       ObjectId,
        "comp_id":   str,          # company / tenant scope
        "user_id":   str,
        "kind":      str,          # e.g. "thread" | "notification"
        "thread_id": str,          # the messaging thread_id or notification_id
        "seq_no":    int,          # monotonically increasing high-water mark
    }

Unique index on (user_id, kind, thread_id) makes the upsert idempotent under
concurrent writes — the $max operator ensures the stored value never decreases.
comp_id is stored for future tenant-scoped sweeps / erasure.
"""

from lib.mongodb import BaseRepository


class ReadStateRepository(BaseRepository):
    collection = "read_state"

    async def get_seq_no(
        self, comp_id: str, user_id: str, kind: str, thread_id: str
    ) -> int:
        """Return stored high-water mark; 0 if no record exists yet."""
        doc = await self.col.find_one(
            {"user_id": user_id, "kind": kind, "thread_id": thread_id}
        )
        return doc["seq_no"] if doc else 0

    async def set_seq_no_if_greater(
        self,
        comp_id: str,
        user_id: str,
        kind: str,
        thread_id: str,
        new_seq: int,
    ) -> int:
        """CAS update: store new_seq only when it exceeds the current value.

        seq_no=0 is treated as "pick current+1". Returns the accepted seq_no
        (either the new value if it won, or the existing higher value).
        """
        if new_seq == 0:
            current = await self.get_seq_no(comp_id, user_id, kind, thread_id)
            new_seq = current + 1

        # $max atomically keeps whichever value is larger.
        await self.col.update_one(
            {"user_id": user_id, "kind": kind, "thread_id": thread_id},
            {
                "$max": {"seq_no": new_seq},
                "$setOnInsert": {
                    "comp_id": comp_id,
                    "user_id": user_id,
                    "kind": kind,
                    "thread_id": thread_id,
                },
            },
            upsert=True,
        )
        return await self.get_seq_no(comp_id, user_id, kind, thread_id)
