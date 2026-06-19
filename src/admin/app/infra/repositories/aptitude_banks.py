from typing import Any


class AptitudeBankRepository:
    """Reads the aptitude_banks collection (written by the ai-agents Aptitude-Setter).

    Read-only here — admin never authors banks — so it does not extend BaseRepository.
    """

    def __init__(self, db: Any) -> None:
        self.col = db["aptitude_banks"]

    async def get_by_job(self, job_id: str) -> dict | None:
        return await self.col.find_one({"job_id": job_id})
