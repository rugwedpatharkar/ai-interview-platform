"""embed / kb_search / ingest tools — caching, dedup, topic + tenant isolation."""

from app.schemas import KbSearchResult
from app.seams import FakeEmbedder, FakeFetcher, FakeVectorStore
from app.tools import embed, ingest, kb_search

_PAGE = "Python coroutines use async def. Generators yield values lazily."


class _FakeRedis:
    def __init__(self):
        self.kv = {}
        self.sets = {}
        self.expires = {}

    async def get(self, key):
        return self.kv.get(key)

    async def set(self, key, value, ex=None):
        self.kv[key] = value

    async def sismember(self, key, member):
        return member in self.sets.get(key, set())

    async def sadd(self, key, member):
        self.sets.setdefault(key, set()).add(member)

    async def incr(self, key):
        self.kv[key] = int(self.kv.get(key, 0)) + 1
        return self.kv[key]

    async def expire(self, key, seconds):
        self.expires[key] = seconds


class _CountingEmbedder(FakeEmbedder):
    def __init__(self):
        super().__init__()
        self.calls = 0

    async def embed(self, texts):
        self.calls += 1
        return await super().embed(texts)


async def _seed(redis, *, url="http://py", topic="python", text=_PAGE):
    store = FakeVectorStore()
    fetcher = FakeFetcher({url: text})
    result = await ingest(
        "tenant1",
        [{"topic": topic, "url": url}],
        fetcher=fetcher,
        embedder=FakeEmbedder(),
        store=store,
        redis=redis,
    )
    return store, result


class _FlakyFetcher:
    """Raises for every URL except ``good_url`` (per-source isolation test)."""

    def __init__(self, good_url, text):
        self._good = good_url
        self._text = text

    async def fetch(self, url):
        if url != self._good:
            raise RuntimeError(f"fetch failed for {url}")
        return {"text": self._text, "url": url}


async def test_ingest_isolates_a_failing_source():
    """A failing source is counted in `failed` and does NOT abort the batch."""
    redis = _FakeRedis()
    store = FakeVectorStore()
    result = await ingest(
        "tenant1",
        [
            {"topic": "python", "url": "http://bad"},  # fetch raises
            {"topic": "python", "url": "http://good"},  # still ingested
        ],
        fetcher=_FlakyFetcher("http://good", _PAGE),
        embedder=FakeEmbedder(),
        store=store,
        redis=redis,
    )
    assert result.failed == 1
    assert result.ingested > 0  # the good source after the failure still ingested


async def test_embed_returns_one_vector_per_text():
    out = await embed(["a", "b"], embedder=FakeEmbedder())
    assert len(out) == 2
    assert len(out[0]) > 0


async def test_ingest_then_kb_search_returns_a_citation():
    redis = _FakeRedis()
    store, result = await _seed(redis)
    assert result.ingested > 0
    found = await kb_search(
        "coroutines",
        "python",
        "tenant1",
        embedder=FakeEmbedder(),
        store=store,
        redis=redis,
    )
    assert isinstance(found, KbSearchResult)
    assert found.chunks
    assert any(c.url == "http://py" for c in found.citations)


async def test_ingest_dedups_by_content_hash():
    redis = _FakeRedis()
    _, first = await _seed(redis)
    _, second = await _seed(redis)  # identical source re-ingested
    assert second.ingested == 0
    assert second.skipped == first.ingested


async def test_kb_search_is_cached():
    redis = _FakeRedis()
    store, _ = await _seed(redis)
    embedder = _CountingEmbedder()
    await kb_search(
        "coroutines", "python", "tenant1", embedder=embedder, store=store, redis=redis
    )
    after_first = embedder.calls
    await kb_search(
        "coroutines", "python", "tenant1", embedder=embedder, store=store, redis=redis
    )
    assert embedder.calls == after_first  # second call served from cache, no re-embed
    assert after_first >= 1


async def test_topics_are_isolated():
    redis = _FakeRedis()
    store, _ = await _seed(
        redis, url="http://py", topic="python", text="python coroutines"
    )
    fetcher = FakeFetcher({"http://js": "javascript closures"})
    await ingest(
        "tenant1",
        [{"topic": "javascript", "url": "http://js"}],
        fetcher=fetcher,
        embedder=FakeEmbedder(),
        store=store,
        redis=redis,
    )
    found = await kb_search(
        "closures",
        "python",
        "tenant1",
        embedder=FakeEmbedder(),
        store=store,
        redis=redis,
    )
    assert all("javascript" not in c for c in found.chunks)


