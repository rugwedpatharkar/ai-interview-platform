"""mcp-capability tools — document parsing.

`parse_document` fetches a stored object by its emitted object_key and extracts plain
text (PDF/DOCX, the formats admin accepts). Transport-agnostic + testable; the MCP
server (server.py) wraps it as a tool. Parser imports are call-local — only the running
server needs them installed.
"""

import hashlib
import io
import json
import uuid
from datetime import UTC, datetime

from lib.logging import get_logger

from app.chunking import chunk as _chunk
from app.chunking import content_hash
from app.retrieval import hybrid_search
from app.schemas import Citation, IngestResult, KbSearchResult

log = get_logger(component="mcp_capability.tools")

_CACHE_TTL_SECONDS = 3600
_MAX_K = 50  # ceiling on kb_search k so a caller can't request an unbounded result set
_SEEN_TTL_SECONDS = 2592000  # 30 days; bounds the dedup set without churning re-embeds


def _extract_pdf(data):
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _extract_docx(data):
    from docx import Document

    document = Document(io.BytesIO(data))
    return "\n".join(p.text for p in document.paragraphs)


_EXTRACTORS = {".pdf": _extract_pdf, ".docx": _extract_docx}


async def parse_document(object_key, *, storage, owner=None):
    # Tenant guard: the single bucket is multi-tenant, so the key prefix is the
    # isolation boundary. Reject any key outside the owner's namespace.
    if owner is not None and not object_key.startswith(f"{owner}/"):
        raise ValueError("object_key outside the owner's namespace")
    dot = object_key.rfind(".")
    suffix = object_key[dot:].lower() if dot != -1 else ""
    extractor = _EXTRACTORS.get(suffix)
    if extractor is None:
        raise ValueError(f"unsupported document type: {suffix or '(none)'}")
    data = await storage.get_raw(object_key)
    text = extractor(data)
    if not text.strip():
        # A scanned/empty/corrupt doc extracts to nothing; fail fast, never embed "".
        raise ValueError(f"no extractable text in {object_key}")
    log.info("parsed {} ({} chars)", object_key, len(text))
    return text


def _collection(owner, topic):
    # Per-tenant scoping: every owner gets its own KB namespace (no cross-tenant reads).
    return f"kb:{owner}:{topic}"


def _version_key(owner, topic):
    return f"kb:ver:{owner}:{topic}"


def _version(raw):
    if raw is None:
        return 0
    return int(raw.decode() if isinstance(raw, bytes) else raw)


def _cache_key(owner, topic, k, query, version):
    # Hash a JSON tuple so a topic/query containing ':' can't collide cache slots; the
    # version makes a read after a same-topic ingest miss the now-stale cache.
    raw = json.dumps([owner, topic, k, query, version], separators=(",", ":"))
    return "kb:cache:" + hashlib.sha256(raw.encode()).hexdigest()


async def embed(texts, *, embedder):
    return await embedder.embed(texts)


async def kb_search(query, topic, owner, *, embedder, store, redis, k=5):
    k = min(k, _MAX_K)
    version = _version(await redis.get(_version_key(owner, topic)))
    cache_key = _cache_key(owner, topic, k, query, version)
    cached = await redis.get(cache_key)
    if cached is not None:
        return KbSearchResult.model_validate_json(cached)
    hits = await hybrid_search(
        query,
        embedder=embedder,
        store=store,
        collection=_collection(owner, topic),
        k=k,
    )
    result = KbSearchResult(
        chunks=[hit["chunk"] for hit in hits],
        citations=[Citation(**hit["source"]) for hit in hits if hit.get("source")],
    )
    await redis.set(cache_key, result.model_dump_json(), ex=_CACHE_TTL_SECONDS)
    return result


async def _ingest_one(owner, source, *, fetcher, embedder, store, redis):
    """Ingest one source; returns (ingested, skipped).

    Raises on a fetch/embed/store failure — the caller isolates that per source.
    """
    topic, url = source["topic"], source["url"]
    collection = _collection(owner, topic)
    seen_key = f"kb:seen:{collection}"
    page = await fetcher.fetch(url)
    ids, texts, payloads = [], [], []
    seen_this_batch = set()
    skipped = 0
    for piece in _chunk(page["text"]):
        digest = content_hash(piece)
        # Dedup within the page too: the seen-set is only written after the loop, so
        # a chunk repeated in one page would otherwise be embedded + upserted twice.
        if digest in seen_this_batch or await redis.sismember(seen_key, digest):
            skipped += 1
            continue
        seen_this_batch.add(digest)
        ids.append(str(uuid.uuid5(uuid.NAMESPACE_URL, digest)))
        texts.append(piece)
        payloads.append(
            {
                "chunk": piece,
                "source": {"url": url, "topic": topic},
                "content_hash": digest,
                "owner": owner,
                "fetched_at": datetime.now(UTC).isoformat(),
            }
        )
    if not texts:
        return 0, skipped
    vectors = await embedder.embed(texts)
    await store.upsert(collection, ids, vectors, payloads)
    for payload in payloads:
        await redis.sadd(seen_key, payload["content_hash"])
    await redis.expire(seen_key, _SEEN_TTL_SECONDS)
    # Bump the version so a cached kb_search for this (owner, topic) misses and
    # re-reads the now-larger collection (closes the stale-after-ingest window).
    await redis.incr(_version_key(owner, topic))
    return len(texts), skipped


async def ingest(owner, sources, *, fetcher, embedder, store, redis):
    """Fetch -> chunk -> content-hash dedup -> embed -> upsert + provenance, per source.

    Idempotent: a chunk whose content_hash is already in the per-collection seen-set is
    skipped, so re-crawling a source upserts nothing new. Each source is isolated — a
    single failing source (bad URL, fetch/embed/store error) is logged and counted in
    ``failed`` without aborting the rest of the batch (BE-#11).
    """
    ingested = skipped = failed = 0
    for source in sources:
        try:
            one_ingested, one_skipped = await _ingest_one(
                owner,
                source,
                fetcher=fetcher,
                embedder=embedder,
                store=store,
                redis=redis,
            )
            ingested += one_ingested
            skipped += one_skipped
        except Exception as exc:
            failed += 1
            log.warning(
                "ingest: source failed topic={} url={}: {}",
                source.get("topic"),
                source.get("url"),
                exc,
            )
    return IngestResult(ingested=ingested, skipped=skipped, failed=failed)
