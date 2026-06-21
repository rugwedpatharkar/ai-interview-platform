from lib.mongodb import BaseRepository

from app.model.compliance import ConsentRecord


class ConsentRepository(BaseRepository[ConsentRecord]):
    collection = "consents"

    async def list_by_user(
        self, user_id: str, *, limit: int = 200, skip: int = 0
    ) -> list[dict]:
        return await self.find({"user_id": user_id}, limit=limit, skip=skip)

    async def delete_by_user(self, user_id: str) -> None:
        await self.col.delete_many({"user_id": user_id})
