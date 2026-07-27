from datetime import UTC, datetime, timedelta

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


def _empty_no_ghosting() -> dict:
    return {
        "total": 0,
        "responded": 0,
        "pending_review": 0,
        "stale_over_sla": 0,
        "decided_last_7d": 0,
        "median_response_hours": 0.0,
    }


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
        # Analytics call sites moved to aggregate_state_counts /
        # aggregate_no_ghosting_kpis so the 200-row find_capped no longer
        # silently truncates KPIs. This one is kept for the small-cardinality
        # callers (recruiter dashboards that page UI-first).
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

    async def aggregate_no_ghosting_kpis(
        self,
        comp_id: str,
        *,
        now: datetime,
        sla_hours: int,
        decision_states: list[str],
        terminal_states: list[str],
    ) -> dict:
        """Server-side $facet for the responsiveness KPI dashboard. One
        collection pass fans out into six numbers instead of streaming every
        application into Python.

        Median hours uses `$percentile` (Mongo 7+, method="approximate"): a
        t-digest estimate — exact enough for the dashboard and cheap on
        multi-thousand-app tenants where streaming was the hot cost.
        """
        stale_cutoff = now - timedelta(hours=sla_hours)
        week_ago = now - timedelta(days=7)
        pending_match = {
            "transitions.0": {"$exists": False},
            "state": {"$nin": terminal_states},
        }
        pipeline = [
            {"$match": {"comp_id": comp_id}},
            {
                "$facet": {
                    "totals": [{"$count": "n"}],
                    "responded": [
                        {"$match": {"transitions.0": {"$exists": True}}},
                        {"$count": "n"},
                    ],
                    "pending": [{"$match": pending_match}, {"$count": "n"}],
                    "stale": [
                        {
                            "$match": {
                                **pending_match,
                                "created_at": {
                                    "$lte": stale_cutoff,
                                    "$type": "date",
                                },
                            }
                        },
                        {"$count": "n"},
                    ],
                    "decided_last_7d": [
                        {"$match": {"transitions.0": {"$exists": True}}},
                        {"$project": {"last": {"$arrayElemAt": ["$transitions", -1]}}},
                        {
                            "$match": {
                                "last.state": {"$in": decision_states},
                                "last.at": {"$gte": week_ago, "$type": "date"},
                            }
                        },
                        {"$count": "n"},
                    ],
                    "median_response_hours": [
                        {
                            "$match": {
                                "transitions.0": {"$exists": True},
                                "created_at": {"$type": "date"},
                            }
                        },
                        {
                            "$project": {
                                "first_at": {"$arrayElemAt": ["$transitions.at", 0]},
                                "created_at": 1,
                            }
                        },
                        {"$match": {"first_at": {"$type": "date"}}},
                        {
                            "$project": {
                                "hours": {
                                    "$divide": [
                                        {"$subtract": ["$first_at", "$created_at"]},
                                        3_600_000,
                                    ]
                                }
                            }
                        },
                        {
                            "$group": {
                                "_id": None,
                                "p50": {
                                    "$percentile": {
                                        "input": "$hours",
                                        "p": [0.5],
                                        "method": "approximate",
                                    }
                                },
                            }
                        },
                        {
                            "$project": {
                                "_id": 0,
                                "value": {"$arrayElemAt": ["$p50", 0]},
                            }
                        },
                    ],
                }
            },
        ]
        result = await self.col.aggregate(pipeline).to_list(length=1)
        if not result:
            return _empty_no_ghosting()
        r = result[0]

        def _cnt(k: str) -> int:
            arr = r.get(k) or []
            return arr[0].get("n", 0) if arr else 0

        median_arr = r.get("median_response_hours") or []
        median = (median_arr[0].get("value") or 0.0) if median_arr else 0.0
        return {
            "total": _cnt("totals"),
            "responded": _cnt("responded"),
            "pending_review": _cnt("pending"),
            "stale_over_sla": _cnt("stale"),
            "decided_last_7d": _cnt("decided_last_7d"),
            "median_response_hours": float(median),
        }

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
