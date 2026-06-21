"""Tests for McpSessionManager — all offline, no real MCP server.

Coverage
--------
- transport error -> reconnect -> call succeeds (happy-path self-heal)
- bounded reconnect: server always unreachable -> McpUnavailable after cap
- McpUnavailable carries url + attempt count
- lazy connect: concurrent callers don't double-connect
- gateways delegate to the manager's call_tool (existing gateway tests adapt)
- anyio.ClosedResourceError and BrokenPipeError are caught as transport errors
- aclose() when not started is safe
- McpError(CONNECTION_CLOSED) triggers reconnect and succeeds
- McpError(other code) propagates without reconnect
- concurrent transport errors cause exactly one reconnect
"""

from __future__ import annotations

import asyncio

import anyio
import pytest
from mcp.shared.exceptions import McpError
from mcp.types import CONNECTION_CLOSED, ErrorData

from app.infra.mcp_session import McpSessionManager, McpUnavailable

# ---------------------------------------------------------------------------
# Helpers / fakes
# ---------------------------------------------------------------------------


class _FakeResult:
    """Mimics FastMCP CallToolResult: structured_content.result == value."""

    def __init__(self, value=None):
        self.structured_content = {"result": value}
        self.is_error = False
        self.content = []


class _FakeSession:
    """Scriptable fake for the underlying MCP ClientSession.

    ``fail_first``: first ``call_tool`` raises a transport error, then succeeds.
    ``always_fail``: every ``call_tool`` raises a transport error.
    """

    def __init__(self, *, fail_first: bool = False, always_fail: bool = False):
        self.fail_first = fail_first
        self.always_fail = always_fail
        self._call_count = 0
        self.calls: list[tuple[str, dict]] = []

    async def call_tool(self, name: str, args: dict) -> _FakeResult:
        self._call_count += 1
        self.calls.append((name, args))
        if self.always_fail:
            raise RuntimeError("transport: connection closed")
        if self.fail_first and self._call_count == 1:
            raise RuntimeError("transport: connection closed")
        return _FakeResult({"tool": name})

    async def initialize(self) -> None:
        pass


class _FakeSessionManager:
    """Exposes the same ``call_tool`` duck-type as McpSessionManager.

    Used in gateway tests to verify delegation without a real manager.
    """

    def __init__(self, returns: dict | None = None):
        self.returns = returns or {}
        self.calls: list[tuple[str, dict]] = []

    async def call_tool(self, name: str, args: dict) -> _FakeResult:
        self.calls.append((name, args))
        return _FakeResult(self.returns.get(name))


# ---------------------------------------------------------------------------
# Manager factory that injects a fake session
# ---------------------------------------------------------------------------


class _NullCM:
    """Context-manager stand-in for the http / session CMs in _cm_stack."""

    async def __aexit__(self, *_):
        pass


def _make_manager(
    session: _FakeSession,
    *,
    max_reconnect_attempts: int = 3,
    reconnect_raises: Exception | None = None,
) -> McpSessionManager:
    """Return a McpSessionManager whose _connect_locked injects *session*.

    Args:
        session: Injected on the first connect (start()).
        max_reconnect_attempts: Forwarded to McpSessionManager.
        reconnect_raises: If set, reconnect attempts (after the first connect)
            raise this exception (simulates a server that drops and cannot
            recover).
    """
    mgr = McpSessionManager(
        "http://fake-mcp/mcp", max_reconnect_attempts=max_reconnect_attempts
    )
    connect_count = [0]

    async def _patched_connect():
        connect_count[0] += 1
        # First connect (start()) always succeeds; subsequent ones may fail.
        if reconnect_raises is not None and connect_count[0] > 1:
            raise reconnect_raises
        mgr._session = session
        mgr._cm_stack = [_NullCM(), _NullCM()]

    async def _patched_disconnect():
        mgr._session = None
        mgr._cm_stack = []

    mgr._connect_locked = _patched_connect
    mgr._disconnect_locked = _patched_disconnect
    mgr._connect_count = connect_count
    return mgr