async def test_owners_are_isolated():
    redis = _FakeRedis()
    store = FakeVectorStore()
    fetcher = FakeFetcher(
        {"http://a": "alpha tenant content", "http://b": "beta tenant content"}
    )
    for owner, url in (("tenantA", "http://a"), ("tenantB", "http://b")):
        await ingest(
            owner,
            [{"topic": "python", "url": url}],
            fetcher=fetcher,
            embedder=FakeEmbedder(),
            store=store,
            redis=redis,
        )
    found = await kb_search(
        "content",
        "python",
        "tenantA",
        embedder=FakeEmbedder(),
        store=store,
        redis=redis,
    )
    assert found.chunks
    assert all("beta" not in c for c in found.chunks)  # never tenantB's content
    assert all(c.url == "http://a" for c in found.citations)


def _spy_hybrid(monkeypatch, state):
    async def spy(query, *, embedder, store, collection, k):
        state["calls"] += 1
        state["last_k"] = k
        return []

    monkeypatch.setattr("app.tools.hybrid_search", spy)


async def test_kb_search_clamps_k(monkeypatch):
    state = {"calls": 0, "last_k": None}
    _spy_hybrid(monkeypatch, state)
    await kb_search(
        "q",
        "python",
        "t1",
        embedder=FakeEmbedder(),
        store=FakeVectorStore(),
        redis=_FakeRedis(),
        k=1000,
    )
    assert state["last_k"] == 50  # an unbounded k is capped before the retrieval


async def test_ingest_invalidates_kb_search_cache(monkeypatch):
    redis = _FakeRedis()
    store = FakeVectorStore()
    state = {"calls": 0, "last_k": None}
    _spy_hybrid(monkeypatch, state)
    kw = {"embedder": FakeEmbedder(), "store": store, "redis": redis}
    await kb_search("q", "python", "t1", **kw)
    await kb_search("q", "python", "t1", **kw)  # served from cache
    assert state["calls"] == 1
    await ingest(
        "t1",
        [{"topic": "python", "url": "u"}],
        fetcher=FakeFetcher({"u": _PAGE}),
        embedder=FakeEmbedder(),
        store=store,
        redis=redis,
    )
    await kb_search("q", "python", "t1", **kw)  # ingest bumped the version -> miss
    assert state["calls"] == 2


async def test_kb_search_cache_key_is_collision_safe(monkeypatch):
    # Under a ':'-joined key, (topic="a", k=5, query="6:b") and (topic="a:5", k=6,
    # query="b") both render "...:a:5:6:b" — a hashed JSON tuple keeps them distinct.
    redis = _FakeRedis()
    state = {"calls": 0, "last_k": None}
    _spy_hybrid(monkeypatch, state)
    kw = {"embedder": FakeEmbedder(), "store": FakeVectorStore(), "redis": redis}
    await kb_search("6:b", "a", "t1", k=5, **kw)
    await kb_search("b", "a:5", "t1", k=6, **kw)
    assert state["calls"] == 2  # distinct cache slots, both miss


async def test_ingest_dedups_duplicate_chunks_in_one_page(monkeypatch):
    # Two identical chunks within ONE page share a content_hash; the per-page guard must
    # drop the duplicate before upsert (the seen-set is only written after the loop).
    monkeypatch.setattr("app.tools._chunk", lambda text: ["same chunk", "same chunk"])
    redis = _FakeRedis()
    result = await ingest(
        "t1",
        [{"topic": "python", "url": "u"}],
        fetcher=FakeFetcher({"u": "anything"}),
        embedder=FakeEmbedder(),
        store=FakeVectorStore(),
        redis=redis,
    )
    assert result.ingested == 1
    assert result.skipped == 1


async def test_ingest_sets_ttl_on_seen_set():
    redis = _FakeRedis()
    await _seed(redis, topic="python", url="http://py")
    assert any(key.startswith("kb:seen:") for key in redis.expires)
