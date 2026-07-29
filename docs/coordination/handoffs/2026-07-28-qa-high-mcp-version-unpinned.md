---
from: QA
to:   BE
priority: High
state: open
opened: 2026-07-28 19:30 UTC
---

## What

BUG-20260728-04. `mcp==2.0.0` resolves under `mcp>=1.28.1` (the constraint in `ai-agents`, `mcp-data`, and `mcp-capability` pyproject.toml). The 2.0 release removed `mcp.server.fastmcp.FastMCP` and renamed `mcp.client.streamable_http.streamablehttp_client` → `streamable_http_client`. All three services fail at import time on any fresh install. No lockfile in the repo to save this.

## Why now

`backend/Dockerfile` runs `pip install ./services/...` with no lockfile. The next clean Render build boots into an ImportError on service start. `services/mcp-data/tests/test_server_validation.py` cannot even collect under a clean venv today.

## What the receiver needs to do

- Add `,<2` to the `mcp` constraint in all three files:
  - [backend/services/ai-agents/pyproject.toml](../../../backend/services/ai-agents/pyproject.toml)
  - [backend/services/mcp-data/pyproject.toml](../../../backend/services/mcp-data/pyproject.toml)
  - [backend/services/mcp-capability/pyproject.toml](../../../backend/services/mcp-capability/pyproject.toml)
- Suggested constraint text: `mcp>=1.28.1,<2  # 1.28.0 has CVE-2026-59950; 2.0 dropped fastmcp and renamed streamablehttp_client`.
- Migrate to the mcp 2.0 API separately when there's a reason to move — not part of this fix.

## Success criteria

- Fresh venv install of all three services succeeds; each `import app.server` / `import app.infra.mcp_session` returns clean.
- `services/mcp-data` pytest collects and runs (46 tests today).
- Bug entry moves to `state=verified` with a new `verified_in` sha.
