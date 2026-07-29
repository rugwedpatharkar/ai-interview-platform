---
from: QA
to:   Multiple
priority: Critical
state: open
opened: 2026-07-28 19:30 UTC
---

## What

BUG-20260728-01. Any user with TOTP enabled who clicks "Set up 2FA" from `/settings?tab=security` silently rotates their TOTP secret and clears `totp_enabled` server-side. If they close the dialog before the "Verify & enable" step, their account is effectively downgraded to password-only with no notification. Two half-bugs stacked:

- FE — `SecurityTab` seeds `enabled` from `useState(false)` and never reads the server. The 2FA badge and the Setup/Disable action are wrong for every user with 2FA already on. `SettingsClient` has no seam to ask.
- BE — `setup_totp` unconditionally overwrites `totp_secret` and sets `totp_enabled=False`, with no already-enabled guard, no re-auth challenge, and no audit.

## Why now

Security regression. One mis-click on a button that appears for everyone downgrades 2FA silently.

## What the receiver needs to do

- **BE:** add a caller-scoped read that returns `{ totp_enabled: bool }` (extend a `me`-shaped RPC or add `GetSecurityStatus` on `SettingsService`). Then harden `setup_totp` to reject or challenge if `totp_enabled` is already truthy — mirror `disable_totp`'s TOTP-or-recovery-code gate. Emit an audit event.
- **FE:** wire the new BE read into `SettingsClient`. Drive `enabled` in `SecurityTab` from a `useAuthedQuery` result (skeleton while pending; never a default `false`). Do not offer raw "Set up 2FA" when already enabled — hide it or route through a "rotate device" confirmation.

## Success criteria

- Bug entry moves to `state=verified` with a new `verified_in` sha.
- Pinning test at [frontend/apps/candidate/app/settings/settings-client.test.ts](../../../frontend/apps/candidate/app/settings/settings-client.test.ts) flips from `it.fails` passing → unexpected pass, and the marker is removed in the fix commit so it guards the regression going forward.
- Manual repro from the bug ledger no longer downgrades 2FA.
