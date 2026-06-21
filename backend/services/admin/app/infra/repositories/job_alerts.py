from bson import ObjectId
from bson.errors import InvalidId
from lib.mongodb import BaseRepository

from app.model.job_alert import JobAlert


def _oid(alert_id: str) -> ObjectId | None:
    try:
        return ObjectId(alert_id)
    except InvalidId:
        return None


class JobAlertsRepository(BaseRepository[JobAlert]):
    collection = "job_alerts"

    async def count_by_candidate(self, candidate_user_id: str) -> int:
        return await self.col.count_documents({"candidate_user_id": candidate_user_id})

    async def create(self, alert: JobAlert) -> str:
        return await self.insert(alert)

    async def get_scoped(self, alert_id: str, candidate_user_id: str) -> dict | None:
        oid = _oid(alert_id)
        if oid is None:
            return None
        return await self.find_one({"_id": oid, "candidate_user_id": candidate_user_id})

    async def list_by_candidate(self, candidate_user_id: str) -> list[dict]:
        cursor = (
            self.col.find({"candidate_user_id": candidate_user_id})
            .sort("created_at", -1)
            .limit(100)
        )
        return await cursor.to_list(length=100)

    async def delete_scoped(self, alert_id: str, candidate_user_id: str) -> bool:
        oid = _oid(alert_id)
        if oid is None:
            return False
        res = await self.col.delete_one(
            {"_id": oid, "candidate_user_id": candidate_user_id}
        )
        return res.deleted_count == 1
