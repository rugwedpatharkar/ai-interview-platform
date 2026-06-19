from bson import ObjectId
from bson.errors import InvalidId
from lib.mongodb import BaseRepository

from app.model.application import Application


def _oid(application_id: str) -> ObjectId | None:
    try:
        return ObjectId(application_id)
    except InvalidId:
        return None


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

    async def list_by_comp(self, comp_id: str) -> list[dict]:
        return await self.find_capped({"comp_id": comp_id})

    async def set_state(self, application_id: str, state: str) -> None:
        await self.update(application_id, {"state": state})

    async def set_state_if(
        self, application_id: str, expected_current: str, new: str
    ) -> bool:
        """Compare-and-swap the funnel state. Returns False when the row is not in
        `expected_current` (already advanced, missing, or a malformed id), so callers
        can treat a redelivery/race as a no-op instead of clobbering state."""
        oid = _oid(application_id)
        if oid is None:
            return False
        res = await self.col.update_one(
            {"_id": oid, "state": expected_current}, {"$set": {"state": new}}
        )
        return res.modified_count == 1
