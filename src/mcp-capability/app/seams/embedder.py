"""Embedding seam: text -> dense vectors.

Callers depend only on `embed(texts) -> list[vector]`. `GeminiEmbedder` keeps its
provider import call-local (only a running server needs the SDK); `FakeEmbedder`
returns deterministic, L2-normalized hash vectors so retrieval is unit-tested offline
and repeatably (same text -> same vector).
"""

import hashlib
import math


class GeminiEmbedder:
    def __init__(self, api_key="", model="models/text-embedding-004"):
        from langchain_google_genai import GoogleGenerativeAIEmbeddings

        self._model = GoogleGenerativeAIEmbeddings(model=model, google_api_key=api_key)

    async def embed(self, texts):
        return await self._model.aembed_documents(list(texts))


class FakeEmbedder:
    """Deterministic offline embedder backed by a hash of the text."""

    def __init__(self, dim=16):
        self._dim = dim

    async def embed(self, texts):
        return [self._vector(text) for text in texts]

    def _vector(self, text):
        digest = hashlib.sha256(text.encode()).digest()
        raw = [digest[i % len(digest)] - 128 for i in range(self._dim)]
        norm = math.sqrt(sum(component * component for component in raw)) or 1.0
        return [component / norm for component in raw]
