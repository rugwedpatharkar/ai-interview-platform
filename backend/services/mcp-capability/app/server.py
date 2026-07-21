"""mcp-capability — MCP server exposing document-parsing tools (FastMCP, stdio).

Wraps app/tools.py as MCP tools; constructs ObjectStorage from settings and connects it
for the server's lifetime. The ai-agents service connects as an MCP client. Run with
`python -m app.server`.
"""

import asyncio

from lib.logging import configure_logging, get_logger, log_context
from lib.mcp_auth import BearerAuthMiddleware, assert_secret_configured
from lib.observability import init_tracing, start_metrics_server
from lib.redis import create_redis
from lib.storage import ObjectStorage
from mcp.server.fastmcp import FastMCP

from app.config import get_settings
from app.seams import GeminiEmbedder, HttpFetcher, QdrantVectorStore
from app.tools import embed as _embed
from app.tools import ingest as _ingest
from app.tools import kb_search as _kb_search
from app.tools import parse_document as _parse

log = get_logger(component="mcp_capability.server")

_settings = get_settings()
_storage = ObjectStorage(
    _settings.s3_endpoint_url,
    _settings.s3_region,
    _settings.s3_access_key_id,
    _settings.s3_secret_access_key,
    _settings.s3_bucket,
    _settings.storage_presign_ttl_seconds,
)
# RAG seams are built lazily on first tool use, NOT in a FastMCP lifespan: a custom
# lifespan tears down the streamable-http session manager's streams (crashes the MCP
# session). Tests drive the tool functions directly with fakes, so importing this module
# needs no qdrant/gemini SDK.
_rag: dict = {}
_rag_lock = asyncio.Lock()


async def _ensure_rag() -> dict:
    if _rag:
        return _rag
    async with _rag_lock:
        if not _rag:  # double-checked under the lock
            await _storage.connect()
            _rag["embedder"] = GeminiEmbedder(
                api_key=_settings.gemini_api_key, model=_settings.gemini_embed_model
            )
            _rag["store"] = QdrantVectorStore(
                _settings.qdrant_url, _settings.qdrant_api_key
            )
            _rag["fetcher"] = HttpFetcher()
            _rag["redis"] = create_redis(_settings.redis_url)
    return _rag


mcp = FastMCP(
    "mcp-capability",
    host=_settings.mcp_host,
    port=_settings.mcp_port,
)


@mcp.tool()
async def parse_document(object_key: str, owner: str) -> str:
    """Extract text from a stored resume (PDF/DOCX), scoped to the owner's keys."""
    # Empty owner used to slip past the prefix guard (owner or None -> _parse skipped).
    # Require a non-empty owner at the server boundary so tenant isolation holds.
    if not owner:
        raise ValueError("owner is required")
    async with log_context(
        log, "tool.parse_document", object_key=object_key, owner=owner
    ):
        await _ensure_rag()  # connects _storage on first use
        return await _parse(object_key, storage=_storage, owner=owner)


@mcp.tool()
async def embed(texts: list[str]) -> list[list[float]]:
    """Embed texts into dense vectors."""
    async with log_context(log, "tool.embed", text_count=len(texts)):
        rag = await _ensure_rag()
        return await _embed(texts, embedder=rag["embedder"])


@mcp.tool()
async def kb_search(query: str, topic: str, owner: str = "", k: int = 5) -> dict:
    """Hybrid (dense + BM25) search over a tenant+topic KB; returns cited chunks."""
    async with log_context(log, "tool.kb_search", topic=topic, owner=owner, k=k):
        rag = await _ensure_rag()
        result = await _kb_search(
            query,
            topic,
            owner,
            embedder=rag["embedder"],
            store=rag["store"],
            redis=rag["redis"],
            k=k,
        )
        return result.model_dump()


@mcp.tool()
async def ingest(owner: str, sources: list[dict]) -> dict:
    """Crawl + chunk + embed sources into a topic KB (content-hash deduped)."""
    async with log_context(log, "tool.ingest", owner=owner, source_count=len(sources)):
        rag = await _ensure_rag()
        result = await _ingest(
            owner,
            sources,
            fetcher=rag["fetcher"],
            embedder=rag["embedder"],
            store=rag["store"],
            redis=rag["redis"],
        )
        return result.model_dump()


def main() -> None:
    import uvicorn

    configure_logging(_settings.service_name, _settings.log_level)
    if _settings.otlp_endpoint:
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import (
            OTLPSpanExporter,
        )

        init_tracing(
            _settings.service_name,
            exporter=OTLPSpanExporter(endpoint=_settings.otlp_endpoint, insecure=True),
        )
    else:
        init_tracing(_settings.service_name, enabled=_settings.tracing_enabled)
    asyncio.run(start_metrics_server(_settings.metrics_port))
    assert_secret_configured(
        _settings.mcp_shared_secret,
        environment=_settings.environment,
        service=_settings.service_name,
    )
    app = mcp.streamable_http_app()
    if _settings.mcp_shared_secret:
        app.add_middleware(BearerAuthMiddleware, secret=_settings.mcp_shared_secret)
    uvicorn.run(app, host=_settings.mcp_host, port=_settings.mcp_port, log_level="info")


if __name__ == "__main__":
    main()
