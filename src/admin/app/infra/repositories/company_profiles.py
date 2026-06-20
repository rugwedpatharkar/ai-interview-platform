from lib.mongodb import BaseRepository

from app.model.company_profile import CompanyProfile


class CompanyProfileRepository(BaseRepository[CompanyProfile]):
    collection = "company_profiles"

    async def get_by_comp(self, comp_id: str) -> dict | None:
        return await self.find_one({"comp_id": comp_id})