# ---------------------------------------------------------------------------
# Helpers shared by the "always-fail" tests (instant backoff sleep)
# ---------------------------------------------------------------------------


async def _with_instant_sleep(coro):
    """Run *coro* with asyncio.sleep patched to be instant."""
    import app.infra.mcp_session as _mod

    original = asyncio.sleep

    async def _noop(_):
        await original(0)

    _mod.asyncio.sleep = _noop
    try:
        return await coro
    finally:
        _mod.asyncio.sleep = original


# ---------------------------------------------------------------------------
# Test: transport error -> reconnect -> call succeeds
# ---------------------------------------------------------------------------


async def test_reconnect_on_transport_error_then_succeeds():
    """Session fails once on call_tool; manager reconnects and the call succeeds."""
    session = _FakeSession(fail_first=True)
    mgr = _make_manager(session)
    await mgr.start()

    result = await mgr.call_tool("get_job", {"job_id": "j1"})

    assert result.structured_content == {"result": {"tool": "get_job"}}
    # call_tool called twice: first attempt failed, second succeeded.
    assert len(session.calls) == 2
    # _connect_locked: once at start() + once for the reconnect.
    assert mgr._connect_count[0] == 2  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Test: bounded reconnect — McpUnavailable after cap
# ---------------------------------------------------------------------------


async def test_bounded_reconnect_raises_mcp_unavailable():
    """call_tool fails + reconnect always fails -> McpUnavailable after cap."""
    mgr = _make_manager(
        _FakeSession(always_fail=True),
        max_reconnect_attempts=2,
        reconnect_raises=ConnectionRefusedError("connection refused"),
    )
    await mgr.start()

    with pytest.raises(McpUnavailable) as exc_info:
        await _with_instant_sleep(mgr.call_tool("get_job", {"job_id": "j1"}))

    assert exc_info.value.attempts == 2
    assert "http://fake-mcp/mcp" in str(exc_info.value)


async def test_mcp_unavailable_is_not_infinite_loop():
    """Exhaustion completes in finite time (no infinite loop)."""
    mgr = _make_manager(
        _FakeSession(always_fail=True),
        max_reconnect_attempts=1,
        reconnect_raises=ConnectionRefusedError("connection refused"),
    )
    await mgr.start()

    with pytest.raises(McpUnavailable):
        await _with_instant_sleep(mgr.call_tool("x", {}))


async def test_mcp_unavailable_contains_url_and_attempt_count():
    """McpUnavailable carries url and attempt count for structured error handling."""
    mgr = _make_manager(
        _FakeSession(always_fail=True),
        max_reconnect_attempts=3,
        reconnect_raises=ConnectionRefusedError("connection refused"),
    )
    await mgr.start()

    with pytest.raises(McpUnavailable) as exc_info:
        await _with_instant_sleep(mgr.call_tool("x", {}))

    err = exc_info.value
    assert err.url == "http://fake-mcp/mcp"
    assert err.attempts == 3
    assert "http://fake-mcp/mcp" in str(err)
    assert "3" in str(err)


# ---------------------------------------------------------------------------
# Test: lazy connect under concurrent calls — no double-connect
# ---------------------------------------------------------------------------


async def test_lazy_connect_no_double_connect():
    """Concurrent call_tool calls connect only once (lock guards lazy init)."""
    session = _FakeSession()
    mgr = _make_manager(session)
    # Do NOT call start() — test the lazy path.

    results = await asyncio.gather(
        mgr.call_tool("get_job", {"job_id": "j1"}),
        mgr.call_tool("get_job", {"job_id": "j2"}),
        mgr.call_tool("get_job", {"job_id": "j3"}),
    )

    assert len(results) == 3
    # Connect must have been called exactly once despite 3 concurrent callers.
    assert mgr._connect_count[0] == 1  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Test: gateways delegate to manager's call_tool
