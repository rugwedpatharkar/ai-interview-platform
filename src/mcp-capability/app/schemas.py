"""Typed I/O for the RAG tools (kb_search / ingest)."""

from pydantic import BaseModel


class Citation(BaseModel):
    url: str
    topic: str


class KbSearchResult(BaseModel):
    chunks: list[str]
    citations: list[Citation]


class IngestResult(BaseModel):
    ingested: int
    skipped: int
