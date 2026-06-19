"""mcp-capability MCP client — parse_document backed by the mcp-capability server."""

import time

from lib.logging import get_logger
from lib.observability import counter, histogram, span

from app.infra.mcp_result import unwrap

log = get_logger(component="infra.mcp_capability")

# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------
_mcp_cap_total = counter(
    "mcp_capability_call_total",
    "mcp-capability tool call invocations",
    labels=["tool"],
)
_mcp_cap_errors = counter(
    "mcp_capability_call_errors_total",
    "mcp-capability tool call errors",
    labels=["tool"],
)
_mcp_cap_duration = histogram(
    "mcp_capability_call_duration_ms",
    "mcp-capability tool call duration (ms)",
    labels=["tool"],
)


class McpCapability:
    def __init__(self, manager):
        """Args:
        manager: Anything exposing ``async call_tool(name, arguments)``.
                 Typically an :class:`~app.infra.mcp_session.McpSessionManager`.
        """
        self._session = manager

    async def _call(self, tool: str, args: dict):
        """Call a tool and observe metrics; propagate exceptions."""
        _mcp_cap_total.labels(tool=tool).inc()
        t0 = time.monotonic()
        try:
            async with span("mcp_capability." + tool, tool=tool):
                result = await self._session.call_tool(tool, args)
        except Exception:
            _mcp_cap_errors.labels(tool=tool).inc()
            _mcp_cap_duration.labels(tool=tool).observe((time.monotonic() - t0) * 1000)
            raise
        _mcp_cap_duration.labels(tool=tool).observe((time.monotonic() - t0) * 1000)
        return result

    async def parse_document(self, object_key, owner=None):
        return unwrap(
            await self._call(
                "parse_document", {"object_key": object_key, "owner": owner or ""}
            )
        )

    async def embed(self, texts):
        return unwrap(await self._call("embed", {"texts": texts}))

    async def kb_search(self, query, topic, owner="", k=5):
        return unwrap(
            await self._call(
                "kb_search",
                {"query": query, "topic": topic, "owner": owner, "k": k},
            )
        )

    async def ingest(self, owner, sources):
        return unwrap(await self._call("ingest", {"owner": owner, "sources": sources}))