# ---------------------------------------------------------------------------


async def test_data_gateway_delegates_to_manager_call_tool():
    """McpDataGateway.get_job delegates to manager.call_tool and unwraps."""
    from app.infra.mcp_data import McpDataGateway

    mgr = _FakeSessionManager(returns={"get_job": {"jd_text": "role"}})
    gw = McpDataGateway(mgr)
    result = await gw.get_job("j1")

    assert result == {"jd_text": "role"}
    assert mgr.calls == [("get_job", {"job_id": "j1"})]


async def test_capability_gateway_delegates_to_manager_call_tool():
    """McpCapability.parse_document delegates to manager.call_tool and unwraps."""
    from app.infra.mcp_capability import McpCapability

    mgr = _FakeSessionManager(returns={"parse_document": "extracted text"})
    gw = McpCapability(mgr)
    result = await gw.parse_document("u1/resumes/r.pdf", owner="u1")

    assert result == "extracted text"
    assert mgr.calls[0] == (
        "parse_document",
        {"object_key": "u1/resumes/r.pdf", "owner": "u1"},
    )


# ---------------------------------------------------------------------------
# Test: anyio.ClosedResourceError is caught as a transport error
# ---------------------------------------------------------------------------


async def test_anyio_closed_resource_triggers_reconnect():
    """anyio.ClosedResourceError is in _TRANSPORT_ERRORS and triggers a reconnect."""

    class _AnyioFailFirst(_FakeSession):
        async def call_tool(self, name, args):
            self._call_count += 1
            self.calls.append((name, args))
            if self._call_count == 1:
                raise anyio.ClosedResourceError("stream closed")
            return _FakeResult({"tool": name})

    session = _AnyioFailFirst()
    mgr = _make_manager(session)
    await mgr.start()

    result = await mgr.call_tool("embed", {"texts": ["hello"]})
    assert result.structured_content == {"result": {"tool": "embed"}}
    assert len(session.calls) == 2


# ---------------------------------------------------------------------------
# Test: BrokenPipeError is caught as a transport error
# ---------------------------------------------------------------------------


async def test_broken_pipe_triggers_reconnect():
    """BrokenPipeError is in _TRANSPORT_ERRORS and triggers a reconnect."""

    class _BrokenPipeFirst(_FakeSession):
        async def call_tool(self, name, args):
            self._call_count += 1
            self.calls.append((name, args))
            if self._call_count == 1:
                raise BrokenPipeError("broken pipe")
            return _FakeResult({"tool": name})

    session = _BrokenPipeFirst()
    mgr = _make_manager(session)
    await mgr.start()

    result = await mgr.call_tool("get_profile", {"user_id": "u1"})
    assert result.structured_content == {"result": {"tool": "get_profile"}}
    assert len(session.calls) == 2


# ---------------------------------------------------------------------------
# Test: aclose() when not started is safe
# ---------------------------------------------------------------------------


async def test_aclose_when_not_started():
    """aclose() on a manager that was never started does not raise."""
    mgr = McpSessionManager("http://fake-mcp/mcp")
    await mgr.aclose()  # must not raise


# ---------------------------------------------------------------------------
# Test: McpError(CONNECTION_CLOSED) triggers reconnect then succeeds
# ---------------------------------------------------------------------------


async def test_mcp_error_connection_closed_triggers_reconnect():
    """McpError with CONNECTION_CLOSED code triggers reconnect and call succeeds."""

    class _McpClosedFirst(_FakeSession):
        async def call_tool(self, name, args):
            self._call_count += 1
            self.calls.append((name, args))
            if self._call_count == 1:
                raise McpError(
                    ErrorData(code=CONNECTION_CLOSED, message="connection closed")
                )
            return _FakeResult({"tool": name})

    session = _McpClosedFirst()
    mgr = _make_manager(session)
    await mgr.start()

    result = await mgr.call_tool("get_job", {"job_id": "j1"})

    assert result.structured_content == {"result": {"tool": "get_job"}}
    # call_tool called twice: first raised CONNECTION_CLOSED, second succeeded.
    assert len(session.calls) == 2
    # connect_locked: once at start() + once for the reconnect.
    assert mgr._connect_count[0] == 2  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Test: McpError with a non-CONNECTION_CLOSED code propagates, no reconnect
