from lib.mongodb import BaseRepository

from app.model.aptitude import AptitudeAttempt


class AptitudeAttemptRepository(BaseRepository[AptitudeAttempt]):
    collection = "aptitude_attempts"

    async def delete_by_candidate(self, candidate_user_id: str) -> None:
        await self.col.delete_many({"candidate_user_id": candidate_user_id})
