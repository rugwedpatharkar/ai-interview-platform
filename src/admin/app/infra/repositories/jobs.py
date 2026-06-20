from bson import ObjectId
from bson.errors import InvalidId
from lib.mongodb import BaseRepository

from app.model.job import Job


def _oid(job_id: str) -> ObjectId | None:
    try:
        return ObjectId(job_id)
    except InvalidId:
        return None


class JobRepository(BaseRepository[Job]):
    collection = "jobs"

    async def get_scoped(self, job_id: str, comp_id: str) -> dict | None:
        oid = _oid(job_id)
        if oid is None:
            return None
        return await self.find_one({"_id": oid, "comp_id": comp_id})

    async def get_by_id(self, job_id: str) -> dict | None:
        oid = _oid(job_id)
        return await self.find_one({"_id": oid}) if oid is not None else None

    async def list_by_company(self, comp_id: str) -> list[dict]:
        return await self.find_capped({"comp_id": comp_id})

    async def list_published_capped(self, limit: int) -> list[dict]:
        return await self.find_capped({"status": "published"}, cap=limit)

    async def find_published_by_ids(self, job_ids: list[str]) -> list[dict]:
        """Published jobs among `job_ids` (saved-jobs join; non-published dropped)."""
        oids = [oid for oid in (_oid(j) for j in job_ids) if oid is not None]
        if not oids:
            return []
        return await self.find({"_id": {"$in": oids}, "status": "published"}, limit=200)

    async def set_status(self, job_id: str, comp_id: str, status: str) -> int:
        oid = _oid(job_id)
        if oid is None:
            return 0
        res = await self.col.update_one(
            {"_id": oid, "comp_id": comp_id}, {"$set": {"status": status}}
        )
        return res.modified_count

    async def search_published(
        self,
        *,
        text: str = "",
        location: str = "",
        remote: str = "",
        employment_type: str = "",
        level: str = "",
        skills: list | None = None,
        sort: str = "recent",
        skip: int = 0,
        limit: int = 24,
    ) -> dict:
        """$text + $facet over published jobs: one pass = page + total + facets.

        Filters narrow the $match. `text` adds a $text search; its score is $addFields'd
        into a real field BEFORE $facet (sub-pipelines can't read textScore $meta) so
        results can sort by relevance. Only status="published" matches. Returns the raw
        $facet doc; resources/discovery shapes it into the DTO.
        """
        match: dict = {"status": "published"}
        if text:
            match["$text"] = {"$search": text}
        if location:
            match["location"] = location
        if remote:
            match["remote_mode"] = remote
        if employment_type:
            match["employment_type"] = employment_type
        if level:
            match["experience_level"] = level
        if skills:
            match["skills"] = {"$all": skills}

        sort_spec: dict = {"created_at": -1}
        stages: list = [{"$match": match}]
        if text:
            stages.append({"$addFields": {"_score": {"$meta": "textScore"}}})
            if sort == "relevance":
                sort_spec = {"_score": -1, "created_at": -1}
        stages.append(
            {
                "$facet": {
                    "results": [
                        {"$sort": sort_spec},
                        {"$skip": skip},
                        {"$limit": limit},
                    ],
                    "total": [{"$count": "n"}],
                    "remote_mode": [
                        {"$group": {"_id": "$remote_mode", "count": {"$sum": 1}}}
                    ],
                    "employment_type": [
                        {"$group": {"_id": "$employment_type", "count": {"$sum": 1}}}
                    ],
                    "experience_level": [
                        {"$group": {"_id": "$experience_level", "count": {"$sum": 1}}}
                    ],
                }
            }
        )
        docs = await self.col.aggregate(stages).to_list(length=1)
        return docs[0] if docs else {}
