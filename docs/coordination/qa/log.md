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
- commits: 762e42b.

## 2026-07-29 03:20 UTC — session-f6e0b0

- Sister-pattern sweep on client-only state (looking for more BUG-01 shapes): found BUG-20260728-06 — `ChangeEmailDialog` never collects the current password, BE requires it → every email-change attempt fails against real BE with "invalid password". Mock hides it. Added `it.fails` pin.
- CSP audit on d9add1a: found BUG-20260728-07 — prod CSP `img-src 'self' data:` and `connect-src 'self' <ADMIN> <AIAGENTS>` are too tight for the S3 data-plane. All logo `<img src=presignedS3>` fall back to initials silently; local `<img src=blob:>` previews are blocked; presigned PUT uploads are blocked (logo upload 100% broken in prod). Dev doesn't exercise the strict policy so smoke misses it. Pinning test deferred — needs a `next build && next start` Playwright profile that's not currently in place; handoff proposes adding it as part of the fix.
- Handoffs opened: `2026-07-28-qa-high-email-change-broken.md`, `2026-07-28-qa-high-csp-blocks-s3.md`.
- Next: audit `/profile`, `/applications/[id]`, and `/schedule` for similar seams; consider a broader FE state audit script.
- blockers: no docker; no clean prod-build target for CSP verification (waiting on the Playwright profile).
- commits: (next).

## 2026-07-29 11:45 UTC — session-f6e0b0

- Merged 22 FE-session commits. Re-ran the full regression floor: candidate Vitest 20/20, Playwright 11/11, backend lib 160/160, admin 552 + 1 xfailed, no regressions.
- BUG-20260728-05 verified against `7eb1c96` ("feat(fe): sync marketplace filter/sort/page state to the URL"). Both Playwright pins unexpected-passed → converted `test.fail(...)` → `test(...)` in `frontend/e2e/marketplace-search-url.spec.ts` so they now guard the regression going forward. State moved to `verified`, `verified_in=7eb1c96`.
- Re-checked BUG-01 (TOTP status seam) and BUG-06 (email change requires password): neither seam landed in the FE waves; both still open. Their `it.fails` pins remain green (still expected-failing).
- Next: audit `/profile`, `/applications/[id]`, `/schedule` for BUG-01 sister patterns; extend the smoke suite for the settings-tab URL sync (775d7f3) so a future regression trips it; probe recruiter productivity surfaces (wave 3).
- blockers: no docker; no prod-build Playwright profile for BUG-07.
- commits: 9b32ec9.

## 2026-07-29 12:05 UTC — session-f6e0b0

- Opened `handoffs/2026-07-29-qa-to-mgr-triage-batch.md` (to: MGR) to bundle the six `state=filed` bugs into a single triage roll-up with a suggested owner and severity ranking for each. QA never sets `assignee`; this handoff is a recommendation for the Manager to accept or reject when moving each bug to `state=triaged`.
- Also flagged BUG-05 for closure — it's already `state=verified, verified_in=7eb1c96` and belongs in `bugs-closed.md` on the Manager's next pass.
- Not opening additional bug ledger entries this iteration — waiting on triage before probing further would just backlog the queue.
- blockers: waiting on Manager triage of the Critical + 3 Highs before continuing the hunt.
- commits: (next).
