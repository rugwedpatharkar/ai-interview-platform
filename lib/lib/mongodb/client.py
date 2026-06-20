from typing import Any

from pymongo import AsyncMongoClient


class MongoManager:
    """Owns the AsyncMongoClient lifecycle and exposes the database handle.

    One instance per service process. PyMongo's async client is connection-pooled;
    `max_pool_size` is the main per-replica scale lever.
    """

    def __init__(
        self,
        uri: str,
        db_name: str,
        max_pool_size: int = 100,
        min_pool_size: int = 0,
    ) -> None:
        self._client: AsyncMongoClient = AsyncMongoClient(
            uri, maxPoolSize=max_pool_size, minPoolSize=min_pool_size
        )
        self._db = self._client[db_name]

    @property
    def db(self) -> Any:
        return self._db

    async def ping(self) -> bool:
        # Startup health probe: wrap the raw pymongo failure (ServerSelectionTimeout,
        # auth, etc.) in a clear error so a downed DB fails fast with a readable message
        # instead of an opaque driver traceback.
        try:
            await self._client.admin.command("ping")
        except Exception as exc:
            raise RuntimeError("MongoDB unavailable") from exc
        return True

    async def close(self) -> None:
        await self._client.close()
