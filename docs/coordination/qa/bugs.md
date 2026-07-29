# Bugs (open) — QA

All states except `closed`. See `../README.md` for schema and field
ownership. Closed bugs archived in `bugs-closed.md`.

## Summary

Critical: 1  High: 3  Medium: 2 (1 verified) Low: 1

## BUG-20260728-01  [Critical]
- state: filed
- assignee: unassigned
- filed_by: QA in e4d7809
- fix_sha: -
- verified_in: -
- area: `/settings?tab=security` (candidate + company) and `admin.settings.v1/SetupTotp`
- repro:
  1. Sign in as a user who already has TOTP enabled (`users.totp_enabled=true`).
  2. Open `/settings?tab=security`. The Authenticator row shows badge "Not enabled" and the primary action "Set up 2FA" — both wrong.
  3. Click "Set up 2FA". The dialog auto-fires `client.setupTotp()` on `onOpenChange(true)` with no confirm — the `SetupTotp` RPC lands.
  4. Close the dialog immediately (X, ESC, or click outside) — do not complete the "Verify & enable" step.
  5. Sign out and back in with just the password. No TOTP challenge fires.
- expected: Step 2 renders "Enabled" and a "Disable 2FA" action. Step 3 is gated by an already-enabled check (or a confirm dialog). Step 5 challenges for TOTP because the previous factor was never voluntarily disabled.
- actual: `SecurityTab` seeds `enabled` from `useState(false)` at [frontend/apps/candidate/components/settings/security-tab.tsx:118](../../../frontend/apps/candidate/components/settings/security-tab.tsx#L118) and never reads the server value (comment at line 116 flags this as known-broken). `SettingsClient` has no seam. `setup_totp` at [backend/services/admin/app/resources/settings.py:107](../../../backend/services/admin/app/resources/settings.py#L107) unconditionally overwrites `totp_secret` and sets `totp_enabled=False`. Effect: any user's 2FA is silently disabled by one mis-click on a button that appears for everyone regardless of state; `auth.py:194` gates the TOTP login challenge on `totp_enabled`, so the account downgrades to password-only with no signal.
- test: [frontend/apps/candidate/app/settings/settings-client.test.ts](../../../frontend/apps/candidate/app/settings/settings-client.test.ts) — `it.fails(...)` pin. Passes today (inner assertion throws as expected); will fail when the seam lands so the marker prompts removal.
- notes:
  - QA 2026-07-28 19:30 UTC — filed. Handoff: `handoffs/2026-07-28-qa-critical-totp-silent-disable.md`. Requires coordinated FE + BE fix.

## BUG-20260728-04  [High]
- state: filed
- assignee: unassigned
- filed_by: QA in e4d7809
- fix_sha: -
- verified_in: -
- area: `backend/services/{ai-agents,mcp-data,mcp-capability}/pyproject.toml` — `mcp` version constraint
- repro:
  1. Clean venv: `python -m venv .venv && .venv/bin/pip install ./backend/lib ./backend/services/{admin,ai-agents,mcp-data,mcp-capability}`.
  2. `.venv/bin/python -c "import app.server"` inside `mcp-data` (or `mcp-capability`); `import app.infra.mcp_session` inside `ai-agents`.
- expected: Imports succeed. The Render single-container Dockerfile boot succeeds on a fresh build.
- actual: `mcp==2.0.0` resolves under `mcp>=1.28.1`. 2.0 removed `mcp.server.fastmcp.FastMCP` and renamed `mcp.client.streamable_http.streamablehttp_client` → `streamable_http_client`. Failures: `services/mcp-data/app/server.py:15` and `services/mcp-capability/app/server.py:15` → `ModuleNotFoundError: mcp.server.fastmcp`. `services/ai-agents/app/infra/mcp_session.py:40` → `ImportError: streamablehttp_client`. Effect: `backend/Dockerfile` fails on any clean build, `services/mcp-data/tests/test_server_validation.py` can't even collect. Verified locally: pin `mcp>=1.28.1,<2` → mcp==1.29.0 → all imports succeed and all suites pass (lib 160 / admin 552 + 1 xfailed / ai-agents 306 / mcp-data 46 / mcp-capability 53).
- test: existing collection failure in `backend/services/mcp-data/tests/test_server_validation.py` is the natural pin — it starts passing again once `mcp<2` is in effect. No new file added.
- notes:
  - QA 2026-07-28 19:30 UTC — filed. Handoff: `handoffs/2026-07-28-qa-high-mcp-version-unpinned.md`. Lazy fix is `,<2` in three pyproject.toml files.

## BUG-20260728-07  [High]
- state: filed
- assignee: unassigned
- filed_by: QA in 762e42b
- fix_sha: -
- verified_in: -
- area: Production Content-Security-Policy in `frontend/apps/candidate/middleware.ts` — img-src / connect-src too tight for the S3 data-plane
- repro:
  1. `cd frontend/apps/candidate && NODE_ENV=production next build && next start -p 3100`.
  2. Sign in as a recruiter; open `/company/branding`. Pick a logo file from disk. Observe:
     a. The local preview (an `<img src={URL.createObjectURL(file)}>` — a `blob:` URL) never renders — the Avatar / preview swaps to initials because `img-src 'self' data:` does not include `blob:`.
     b. The PUT to the presigned URL fails: `Refused to connect to '<bucket>.s3.<region>.amazonaws.com' because it violates the following Content Security Policy directive: "connect-src 'self' <ADMIN> <AIAGENTS>"`. The upload throws; the recruiter sees "Upload failed — try again."
  3. Open `/companies/1` (or any public profile whose owner has a `logo` field). The Avatar `<img>` request to the S3 origin is blocked by `img-src`; onError fires and swaps in the initials. **Silent** — no user-facing error, just the wrong visual.
- expected: All product surfaces that consume S3-signed URLs (logo view + upload today; recording playback for integrity; any future signed asset) render correctly under the prod CSP. Preview-from-file (blob:) also renders.
- actual: [frontend/apps/candidate/middleware.ts:23](../../../frontend/apps/candidate/middleware.ts#L23) builds the CSP with `img-src 'self' data:` (no `blob:`, no storage origin) and `connect-src 'self' ${ADMIN} ${AIAGENTS}` (no storage origin). Presigned GET/PUT URLs point at the S3 endpoint from `backend/lib/lib/storage/client.py:154` / `:201`, which is not `'self'` — every image + upload against that endpoint is blocked in production.
  - The FE has no `NEXT_PUBLIC_STORAGE_URL` env var, so even a well-intentioned middleware author has no origin to inject into the CSP list today. Two viable fixes: (a) add `NEXT_PUBLIC_STORAGE_URL` and thread it into both `img-src` and `connect-src`; (b) proxy all storage traffic through the admin service so it stays same-origin.
  - Dev mode masks it: the dev branch of the CSP is `script-src 'self' 'unsafe-inline' 'unsafe-eval'` and img-src / connect-src also fall back to same-origin behavior with the local mock. The Playwright smoke runs in dev and does not exercise the strict prod policy.
  - The d9add1a verification note ("no console CSP violations, and the landing audience switch still hydrates and swaps") is correct as written — it verified scripts + hydration on the landing. Neither the branding editor nor the public company page were on that check-list.
- test: none pinned (yet). A robust pin needs either a Playwright suite against a prod build (currently absent) or a Vitest that instantiates the middleware and inspects the CSP string — the middleware needs a NextRequest polyfill which the candidate app's Vitest config does not include. Manager: recommend adding a `frontend/e2e/csp-prod.spec.ts` that runs against `next start` (behind a `PLAYWRIGHT_PROD=1` guard) as part of the fix.
- notes:
  - QA 2026-07-29 03:15 UTC — filed after auditing d9add1a end-to-end. Silent user-visible regression on brand identity, and hard-blocks logo upload in prod.

## BUG-20260728-06  [High]
- state: filed
- assignee: unassigned
- filed_by: QA in 762e42b
- fix_sha: -
- verified_in: -
- area: `/settings` → Change email dialog (candidate + company) — email change is 100% broken against the real BE
- repro:
  1. Sign in as a password-auth user (not SSO).
  2. Open `/settings?tab=account`. Click **Change email**.
  3. Enter a valid new email. Click **Send confirmation**.
  4. Observe toast "invalid password" (or the localized equivalent) — from a form that never asked for a password.
- expected: The dialog collects the current password (mirrors the Change-password card next to it), forwards it to `RequestEmailChange`, and BE stages the pending email + emails both addresses.
- actual: [frontend/apps/candidate/components/settings/change-email-dialog.tsx](../../../frontend/apps/candidate/components/settings/change-email-dialog.tsx) has no password field. [frontend/apps/candidate/app/settings/settings-client.ts:122](../../../frontend/apps/candidate/app/settings/settings-client.ts#L122) forwards only `{ newEmail }` — the `current_password` field on `RequestEmailChangeRequest` (see `settings.proto:49`) defaults to `""`. BE [backend/services/admin/app/resources/settings.py:255](../../../backend/services/admin/app/resources/settings.py#L255) calls `verify_password("" , stored_hash)` → False → raises `InvalidCredentialsError`. Every submission fails; user sees a mysterious auth error.
  - The mock at `settings-client.ts:57` returns `undefined` unconditionally, so smoke tests + local mock UI hide the bug — it only surfaces against a real backend.
  - BE contract is correct and covered by `test_request_email_change_rejects_bad_password` in `test_resources_settings.py:348`. The regression is purely on the FE side of the seam.
- test: `frontend/apps/candidate/app/settings/settings-client.test.ts` — `it.fails` pin on `SettingsClient.requestEmailChange.length >= 2` (a fixed signature accepts both new email and current password). Passes today (mock has arity 0); flips to unexpected-pass when the signature is fixed.
- notes:
  - QA 2026-07-28 20:35 UTC — filed. Fix: extend `SettingsClient.requestEmailChange(newEmail, currentPassword)`, thread it through both mock + real clients, add a password `<Input>` to `ChangeEmailDialog`.

## BUG-20260728-03  [Medium]
- state: filed
- assignee: unassigned
- filed_by: QA in e4d7809
- fix_sha: -
- verified_in: -
- area: `admin.company_profile.v1/PresignLogoUpload` — logo upload size cap
- repro:
  1. Sign in as a recruiter, call `PresignLogoUpload` with `content_type=image/png`.
  2. `curl -X PUT -H 'content-type: image/png' --data-binary @LARGE.bin "$upload_url"` where `LARGE.bin` is over 2 MB (say 500 MB).
- expected: The signed PUT rejects any body beyond the client-advertised `LOGO_MAX_BYTES = 2 MB` ([frontend/apps/candidate/app/company/branding/branding-types.ts:35](../../../frontend/apps/candidate/app/company/branding/branding-types.ts#L35)).
- actual: [backend/services/admin/app/resources/company_profile.py:180](../../../backend/services/admin/app/resources/company_profile.py#L180) calls `storage.presigned_put_url(...)` without the optional `content_length`. [backend/lib/lib/storage/client.py:208](../../../backend/lib/lib/storage/client.py#L208) accepts `content_length` and binds `ContentLength` on the URL — the admin resource never passes it, so any-size uploads succeed. Impact: storage cost / DoS surface for authenticated recruiters.
- test: [backend/services/admin/tests/test_resources_company_profile.py](../../../backend/services/admin/tests/test_resources_company_profile.py) — `test_presign_logo_upload_binds_content_length_from_caller_size` with `@pytest.mark.xfail(strict=True)`. Verified xfailing today; flips to unexpected-pass when the fix lands.
- notes:
  - QA 2026-07-28 19:30 UTC — filed. Fix path: add `size` to the resource signature, forward as `content_length` to storage. The lib-storage comment at `client.py:214` notes a full range-bound needs the POST switch — content_length binding is the interim gate.

## BUG-20260728-05  [Medium]
- state: verified
- assignee: FE
- filed_by: QA in 5e2f991
- fix_sha: -
- verified_in: 7eb1c96
- area: `/jobs` marketplace — URL is one-way for search / filter / sort state
- repro:
  1. `next dev -p 3000 NEXT_PUBLIC_MOCK=1`. Navigate to `http://localhost:3000/jobs?q=frontend` → the input is seeded with "frontend" and results filter correctly. Good so far.
  2. Type any different value in the search input, hit Search. Results update. Check `location.href` — pre-fix, still `/jobs?q=frontend`.
  3. Click a filter chip (Remote / Hybrid / On-site). Results update. `location.href` — pre-fix, unchanged.
  4. Reload the page. Pre-fix, all user input is lost — only the *initial* query-string value comes back.
- expected: The URL is the source of truth for search / filter / sort / page state. Every user action pushes a new URL so reload, back/forward, and share/bookmark all recover the same result set.
- actual (pre-fix): `frontend/apps/candidate/app/jobs/marketplace.tsx` held `params` in `useState`; `setFilters`/`setParams`/`goToPage` updated local state only, no router push. Bookmarks/back/reload all broke.
- test: [frontend/e2e/marketplace-search-url.spec.ts](../../../frontend/e2e/marketplace-search-url.spec.ts) — two Playwright regression guards (search + filter both push to URL). Both pass live against HEAD.
- notes:
  - QA 2026-07-28 20:10 UTC — filed after live driving. XSS properly escaped; SQL-flavored strings do not crash — only bug in this hunt lens was the URL-sync gap.
  - QA 2026-07-29 11:40 UTC — verified against 7eb1c96 ("feat(fe): sync marketplace filter/sort/page state to the URL"). Pinning tests unexpected-passed after merge; converted `test.fail(...)` → `test(...)` in the same spec so they now guard the regression going forward.

## BUG-20260728-02  [Low]
- state: filed
- assignee: unassigned
- filed_by: QA in e4d7809
- fix_sha: -
- verified_in: -
- area: `frontend/packages/ui/src/styles/tokens.css` (design tokens — comment rot)
- repro:
  1. `grep -n appearance-client frontend/packages/ui/src/styles/tokens.css`.
  2. `ls frontend/apps/candidate/app/settings/appearance-client.ts` (file deleted in cae5fe3).
- expected: The comment either drops the reference or rewrites it to reflect that `--brand` is now purely token-driven.
- actual: [frontend/packages/ui/src/styles/tokens.css:6](../../../frontend/packages/ui/src/styles/tokens.css#L6) still reads "appearance-client.ts drives --brand at runtime for the accent feature". The file no longer exists.
- test: n/a — pure comment rot. The brand-consistency Playwright suite already asserts `--brand` = `oklch(0.53 0.24 300)`, which is the runtime behaviour the comment mis-describes.
- notes:
  - QA 2026-07-28 19:30 UTC — filed. Trivial one-line edit.
