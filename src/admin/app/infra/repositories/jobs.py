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

    async def set_status(self, job_id: str, comp_id: str, status: str) -> int:
        oid = _oid(job_id)
        if oid is None:
            return 0
        res = await self.col.update_one(
            {"_id": oid, "comp_id": comp_id}, {"$set": {"status": status}}
        )
        return res.modified_count
