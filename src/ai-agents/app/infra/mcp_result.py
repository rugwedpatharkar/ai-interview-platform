def unwrap(result):
    """Read a FastMCP tool's return value from a CallToolResult.

    FastMCP wraps the value as `structured_content == {"result": value}` (and `None`
    results give `{"result": None}`), so the gateways read it back uniformly.
    A tool that raised server-side returns `isError` and no structured content; surface
    it as an exception so the Consumer dead-letters it, never mistaking it for a `None`
    ("not found") result (which would defeat the handlers' idempotency guards).
    """
    if getattr(result, "is_error", False) or getattr(result, "isError", False):
        content = getattr(result, "content", None)
        detail = getattr(content[0], "text", "") if content else ""
        raise RuntimeError(f"MCP tool error: {detail}".rstrip(": "))
    structured = getattr(result, "structured_content", None) or getattr(
        result, "structuredContent", None
    )
    # FastMCP ALWAYS wraps a successful return as {"result": value} (None included).
    # An absent/empty wrapper is malformed — raise so the Consumer dead-letters it,
    # never mistaking it for a None ("not found") that would defeat idempotency guards.
    if not structured or "result" not in structured:
        raise RuntimeError("MCP tool returned no structured result")
    return structured["result"]
