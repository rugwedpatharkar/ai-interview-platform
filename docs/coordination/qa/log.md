# QA session log

Append one line per test cycle: `YYYY-MM-DD HH:MM UTC — <target> — <env> — <N findings>`.

2026-07-28 19:30 UTC — regression sweep on 2026-07-23 FE cleanup + BE dev-env — laptop (no docker; FE installed via pnpm 9.15.0, BE via .venv) — **4 findings** (1 Critical, 1 High, 1 Medium, 1 Low).

- Cycle scope: static audit of the last 4 FE commits (Appearance/accent removal + button-tier fix) and a clean-venv install of all four BE services to see what silently broke.
- Ran: `frontend --filter @ip/candidate test` (1 new failing pin, all else green), `backend/lib` pytest (160/160), `backend/services/admin` pytest (552/553 — the 1 failing = new pinning), `services/ai-agents` (306/306 with mcp<2), `services/mcp-data` (46/46 with mcp<2), `services/mcp-capability` (53/53 with mcp<2).
- Not run: chaos suite, load smokes, Playwright, browser drive, mongo/redis-backed integration paths — no docker on this host, browser drive deferred to a later cycle.
- Bugs filed: BUG-20260728-01 (Critical, FE+BE, TOTP silent disable), BUG-20260728-02 (Low, doc rot), BUG-20260728-03 (Medium, BE, logo presign missing size cap), BUG-20260728-04 (High, BE, `mcp>=1.28.1` lets 2.0 in and breaks three services on fresh install).
- Handoffs written: `2026-07-28-qa-critical-totp-silent-disable.md`, `2026-07-28-qa-high-mcp-version-unpinned.md`.
