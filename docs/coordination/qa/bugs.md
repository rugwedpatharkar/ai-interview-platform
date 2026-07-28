# QA bug ledger

State machine: `filed → triaged (Manager assigns owner) → in_progress → verified (QA) → closed (Manager)`.
QA never sets `assignee`, `fix_sha`, or moves to `closed`.

---

## BUG-20260728-01  [severity: Critical]  → FE + BE
- **State:** filed
- **Area:** `/settings?tab=security` (candidate + company) and `admin.settings.v1/SetupTotp`
- **Repro:**
  1. Sign in as a user who **already has TOTP enabled** (`users.totp_enabled=true`).
  2. Open `/settings?tab=security`.
  3. Observe the "Authenticator app (TOTP)" row shows the badge **"Not enabled"** and the primary action is **"Set up 2FA"** — both are wrong.
  4. Click **"Set up 2FA"**. The dialog auto-fires `client.setupTotp()` on `onOpenChange(true)` (no confirm), which calls the `SetupTotp` RPC.
  5. Close the dialog immediately (X, ESC, or click outside) — do **not** complete the "Verify & enable" step.
  6. Attempt to sign in again with just your password (no TOTP challenge required).
- **Expected:** Step 3 should render **"Enabled"** and a **"Disable 2FA"** action. Step 4 must be gated behind an already-enabled check (either the button is not offered, or a confirm dialog warns the existing device will be invalidated). Step 6 must still challenge for TOTP because the previous factor was never voluntarily disabled.
- **Actual:**
  - `SecurityTab` seeds `enabled` from `useState(false)` at [frontend/apps/candidate/components/settings/security-tab.tsx:118](frontend/apps/candidate/components/settings/security-tab.tsx#L118) and never reads the real value from the server. Code comment at line 116 flags this as known-broken ("At integration, read `totp_enabled` from a me/profile field") — the integration was never done. `SettingsClient` has no method to query TOTP state ([frontend/apps/candidate/app/settings/types.ts:42](frontend/apps/candidate/app/settings/types.ts#L42)).
  - `setup_totp` at [backend/services/admin/app/resources/settings.py:107](backend/services/admin/app/resources/settings.py#L107) unconditionally overwrites `totp_secret` with a new secret and sets `totp_enabled=False` — no check that TOTP is already enabled, no re-auth requirement, no audit event.
  - Result: **any user's 2FA can be silently disabled by a single mis-click** on a Security-tab button that appears for everyone regardless of state. Follow-up logins accept a password only; `auth.py` gates TOTP on `user.get("totp_enabled")` at [backend/services/admin/app/resources/auth.py:194](backend/services/admin/app/resources/auth.py#L194), so the account is effectively downgraded to single-factor.
- **Test:** [frontend/apps/candidate/app/settings/settings-client.test.ts](frontend/apps/candidate/app/settings/settings-client.test.ts) — a new `it()` asserting `SettingsClient` exposes a way to query true TOTP state. Fails today because the seam does not exist.
- **First seen:** commit `c7a3256` (2026-06-20) — the shipping commit for `SecurityTab`, which introduced the client-only `useState(false)` seed. Still present at HEAD `477baae`.

---

## BUG-20260728-02  [severity: Low]  → FE (docs)
- **State:** filed
- **Area:** `frontend/packages/ui/src/styles/tokens.css` (design tokens)
- **Repro:**
  1. `git show cae5fe3 --stat` — the appearance tab plus `appearance-client.ts` were deleted 2026-07-23.
  2. `grep -n appearance-client frontend/packages/ui/src/styles/tokens.css`.
- **Expected:** Comment either removed or rewritten to reflect that `--brand` is now purely token-driven.
- **Actual:** [frontend/packages/ui/src/styles/tokens.css:6](frontend/packages/ui/src/styles/tokens.css#L6) still reads "appearance-client.ts drives --brand at runtime for the accent feature". The file no longer exists.
- **Test:** _n/a — pure comment rot; the brand-consistency Playwright suite already asserts `--brand` = `oklch(0.53 0.24 300)`, which is the runtime behaviour the comment mis-describes._
- **First seen:** commit `cae5fe3` (2026-07-23).

---

## BUG-20260728-03  [severity: Medium]  → BE
- **State:** filed
- **Area:** `admin.company_profile.v1/PresignLogoUpload` — logo upload size cap
- **Repro:**
  1. Sign in as a recruiter and hit `PresignLogoUpload` with `content_type=image/png`.
  2. Take the returned `upload_url` and `curl -X PUT -H 'content-type: image/png' --data-binary @LARGE.bin "$upload_url"` where `LARGE.bin` is any file over 2 MB (say 500 MB).
- **Expected:** The presigned URL should reject uploads beyond the client-advertised limit (`LOGO_MAX_BYTES = 2 MB` in [frontend/apps/candidate/app/company/branding/branding-types.ts:35](frontend/apps/candidate/app/company/branding/branding-types.ts#L35)). Storage should be a coordinated FE + BE gate.
- **Actual:** [backend/services/admin/app/resources/company_profile.py:180](backend/services/admin/app/resources/company_profile.py#L180) calls `storage.presigned_put_url(comp_id, "branding", key, content_type)` **without** the optional `content_length` argument. [backend/lib/lib/storage/client.py:208](backend/lib/lib/storage/client.py#L208) accepts `content_length` and binds `ContentLength` on the signed URL, but the admin resource never passes it. Any file size will be accepted by the signed PUT (subject only to the storage provider's own object limit).
  - The ponytail comment at [backend/lib/lib/storage/client.py:214](backend/lib/lib/storage/client.py#L214) notes "PUT presign has no native content-length-range condition; a range bound requires switching to presigned POST" — so a strict upper bound needs the POST switch, but the `ContentLength` binding still forces at least an *exact-size* commitment and blocks the trivial "curl a huge blob" attack.
  - Impact: storage cost / DoS surface — a hostile authenticated recruiter can push arbitrarily large blobs to any tenant-namespaced key they've been granted, at no per-request bound.
- **Test:** [backend/services/admin/tests/test_resources_company_profile.py](backend/services/admin/tests/test_resources_company_profile.py) — new `test_presign_logo_upload_binds_content_length_from_caller_size`. Verified failing today.
- **First seen:** commit before 2026-06-21 (predates the presign resource landing at `f9fbf80` era). Still present at HEAD `477baae`.

---

## BUG-20260728-04  [severity: High]  → BE
- **State:** filed
- **Area:** Docker / dev-env dependency pinning — `mcp` SDK
- **Repro:**
  1. Clean venv, `pip install ./backend/services/ai-agents ./backend/services/mcp-data ./backend/services/mcp-capability`.
  2. `python -c "import app.server"` inside each service.
- **Expected:** Import succeeds; the Render production Dockerfile build succeeds.
- **Actual:** `mcp==2.0.0` resolves today under `mcp>=1.28.1` (the constraint in all three pyproject.toml files). The 2.0 release **removes** `mcp.server.fastmcp.FastMCP` and renames `mcp.client.streamable_http.streamablehttp_client` to `streamable_http_client`. Result:
  - `services/ai-agents/app/infra/mcp_session.py:40` → `ImportError: cannot import name 'streamablehttp_client'`.
  - `services/mcp-data/app/server.py:15` → `ModuleNotFoundError: No module named 'mcp.server.fastmcp'`.
  - `services/mcp-capability/app/server.py:15` → same as above.
  - Effect: **backend/Dockerfile** (single-container Render image) fails at container-start / import time for any fresh build; `services/mcp-data/tests` cannot even collect (`test_server_validation.py` errors at import).
  - Verified locally: pin `mcp>=1.28.1,<2` → `mcp==1.29.0` installs → all three services import → all suites pass (lib 160 / admin 552-1[pinning] / ai-agents 306 / mcp-data 46 / mcp-capability 53).
- **Test:** Existing collection failure in `backend/services/mcp-data/tests/test_server_validation.py` (import error) is the natural pin — it starts passing again once `mcp<2` is in effect. No new file needed. The repro is deterministic under a clean venv.
- **Fix path (lazy):** add `,<2` to the constraint in three pyproject.toml files: [backend/services/ai-agents/pyproject.toml](backend/services/ai-agents/pyproject.toml), [backend/services/mcp-data/pyproject.toml](backend/services/mcp-data/pyproject.toml), [backend/services/mcp-capability/pyproject.toml](backend/services/mcp-capability/pyproject.toml). Full path: migrate call sites to the 2.0 API — larger change, no urgency vs the one-line pin.
- **First seen:** whichever day `mcp==2.0.0` was published. Fresh-install regressions are silent until a clean venv rebuilds.

---
