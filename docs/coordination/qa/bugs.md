# Bugs (open) — QA

All states except `closed`. See `../README.md` for schema and field
ownership. Closed bugs archived in `bugs-closed.md`.

## Summary

Critical: 1  High: 1  Medium: 1  Low: 1

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
