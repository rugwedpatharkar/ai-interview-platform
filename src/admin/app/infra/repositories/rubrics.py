from bson import ObjectId
from bson.errors import InvalidId
from lib.mongodb import BaseRepository

from app.model.rubric import Rubric


def _oid(rubric_id: str) -> ObjectId | None:
    try:
        return ObjectId(rubric_id)
    except InvalidId:
        return None


class RubricRepository(BaseRepository[Rubric]):
    collection = "rubrics"

    async def list_by_comp(self, comp_id: str) -> list[dict]:
        return await self.find_capped({"comp_id": comp_id})

    async def update_scoped(self, rubric_id: str, comp_id: str, fields: dict) -> int:
        oid = _oid(rubric_id)
        if oid is None:
            return 0
        res = await self.col.update_one(
            {"_id": oid, "comp_id": comp_id}, {"$set": fields}
        )
        # matched_count, not modified_count: a no-op update (unchanged fields) still
        # matched the scoped doc, so an idempotent re-save must not 404.
        return res.matched_count

    async def delete_scoped(self, rubric_id: str, comp_id: str) -> int:
        oid = _oid(rubric_id)
        if oid is None:
            return 0
        res = await self.col.delete_one({"_id": oid, "comp_id": comp_id})
        return res.deleted_count
