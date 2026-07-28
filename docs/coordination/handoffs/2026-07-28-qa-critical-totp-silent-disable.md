# [to: FE + BE] BUG-20260728-01 (Critical) — Setup 2FA silently disables 2FA

**Filed:** 2026-07-28
**State:** filed (Manager: please triage)
**Owner suggestion:** FE + BE, coordinated. FE cannot fix without a BE seam, BE cannot fix without FE stopping the un-gated Setup click.

## Summary

Any user with TOTP enabled sees the Security tab in a wrong state — "Not enabled", **"Set up 2FA"** button — and one click on that button silently rotates their TOTP secret and clears `totp_enabled` server-side. If the user closes the dialog before completing verify, their account is effectively downgraded to password-only, with no notification.

## Root cause

Two half-bugs stacked:

1. **FE — badge and action are client-only state.**
   [`SecurityTab`](../../../frontend/apps/candidate/components/settings/security-tab.tsx#L118) seeds `enabled` from `useState(false)` and never asks the server. Comment at line 116 flags this as known-broken ("At integration, read `totp_enabled` from a me/profile field"). The `SettingsClient` interface has no seam to ask.
2. **BE — `SetupTotp` is not idempotent-guarded.**
   [`setup_totp`](../../../backend/services/admin/app/resources/settings.py#L107) unconditionally overwrites `users.totp_secret` and sets `totp_enabled=False`, even when the caller already has TOTP on. No re-auth, no audit, no warning.

## Proposed fix (coordinated, both sides)

**BE:**
- Add a seam that returns `{ totp_enabled: bool }` scoped to the caller. Simplest: extend an existing `me`-shaped RPC, or a new `GetSecurityStatus` on `SettingsService`.
- Harden `setup_totp`: if `user.totp_enabled` is truthy, require the caller to pass a fresh TOTP or recovery code (mirror `disable_totp`'s challenge) before rotating the secret. Audit the event.
- Do not clear `recovery_codes` on setup — they are cleared today only on verify, but a stale `totp_secret` with valid `recovery_codes` and `totp_enabled=false` is confused state.

**FE:**
- Extend `SettingsClient` with the new read; drive `enabled` from a `useAuthedQuery` result. Show a skeleton until it resolves — never a default `false`.
- If already enabled, do not render the raw "Set up 2FA" button; either hide it, or (if you want to allow device rotation) route through a confirmation dialog that names the tradeoff.

## Reproduction

Manual, no docker — but a live BE is required to prove the silent disable step:

1. Sign in as a user with TOTP enabled.
2. Open `/settings?tab=security`. Observe wrong badge/button.
3. Click **"Set up 2FA"**, then close the dialog immediately.
4. Sign out. Sign in with just the password — no TOTP challenge.
5. Query the user document: `totp_enabled=false`, `totp_secret` is a fresh value.

## Pinning test

[`frontend/apps/candidate/app/settings/settings-client.test.ts`](../../../frontend/apps/candidate/app/settings/settings-client.test.ts) → `"SettingsClient exposes a read of the true TOTP-enabled state (pins BUG-20260728-01)"`. Fails today; passes once the FE seam exists.

Run: `cd frontend && npx pnpm@9.15.0 --filter @ip/candidate test`.

## First seen

Commit `c7a3256` (2026-06-20). Still present at HEAD `477baae`.

## Bug ledger entry

[`docs/coordination/qa/bugs.md#bug-20260728-01`](../qa/bugs.md#bug-20260728-01--severity-critical--fe--be).
