"""Hybrid dense+BM25 retrieval fused by RRF — keyword hits surface past pure vector."""

from app.retrieval import hybrid_search
from app.seams import FakeVectorStore


class _StubEmbedder:
    """Returns a fixed query vector so the dense ranking is controlled in-test."""

    def __init__(self, vector):
        self._vector = vector

    async def embed(self, texts):
        return [list(self._vector) for _ in texts]


async def _store():
    store = FakeVectorStore()
    await store.upsert(
        "kb:python",
        ids=["A", "B", "C"],
        vectors=[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.5, 0.5, 0.0]],
        payloads=[
            {"chunk": "python asyncio coroutines", "source": {"url": "a"}},
            {"chunk": "react hooks rendering", "source": {"url": "b"}},
            {"chunk": "python generators iterators", "source": {"url": "c"}},
        ],
    )
    return store


async def test_keyword_hit_outranks_pure_semantic_hit():
    store = await _store()
    # Query vector points hardest at B (no keyword overlap); BM25 favors C.
    embedder = _StubEmbedder([0.3, 0.95, 0.0])
    hits = await hybrid_search(
        "python generators",
        embedder=embedder,
        store=store,
        collection="kb:python",
        k=3,
    )
    chunks = [h["chunk"] for h in hits]
    assert chunks[0] == "python generators iterators"
    assert chunks.index("python generators iterators") < chunks.index(
        "react hooks rendering"
    )


async def test_pure_vector_would_bury_the_keyword_hit():
    # Contrast: vector-only top-1 is B, not the keyword-exact chunk C.
    store = await _store()
    dense = await store.search("kb:python", [0.3, 0.95, 0.0], k=1)
    assert dense[0]["payload"]["chunk"] == "react hooks rendering"


async def test_other_collection_is_empty():
    store = await _store()
    embedder = _StubEmbedder([1.0, 0.0, 0.0])
    assert (
        await hybrid_search(
            "python", embedder=embedder, store=store, collection="kb:other", k=3
        )
        == []
    )


async def test_rrf_ties_broken_by_stable_id():
    store = FakeVectorStore()
    # Dense favors X (id "zzz"); BM25 favors Y (id "aaa") -> equal fused RRF score. The
    # vector store's cosine-tie order is unspecified, so the tie must break on the id.
    await store.upsert(
        "kb:t",
        ids=["zzz", "aaa"],
        vectors=[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
        payloads=[
            {"chunk": "java spring", "source": {"url": "x"}},
            {"chunk": "python coroutines", "source": {"url": "y"}},
        ],
    )
    embedder = _StubEmbedder([1.0, 0.0, 0.0])
    hits = await hybrid_search(
        "python", embedder=embedder, store=store, collection="kb:t", k=2
    )
    assert [h["source"]["url"] for h in hits] == ["y", "x"]  # id "aaa" < "zzz"


async def test_all_empty_text_pool_does_not_crash():
    # A pool whose chunks are all empty must not divide by a zero average doc length.
    store = FakeVectorStore()
    await store.upsert(
        "kb:e",
        ids=["1", "2"],
        vectors=[[1.0, 0.0], [0.0, 1.0]],
        payloads=[{"chunk": "", "source": None}, {"chunk": "", "source": None}],
    )
    embedder = _StubEmbedder([1.0, 0.0])
    hits = await hybrid_search(
        "anything", embedder=embedder, store=store, collection="kb:e", k=2
    )
    assert len(hits) == 2
