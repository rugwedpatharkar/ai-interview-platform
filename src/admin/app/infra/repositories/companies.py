from bson import ObjectId
from bson.errors import InvalidId
from lib.mongodb import BaseRepository

from app.model.auth import Company


class CompanyRepository(BaseRepository[Company]):
    collection = "companies"

    async def names_by_ids(self, comp_ids: list[str]) -> dict[str, str]:
        """Map company id -> name for the given ids in one batch (missing ids omitted).

        Enriches the marketplace JobCard with company_name without an N+1 per job.
        """
        oids = []
        for cid in comp_ids:
            try:
                oids.append(ObjectId(cid))
            except InvalidId:
                continue
        if not oids:
            return {}
        rows = await self.find({"_id": {"$in": oids}})
        return {str(r["_id"]): r.get("name", "") for r in rows}
