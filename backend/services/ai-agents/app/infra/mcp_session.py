"""Self-healing MCP session manager.

Owns one ``streamablehttp_client`` + ``ClientSession`` pair for a single MCP URL.
On a transport error it tears down the broken connection, backs off, and
re-initialises the session — then retries the failed ``call_tool``.  After
``max_reconnect_attempts`` consecutive failures it raises :exc:`McpUnavailable`
instead of looping forever.

Callers (``McpDataGateway``, ``McpCapability``) only see ``call_tool``.
``start()`` / ``aclose()`` manage the lifecycle from ``main.py`` /
``voice_worker.py``.

Transport errors caught
-----------------------
The MCP streamable-http client raises these on a dropped server:

* ``RuntimeError`` — the most common: "connection closed" / "stream closed".
* ``BrokenPipeError`` — low-level write to a dead socket.
* ``anyio.ClosedResourceError`` — anyio stream closed while reading.
* ``anyio.BrokenResourceError`` — anyio write to a dead stream (write-side
  companion to ``ClosedResourceError``).
* ``mcp.shared.exceptions.McpError`` with ``error.code == -32000``
  (``mcp.types.CONNECTION_CLOSED``) — the exception the MCP client raises on
  a live server restart; the httpx/anyio errors are swallowed inside the MCP
  client's ``post_writer`` and surface here as this structured error instead.
  An ``McpError`` with any other code is a real tool error and is re-raised.

We do NOT catch generic ``Exception`` on the reconnect path to avoid masking
real tool errors (those already surface via ``mcp_result.unwrap``).
"""

from __future__ import annotations

import asyncio
import random

import anyio
from lib.logging import get_logger
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client
from mcp.shared.exceptions import McpError
from mcp.types import CONNECTION_CLOSED

log = get_logger(component="infra.mcp_session")

# Exceptions that indicate a transport-layer drop (not a tool-level error).
_TRANSPORT_ERRORS: tuple[type[Exception], ...] = (
    RuntimeError,
    BrokenPipeError,
    anyio.ClosedResourceError,
    anyio.BrokenResourceError,
)

_BASE_BACKOFF_S: float = 0.5  # base for exponential backoff between reconnects


class McpUnavailable(Exception):
    """Raised when the MCP server cannot be reached after all reconnect attempts."""

    def __init__(self, url: str, attempts: int) -> None:
        super().__init__(
            f"MCP server at {url!r} unreachable after {attempts} reconnect attempt(s)"
        )
        self.url = url
        self.attempts = attempts


