"""Hybrid retrieval: dense (vector) + BM25 (lexical) fused by Reciprocal Rank Fusion.

The vector store has no lexical index, so BM25 runs in-process over the dense candidate
pool's texts. It's a small pure-Python Okapi BM25 (no rank-bm25/numpy dependency), so
retrieval stays unit-testable offline. RRF merges the two orderings so a keyword-exact
chunk the vector ranking buries still surfaces in the top-k.
"""

import math
import re

_TOKEN = re.compile(r"[a-z0-9]+")
_RRF_K = 60
_POOL = 50


def _tokenize(text):
    return _TOKEN.findall(text.lower())


def _bm25_scores(query, documents, *, k1=1.5, b=0.75):
    docs = [_tokenize(d) for d in documents]
    n = len(docs)
    # `or 1.0` guards the b-normalization divisor when every doc is empty (avgdl == 0).
    avgdl = (sum(len(d) for d in docs) / n if n else 0.0) or 1.0
    df = {}
    for doc in docs:
        for term in set(doc):
            df[term] = df.get(term, 0) + 1
    terms = set(_tokenize(query))
    scores = []
    for doc in docs:
        freqs = {term: doc.count(term) for term in set(doc)}
        score = 0.0
        for term in terms & freqs.keys():
            idf = math.log((n - df[term] + 0.5) / (df[term] + 0.5) + 1)
            f = freqs[term]
            denom = f + k1 * (1 - b + b * len(doc) / avgdl)
            score += idf * f * (k1 + 1) / denom
        scores.append(score)
    return scores


def _ranks(scores):
    """Map each index to its 0-based position when sorted by score descending."""
    order = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
    return {index: position for position, index in enumerate(order)}


async def hybrid_search(query, *, embedder, store, collection, k):
    query_vec = (await embedder.embed([query]))[0]
    pool = await store.search(collection, query_vec, max(k, _POOL))
    if not pool:
        return []
    texts = [hit["payload"].get("chunk", "") for hit in pool]
    # `pool` is already sorted by cosine desc, so position == dense rank.
    bm25_rank = _ranks(_bm25_scores(query, texts))
    fused = [
        {
            "chunk": texts[i],
            "source": hit["payload"].get("source"),
            "score": 1 / (_RRF_K + i) + 1 / (_RRF_K + bm25_rank[i]),
            "id": hit["id"],
        }
        for i, hit in enumerate(pool)
    ]
    # Deterministic top-k even when fused scores tie: break ties by the stable point id
    # (the pool's cosine-tie order from the vector store is otherwise unspecified).
    fused.sort(key=lambda row: (-row["score"], row["id"]))
    return fused[:k]
