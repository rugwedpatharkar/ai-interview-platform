from lib.mongodb import BaseRepository

from app.model.aptitude import AptitudeDelivery


class AptitudeDeliveryRepository(BaseRepository[AptitudeDelivery]):
    collection = "aptitude_deliveries"

    async def get_by_application(self, application_id: str) -> dict | None:
        return await self.find_one({"application_id": application_id})

    async def list_stale(
        self, cutoff, *, limit: int = 500, skip: int = 0
    ) -> list[dict]:
        return await self.find(
            {"delivered_at": {"$lt": cutoff}}, limit=limit, skip=skip
        )
