from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from pydantic import BaseModel

from lib.logging import get_logger, log_context
from lib.resilience import with_timeout

log = get_logger(component="mongodb.repository")

_LIST_CAP = 200
# Default per-operation timeout — generous enough to cover slow Atlas queries.
_DEFAULT_TIMEOUT_S = 10.0


def _oid(doc_id: str) -> ObjectId | None:
    """Parse a 24-hex id; None when malformed so a bad client id is a clean miss
    (NOT_FOUND / no-op) instead of an unhandled bson.InvalidId that surfaces as 500."""
    try:
        return ObjectId(doc_id)
    except (InvalidId, TypeError):
        return None


class BaseRepository[M: BaseModel]:
    """Thin async CRUD base over a MongoDB collection.

    Subclasses set `collection` and add domain queries. Tenant-owned repositories
    build `comp_id`-scoped filters in their own methods — scoping is a domain
    concern, kept explicit rather than hidden here.

    Every external call is wrapped with `with_timeout` and emits structured
    entry/exit/error logs so slow or failing queries are always observable.
    """

    collection: str
    _timeout_s: float = _DEFAULT_TIMEOUT_S
    # Absolute ceiling for an unbounded find() — a backstop against loading a whole
    # collection into memory. find_capped (200) is the norm for list endpoints.
    _find_cap: int = 10_000

    def __init__(self, db: Any) -> None:
        self.col = db[self.collection]

    async def insert(self, doc: M) -> str:
        async with log_context(log, f"{self.collection}.insert"):
            res = await with_timeout(
                self.col.insert_one(doc.model_dump()),
                self._timeout_s,
                op=f"{self.collection}.insert",
            )
        return str(res.inserted_id)

    async def get(self, doc_id: str) -> dict | None:
        oid = _oid(doc_id)
        if oid is None:
            return None
        async with log_context(log, f"{self.collection}.get", doc_id=doc_id):
            return await with_timeout(
                self.col.find_one({"_id": oid}),
                self._timeout_s,
                op=f"{self.collection}.get",
            )

    def _max_time_ms(self) -> int:
        # Server-side deadline for long-running reads. asyncio.timeout in with_timeout
        # cancels the coroutine locally but pymongo keeps the op running on the server
        # — connection-pool exhaustion under overload. maxTimeMS asks the server to
        # actually kill the op when the deadline passes.
        return int(self._timeout_s * 1000)

    async def find_one(self, query: dict) -> dict | None:
        async with log_context(log, f"{self.collection}.find_one"):
            return await with_timeout(
                self.col.find_one(query, max_time_ms=self._max_time_ms()),
                self._timeout_s,
                op=f"{self.collection}.find_one",
            )

    async def find(self, query: dict, limit: int = 0, skip: int = 0) -> list[dict]:
        # Always bound the result set: an explicit limit is honoured, but limit=0 falls
        # back to the hard ceiling so an unbounded query can never load the whole
        # collection (OOM / DoS). A list endpoint that wants the soft 200 cap uses
        # find_capped.
        cap = min(limit, self._find_cap) if limit else self._find_cap
        async with log_context(log, f"{self.collection}.find", limit=limit, skip=skip):
            cursor = (
                self.col.find(query)
                .skip(skip)
                .limit(cap)
                .max_time_ms(self._max_time_ms())
            )
            rows = await with_timeout(
                _collect(cursor),
                self._timeout_s,
                op=f"{self.collection}.find",
            )
        if not limit and len(rows) >= self._find_cap:
            log.warning("{}: find hit the hard cap {}", self.collection, self._find_cap)
        return rows

    async def update(self, doc_id: str, fields: dict) -> None:
        oid = _oid(doc_id)
        if oid is None:
            return
        async with log_context(log, f"{self.collection}.update", doc_id=doc_id):
            await with_timeout(
                self.col.update_one({"_id": oid}, {"$set": fields}),
                self._timeout_s,
                op=f"{self.collection}.update",
            )

    async def delete(self, doc_id: str) -> None:
        oid = _oid(doc_id)
        if oid is None:
            return
        async with log_context(log, f"{self.collection}.delete", doc_id=doc_id):
            await with_timeout(
                self.col.delete_one({"_id": oid}),
                self._timeout_s,
                op=f"{self.collection}.delete",
            )

    async def count(self, query: dict) -> int:
        async with log_context(log, f"{self.collection}.count"):
            return await with_timeout(
                self.col.count_documents(query, maxTimeMS=self._max_time_ms()),
                self._timeout_s,
                op=f"{self.collection}.count",
            )

    async def find_capped(self, query: dict, cap: int = _LIST_CAP) -> list[dict]:
        """Find with a hard result cap; warns when the cap truncates so an unbounded
        list query can't silently load (or be used to DoS) the whole collection."""
        rows = await self.find(query, limit=cap)
        if len(rows) >= cap:
            log.warning("{}: result truncated at cap {}", self.collection, cap)
        return rows


async def _collect(cursor) -> list[dict]:
    return [doc async for doc in cursor]
