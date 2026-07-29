# Log — QA

Append-only. Newest at bottom. See `../README.md` for entry format.

## 2026-07-28 19:30 UTC — session-f6e0b0

- Static regression sweep on the 2026-07-23 FE cleanup commits (Appearance / accent removal, button-tier fix) plus a clean-venv install of all four BE services.
- Ran: `frontend --filter @ip/candidate test` (5 files, 19 tests green, 1 pin as `it.fails` — expected). `backend/lib` 160/160. `backend/services/admin` 552 passed + 1 xfailed (my pin). With `mcp<2` pinned locally: `ai-agents` 306/306, `mcp-data` 46/46, `mcp-capability` 53/53.
- Not run: chaos suite, load smokes, browser drive, mongo/redis integration paths — no docker on this host. Deferred to a later cycle.
- Bugs filed: BUG-20260728-01 (Critical, TOTP silent-disable), BUG-20260728-04 (High, `mcp>=1.28.1` picks 2.0 and breaks 3 services on fresh install), BUG-20260728-03 (Medium, logo presign missing size cap), BUG-20260728-02 (Low, doc rot in tokens.css).
- Handoffs opened: `2026-07-28-qa-critical-totp-silent-disable.md`, `2026-07-28-qa-high-mcp-version-unpinned.md`.
- Next: boot the FE dev server + drive `/settings?tab=security` and `/company/branding` in the browser, extend the smoke suite for the settings-tabs redirect gap, keep sweeping.
- blockers: none.
- commits: e4d7809 (bugs + tests), 7ae2684 (xfail markers), 5e2f991 (Manager-schema alignment).

## 2026-07-28 20:20 UTC — session-f6e0b0

- Booted candidate-mock via `preview_start`. Ran the full Playwright suite green (9/9). Drove `/jobs` marketplace with `<script>alert('xss')</script>` and `frontend' OR 1=1 --` — both properly escaped/rendered, no XSS, no crash.
- Found BUG-20260728-05 [Medium]: `/jobs` URL is one-way — SSR seeds params from `?q=`, but user typing/filtering never pushes back to the URL. Reload / share / back all lose the search. Confirmed by `location.href` staying at `/jobs?q=frontend` after typing a fresh query and clicking a filter chip.
- Added `frontend/e2e/marketplace-search-url.spec.ts` with two `test.fail(...)` pins (green today; flips to unexpected pass when the fix lands).
- Next: browser-driven audit of `/settings/*` (needs an auth seed), then `/company/branding` upload flow (needs BE to hit the presign path).
- blockers: no docker → cannot drive real BE flows (auth, TOTP, upload, interview). Mock-only surfaces still testable.
- commits: (next commit).
