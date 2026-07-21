from datetime import UTC, datetime

from bson import ObjectId
from bson.errors import InvalidId
from lib.mongodb import BaseRepository

from app.model.application import Application


def _oid(application_id: str) -> ObjectId | None:
    try:
        return ObjectId(application_id)
    except InvalidId:
        return None


def _transition(state: str) -> dict:
    return {"state": state, "at": datetime.now(UTC)}


class ApplicationRepository(BaseRepository[Application]):
    collection = "applications"

    async def get(self, application_id: str) -> dict | None:
        # Guard malformed ids so a bad wire value is a clean NotFound, not INTERNAL.
        oid = _oid(application_id)
        return await self.find_one({"_id": oid}) if oid is not None else None

    async def get_by_job_and_candidate(
        self, job_id: str, candidate_user_id: str
    ) -> dict | None:
        return await self.find_one(
            {"job_id": job_id, "candidate_user_id": candidate_user_id}
        )

    async def list_by_candidate(self, candidate_user_id: str) -> list[dict]:
        return await self.find_capped({"candidate_user_id": candidate_user_id})

    async def list_by_job(self, job_id: str, comp_id: str) -> list[dict]:
        return await self.find_capped({"job_id": job_id, "comp_id": comp_id})

    async def list_by_job_paginated(
        self, job_id: str, comp_id: str, *, page_size: int, after_id=None
    ) -> tuple[list[dict], object | None]:
        """Paginated list_by_job using _id forward-only cursor.

        Fetches page_size+1 rows; if that many arrived a next page exists and the
        cursor is the (page_size+1)-th doc's _id. Trims result to page_size.
        """
        query: dict = {"job_id": job_id, "comp_id": comp_id}
        if after_id is not None:
            query["_id"] = {"$gt": after_id}
        cursor = self.col.find(query).sort("_id", 1).limit(page_size + 1)
        rows = await cursor.to_list(length=page_size + 1)
        if len(rows) > page_size:
            next_after = rows[page_size - 1]["_id"]
            return rows[:page_size], next_after
        return rows, None

    async def count_by_job(self, job_id: str, comp_id: str) -> int:
        return await self.col.count_documents({"job_id": job_id, "comp_id": comp_id})

    async def list_talent_pool_paginated(
        self, comp_id: str, *, page_size: int, after_user_id: str | None = None
    ) -> tuple[list[tuple[str, int]], str | None]:
        """Aggregate by candidate for talent pool, paginated by candidate_user_id.

        Returns ([(candidate_user_id, count), ...], next_after_user_id | None).
        Uses an aggregation pipeline with a string cursor on candidate_user_id.
        The $match on after_user_id sits after $group/$sort so it filters on the
        grouped candidate IDs, not on raw application documents.
        """
        pipeline: list[dict] = [
            {"$match": {"comp_id": comp_id}},
            {"$group": {"_id": "$candidate_user_id", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}},
        ]
        if after_user_id is not None:
            pipeline.append({"$match": {"_id": {"$gt": after_user_id}}})
        pipeline.append({"$limit": page_size + 1})
        rows = await self.col.aggregate(pipeline).to_list(length=page_size + 1)
        rows = [r for r in rows if r["_id"]]
        if len(rows) > page_size:
            next_after = rows[page_size - 1]["_id"]
            return [(r["_id"], r["count"]) for r in rows[:page_size]], next_after
        return [(r["_id"], r["count"]) for r in rows], None

    async def count_talent_pool(self, comp_id: str) -> int:
        """Count distinct candidates who have applied to this company's jobs."""
        pipeline = [
            {"$match": {"comp_id": comp_id}},
            {"$group": {"_id": "$candidate_user_id"}},
            {"$count": "n"},
        ]
        result = await self.col.aggregate(pipeline).to_list(length=1)
        return result[0]["n"] if result else 0

    async def list_by_comp(self, comp_id: str) -> list[dict]:
        # Analytics call sites moved to aggregate_state_counts / iter_by_comp so
        # the 200-row find_capped no longer silently truncates KPIs. This one is
        # kept for the small-cardinality callers (recruiter dashboards that page
        # UI-first).
        return await self.find_capped({"comp_id": comp_id})

    async def aggregate_state_counts(self, comp_id: str) -> dict:
        """Server-side funnel roll-up: {states: [{state, count}], total, hired}.
        Runs one $facet against Mongo — no row-by-row Python loop, no cap."""
        pipeline = [
            {"$match": {"comp_id": comp_id}},
            {
                "$facet": {
                    "states": [
                        {"$group": {"_id": "$state", "count": {"$sum": 1}}},
                        {"$project": {"_id": 0, "state": "$_id", "count": 1}},
                        {"$sort": {"state": 1}},
                    ],
                    "totals": [{"$count": "n"}],
                    "hired": [
                        {"$match": {"state": "hired"}},
                        {"$count": "n"},
                    ],
                }
            },
        ]
        result = await self.col.aggregate(pipeline).to_list(length=1)
        if not result:
            return {"states": [], "total": 0, "hired": 0}
        r = result[0]
        return {
            "states": r.get("states", []),
            "total": r["totals"][0]["n"] if r.get("totals") else 0,
            "hired": r["hired"][0]["n"] if r.get("hired") else 0,
        }

    async def iter_by_comp(self, comp_id: str, *, projection: dict | None = None):
        """Async iterator over every application in `comp_id` — unbounded and
        projection-friendly so KPI callers pull only the fields they need without
        the 200-row find_capped ceiling. Backed by the (comp_id, job_id) index."""
        cursor = self.col.find({"comp_id": comp_id}, projection=projection)
        async for doc in cursor:
            yield doc

    async def list_by_state(self, state: str) -> list[dict]:
        return await self.find_capped({"state": state})

    async def set_state(self, application_id: str, state: str) -> None:
        oid = _oid(application_id)
        if oid is None:
            return
        await self.col.update_one(
            {"_id": oid},
            {"$set": {"state": state}, "$push": {"transitions": _transition(state)}},
        )

    async def set_state_if(
        self, application_id: str, expected_current: str, new: str
    ) -> bool:
        """Compare-and-swap the funnel state. Returns False when the row is not in
        `expected_current` (already advanced, missing, or a malformed id), so callers
        can treat a redelivery/race as a no-op instead of clobbering state. On success
        appends a {state, at} entry to `transitions` for stage-timing analytics."""
        oid = _oid(application_id)
        if oid is None:
            return False
        res = await self.col.update_one(
            {"_id": oid, "state": expected_current},
            {"$set": {"state": new}, "$push": {"transitions": _transition(new)}},
        )
        return res.modified_count == 1
