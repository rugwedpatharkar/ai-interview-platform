"""mcp-capability MCP client — parse_document backed by the mcp-capability server."""

from lib.logging import get_logger

from app.infra.mcp_result import unwrap

log = get_logger(component="infra.mcp_capability")


class McpCapability:
    def __init__(self, manager):
        """Args:
        manager: Anything exposing ``async call_tool(name, arguments)``.
                 Typically an :class:`~app.infra.mcp_session.McpSessionManager`.
        """
        self._session = manager

    async def parse_document(self, object_key, owner=None):
        return unwrap(
            await self._session.call_tool(
                "parse_document", {"object_key": object_key, "owner": owner or ""}
            )
        )

    async def embed(self, texts):
        return unwrap(await self._session.call_tool("embed", {"texts": texts}))

    async def kb_search(self, query, topic, owner="", k=5):
        return unwrap(
            await self._session.call_tool(
                "kb_search",
                {"query": query, "topic": topic, "owner": owner, "k": k},
            )
        )

    async def ingest(self, owner, sources):
        return unwrap(
            await self._session.call_tool(
                "ingest", {"owner": owner, "sources": sources}
            )
        )
