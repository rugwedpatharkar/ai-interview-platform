"""RAG-foundation seam fakes: deterministic embeddings, in-memory cosine store, canned
fetch. These are the offline implementations the whole RAG pipeline is unit-tested
against; the real Gemini/Qdrant/httpx impls are exercised only live."""

import pytest

from app.seams import FakeEmbedder, FakeFetcher, FakeVectorStore
from app.seams.fetcher import SsrfBlocked, _validate_url


async def test_fake_embedder_is_deterministic():
    embedder = FakeEmbedder()
    first = await embedder.embed(["hello world"])
    second = await embedder.embed(["hello world"])
    assert first == second
    assert len(first) == 1
    assert len(first[0]) > 0


async def test_fake_embedder_distinct_texts_differ():
    [a, b] = await FakeEmbedder().embed(["python backend", "react frontend"])
    assert a != b


async def test_fake_vector_store_search_orders_by_cosine():
    store = FakeVectorStore()
    await store.upsert(
        "kb:python",
        ids=["a", "b"],
        vectors=[[1.0, 0.0], [0.0, 1.0]],
        payloads=[{"chunk": "A"}, {"chunk": "B"}],
    )
    hits = await store.search("kb:python", [0.9, 0.1], k=2)
    assert [h["id"] for h in hits] == ["a", "b"]
    assert hits[0]["payload"]["chunk"] == "A"


async def test_fake_vector_store_upsert_is_idempotent():
    store = FakeVectorStore()
    await store.upsert("c", ids=["a"], vectors=[[1.0, 0.0]], payloads=[{"v": 1}])
    await store.upsert("c", ids=["a"], vectors=[[1.0, 0.0]], payloads=[{"v": 2}])
    hits = await store.search("c", [1.0, 0.0], k=5)
    assert len(hits) == 1
    assert hits[0]["payload"]["v"] == 2


async def test_fake_vector_store_collections_are_isolated():
    store = FakeVectorStore()
    await store.upsert("c1", ids=["a"], vectors=[[1.0, 0.0]], payloads=[{}])
    assert await store.search("c2", [1.0, 0.0], k=5) == []


async def test_fake_fetcher_returns_canned_text():
    fetcher = FakeFetcher({"http://x": "hello"})
    out = await fetcher.fetch("http://x")
    assert out == {"text": "hello", "url": "http://x"}
    assert fetcher.fetched == ["http://x"]


async def test_ssrf_guard_rejects_non_https():
    with pytest.raises(SsrfBlocked):
        await _validate_url("http://example.com/")
    with pytest.raises(SsrfBlocked):
        await _validate_url("file:///etc/passwd")


async def test_ssrf_guard_rejects_cloud_metadata_hostname():
    with pytest.raises(SsrfBlocked):
        await _validate_url("https://metadata.google.internal/")


async def test_ssrf_guard_rejects_literal_private_ip():
    # 169.254.169.254 is the cloud-metadata address across AWS, GCP, Azure.
    with pytest.raises(SsrfBlocked):
        await _validate_url("https://169.254.169.254/latest/meta-data/")
    with pytest.raises(SsrfBlocked):
        await _validate_url("https://127.0.0.1/admin")
    with pytest.raises(SsrfBlocked):
        await _validate_url("https://10.0.0.1/")