# ---------------------------------------------------------------------------


async def test_mcp_error_other_code_propagates_no_reconnect():
    """McpError with a non-transport error code re-raises without reconnecting."""
    OTHER_CODE = -32602  # INVALID_PARAMS — a real tool error

    class _McpOtherError(_FakeSession):
        async def call_tool(self, name, args):
            self._call_count += 1
            self.calls.append((name, args))
            raise McpError(ErrorData(code=OTHER_CODE, message="invalid params"))

    session = _McpOtherError()
    mgr = _make_manager(session)
    await mgr.start()
    connect_count_before = mgr._connect_count[0]  # type: ignore[attr-defined]

    with pytest.raises(McpError) as exc_info:
        await mgr.call_tool("get_job", {"job_id": "j1"})

    assert exc_info.value.error.code == OTHER_CODE
    # No reconnect: connect count unchanged after start().
    assert mgr._connect_count[0] == connect_count_before  # type: ignore[attr-defined]
    # call_tool only attempted once — no retry.
    assert len(session.calls) == 1


# ---------------------------------------------------------------------------
# Test: concurrent transport errors cause exactly ONE reconnect
# ---------------------------------------------------------------------------


def _make_manager_multi_session(
    sessions: list,
    *,
    max_reconnect_attempts: int = 3,
) -> McpSessionManager:
    """Like _make_manager but each connect call uses the next session in the list.

    This ensures that after the first reconnect the new session is a *different*
    object, which lets the race-guard identity check (`is not broken_session`)
    work correctly: callers that wait for the lock see a new session and skip
    the redundant reconnect.
    """
    mgr = McpSessionManager(
        "http://fake-mcp/mcp", max_reconnect_attempts=max_reconnect_attempts
    )
    connect_count = [0]
    session_iter = iter(sessions)

    async def _patched_connect():
        connect_count[0] += 1
        mgr._session = next(session_iter)
        mgr._cm_stack = [_NullCM(), _NullCM()]

    async def _patched_disconnect():
        mgr._session = None
        mgr._cm_stack = []

    mgr._connect_locked = _patched_connect
    mgr._disconnect_locked = _patched_disconnect
    mgr._connect_count = connect_count
    return mgr


async def test_concurrent_transport_errors_single_reconnect():
    """N concurrent transport errors cause exactly one reconnect (race guard).

    Three callers all see a transport error on the first (shared) session.
    They all call _reconnect() concurrently.  Only the first one through the
    lock should tear down + rebuild; the others see the new session (a
    different object than the broken one) and return early.
    """
    # Session 0: raises RuntimeError on every call_tool (the "broken" session).
    broken = _FakeSession(always_fail=True)

    # Session 1: the "healed" session — succeeds for all callers.
    healed = _FakeSession()

    mgr = _make_manager_multi_session([broken, healed])
    await mgr.start()  # installs broken as the live session (connect_count=1)

    import app.infra.mcp_session as _mod

    original_sleep = asyncio.sleep

    async def _noop(_):
        await original_sleep(0)

    _mod.asyncio.sleep = _noop
    try:
        results = await asyncio.gather(
            mgr.call_tool("tool_a", {}),
            mgr.call_tool("tool_b", {}),
            mgr.call_tool("tool_c", {}),
        )
    finally:
        _mod.asyncio.sleep = original_sleep

    assert len(results) == 3
    # start() = 1 connect; exactly 1 reconnect (to healed) despite 3 errors.
    assert mgr._connect_count[0] == 2  # type: ignore[attr-defined]