class McpSessionManager:
    """Lazily-connecting, self-healing MCP session for one URL.

    Args:
        url: The MCP streamable-HTTP endpoint (e.g. ``http://mcp-data:8000/mcp``).
        max_reconnect_attempts: How many consecutive reconnects to attempt before
            raising :exc:`McpUnavailable`.  Defaults to 3.
        call_timeout_s: Per-call timeout forwarded to the underlying session.
            ``None`` means no timeout (relies on the MCP server itself).
    """

    def __init__(
        self,
        url: str,
        *,
        max_reconnect_attempts: int = 3,
        call_timeout_s: float | None = None,
        headers: dict | None = None,
    ) -> None:
        self._url = url
        self._max_reconnects = max_reconnect_attempts
        self._call_timeout_s = call_timeout_s
        self._headers = headers

        # Live session + context-manager handles; None = not yet connected.
        self._session: ClientSession | None = None
        self._cm_stack: list = []  # [streamablehttp_cm, ClientSession_cm]

        # Guards lazy connect so concurrent callers don't double-connect.
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Connect eagerly.  Call once from the service ``serve()`` entrypoint."""
        async with self._lock:
            await self._connect_locked()

    async def aclose(self) -> None:
        """Tear down the active session (if any)."""
        async with self._lock:
            await self._disconnect_locked()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def call_tool(self, name: str, arguments: dict) -> object:
        """Call an MCP tool, reconnecting once on transport failure.

        On the first transport error the session is torn down and re-initialised
        (with bounded back-off), then the call is retried.  If the reconnect
        itself fails up to ``max_reconnect_attempts`` times
        :exc:`McpUnavailable` is raised.

        Args:
            name: MCP tool name.
            arguments: Keyword arguments forwarded to the tool.

        Returns:
            Raw ``CallToolResult`` from the MCP session (callers use
            ``mcp_result.unwrap`` on it).

        Raises:
            McpUnavailable: Server unreachable after all reconnect attempts.
        """
        session = await self._get_session()
        try:
            return await session.call_tool(name, arguments)
        except McpError as exc:
            # Only CONNECTION_CLOSED (-32000) is a transport drop.
            # Any other McpError is a real tool error — re-raise immediately.
            if exc.error.code != CONNECTION_CLOSED:
                raise
            log.warning(
                "mcp_session: transport error on call_tool"
                " tool={} url={} error=McpError(CONNECTION_CLOSED); reconnecting",
                name,
                self._url,
            )
        except _TRANSPORT_ERRORS as exc:
            log.warning(
                "mcp_session: transport error on call_tool"
                " tool={} url={} error={}; reconnecting",
                name,
                self._url,
                exc,
            )

        # Transport dropped — reconnect with bounded backoff, then retry once.
        # Pass the broken session so _reconnect can skip teardown if a
        # concurrent caller already replaced it.
        await self._reconnect(broken_session=session)
        session = await self._get_session()
        return await session.call_tool(name, arguments)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _get_session(self) -> ClientSession:
        """Return the live session, lazily connecting if needed."""
        if self._session is not None:
            return self._session
        async with self._lock:
            # Double-check after acquiring the lock.
            if self._session is None:
                await self._connect_locked()
            return self._session  # type: ignore[return-value]

    async def _connect_locked(self) -> None:
        """Open streamablehttp_client + ClientSession.  Must hold ``_lock``."""
        log.info("mcp_session: connecting url={}", self._url)
        # Enter the two async context managers manually so we can store their
        # __aexit__ callables and call them later in _disconnect_locked.
        http_cm = streamablehttp_client(self._url, headers=self._headers)
        read, write, _ = await http_cm.__aenter__()
        session_cm = ClientSession(read, write)
        session = await session_cm.__aenter__()
        await session.initialize()
        self._cm_stack = [http_cm, session_cm]
        self._session = session
        log.info("mcp_session: connected url={}", self._url)

    async def _disconnect_locked(self) -> None:
        """Tear down the session + transport.  Safe to call on a broken session."""
        if not self._cm_stack:
            return
        self._session = None
        # Exit in reverse order: ClientSession first, then the HTTP transport.
        for cm in reversed(self._cm_stack):
            try:
                await cm.__aexit__(None, None, None)
            except Exception as exc:
                log.warning(
                    "mcp_session: error during disconnect url={} : {}",
                    self._url,
                    exc,
                )
        self._cm_stack = []

    async def _reconnect(self, *, broken_session: ClientSession | None = None) -> None:
        """Tear down + re-establish the session up to ``max_reconnect_attempts``.

        Args:
            broken_session: The session object that raised the transport error.
                Under the lock, if ``self._session`` is already a *different*
                (newer) object, a concurrent caller already reconnected — skip
                the teardown/rebuild cycle so N concurrent errors cause ONE
                reconnect.

        Raises:
            McpUnavailable: All attempts exhausted.
        """
        async with self._lock:
            # A concurrent transport error may have already triggered a
            # reconnect while we waited for the lock.  If the live session is
            # different from the broken one the caller saw, it's already been
            # replaced — nothing to do.
            if self._session is not None and self._session is not broken_session:
                return
            await self._disconnect_locked()

            for attempt in range(self._max_reconnects):
                delay = _BASE_BACKOFF_S * (2**attempt) + random.uniform(  # noqa: S311
                    0, _BASE_BACKOFF_S
                )
                log.warning(
                    "mcp_session: reconnect attempt {}/{} url={} backoff_s={:.2f}",
                    attempt + 1,
                    self._max_reconnects,
                    self._url,
                    delay,
                )
                await asyncio.sleep(delay)
                try:
                    await self._connect_locked()
                    log.info(
                        "mcp_session: reconnected attempt={} url={}",
                        attempt + 1,
                        self._url,
                    )
                    return
                except Exception as exc:
                    log.error(
                        "mcp_session: reconnect failed attempt={}/{} url={} error={}",
                        attempt + 1,
                        self._max_reconnects,
                        self._url,
                        exc,
                    )
                    await self._disconnect_locked()

            raise McpUnavailable(self._url, self._max_reconnects)
