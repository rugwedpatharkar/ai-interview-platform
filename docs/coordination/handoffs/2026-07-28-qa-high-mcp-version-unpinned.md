# [to: BE] BUG-20260728-04 (High) — `mcp>=1.28.1` lets 2.0 in, breaks three services

**Filed:** 2026-07-28
**State:** filed (Manager: please triage)
**Owner:** BE

## Summary

`mcp==2.0.0` was published and removes/renames symbols three services rely on:
- `mcp.server.fastmcp.FastMCP` → removed (breaks `mcp-data`, `mcp-capability` at import)
- `mcp.client.streamable_http.streamablehttp_client` → renamed to `streamable_http_client` (breaks `ai-agents` at import)

All three `pyproject.toml` files pin only a lower bound (`mcp>=1.28.1`), so a fresh install picks 2.0 and the container image fails to boot. No lockfile in the repo to save this.

## Blast radius

- Render production image (`backend/Dockerfile`): a fresh build today would fail on service start. Existing running instances are fine until they redeploy.
- Any new dev doing `pip install -e .` per the check.sh pattern.
- `services/mcp-data/tests/test_server_validation.py` — collection error under a clean venv.

## Fix — lazy path

Add `,<2` to three files:
- [backend/services/ai-agents/pyproject.toml](../../../backend/services/ai-agents/pyproject.toml)
- [backend/services/mcp-data/pyproject.toml](../../../backend/services/mcp-data/pyproject.toml)
- [backend/services/mcp-capability/pyproject.toml](../../../backend/services/mcp-capability/pyproject.toml)

Constraint becomes `mcp>=1.28.1,<2  # 1.28.0 has CVE-2026-59950; 2.0 dropped fastmcp+renamed streamablehttp_client`.

## Fix — full path (do not need to bundle)

Migrate call sites to the mcp 2.0 API (`streamable_http_client`, replacement for `FastMCP`). Larger change; no urgency vs the pin.

## Verification

```bash
python -m venv .venv
.venv/bin/pip install ./backend/lib \
                     ./backend/services/admin \
                     ./backend/services/ai-agents \
                     ./backend/services/mcp-data \
                     ./backend/services/mcp-capability
cd backend/services/mcp-data && ../../.venv/bin/python -m pytest -q
cd ../ai-agents && ../../.venv/bin/python -m pytest -q
cd ../mcp-capability && ../../.venv/bin/python -m pytest -q
```

Fails on collection today (mcp==2.0.0 resolves); passes with mcp<2 pinned (mcp==1.29.0 resolves).

## Bug ledger entry

[`docs/coordination/qa/bugs.md#bug-20260728-04`](../qa/bugs.md#bug-20260728-04--severity-high--be).
