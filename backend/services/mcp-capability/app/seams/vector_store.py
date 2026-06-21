"""Vector-store seam: upsert + cosine top-k over tenant/topic collections.

Contract: `upsert(collection, ids, vectors, payloads)` and
`search(collection, vector, k) -> [{id, score, payload}]`. `QdrantVectorStore` keeps its
client import call-local; `FakeVectorStore` is a pure in-memory cosine top-k used as the
default in tests. (Qdrant point ids must be int/UUID — the caller maps content hashes to
UUIDs before upsert; the seam forwards ids unchanged.)
"""

import math


def _cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


class QdrantVectorStore:
    def __init__(self, url, api_key=""):
        from qdrant_client import AsyncQdrantClient

        # `api_key` is required by managed Qdrant (Qdrant Cloud); empty for a local
        # cluster. Pass None when unset so the client doesn't send an empty bearer.
        self._client = AsyncQdrantClient(url=url, api_key=api_key or None)

    async def upsert(self, collection, ids, vectors, payloads):
        from qdrant_client import models

        if not vectors:
            return
        await self._ensure(collection, len(vectors[0]))
        points = [
            models.PointStruct(id=pid, vector=vector, payload=payload)
            for pid, vector, payload in zip(ids, vectors, payloads, strict=True)
        ]
        await self._client.upsert(collection_name=collection, points=points)

    async def search(self, collection, vector, k):
        result = await self._client.query_points(
            collection_name=collection, query=vector, limit=k, with_payload=True
        )
        return [
            {"id": point.id, "score": point.score, "payload": point.payload or {}}
            for point in result.points
        ]

    async def _ensure(self, collection, dim):
        from qdrant_client import models

        if await self._client.collection_exists(collection):
            return
        await self._client.create_collection(
            collection_name=collection,
            vectors_config=models.VectorParams(
                size=dim, distance=models.Distance.COSINE
            ),
        )


class FakeVectorStore:
    """In-memory cosine top-k; collections are isolated, idempotent by id."""

    def __init__(self):
        self._collections = {}

    async def upsert(self, collection, ids, vectors, payloads):
        bucket = self._collections.setdefault(collection, {})
        for pid, vector, payload in zip(ids, vectors, payloads, strict=True):
            bucket[pid] = (list(vector), payload)

    async def search(self, collection, vector, k):
        bucket = self._collections.get(collection, {})
        scored = [
            {"id": pid, "score": _cosine(vector, stored), "payload": payload}
            for pid, (stored, payload) in bucket.items()
        ]
        scored.sort(key=lambda hit: hit["score"], reverse=True)
        return scored[:k]
