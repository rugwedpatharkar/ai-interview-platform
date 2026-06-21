"""RAG-foundation seams: pluggable Embedder / VectorStore / Fetcher.

Each seam is a duck-typed contract with a real impl (Gemini / Qdrant / httpx, heavy
imports kept call-local) and an offline `Fake*` the pipeline is unit-tested against —
the same injected-seam pattern as the LLM and Transport seams in P1.
"""

from app.seams.embedder import FakeEmbedder, GeminiEmbedder
from app.seams.fetcher import FakeFetcher, HttpFetcher
from app.seams.vector_store import FakeVectorStore, QdrantVectorStore

__all__ = [
    "FakeEmbedder",
    "FakeFetcher",
    "FakeVectorStore",
    "GeminiEmbedder",
    "HttpFetcher",
    "QdrantVectorStore",
]
