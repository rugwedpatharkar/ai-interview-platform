---
from: QA
to:   FE
priority: High
state: open
opened: 2026-07-29 03:00 UTC
---

## What

BUG-20260728-06. `ChangeEmailDialog` collects only the new email; the client never forwards a `current_password`. The BE `RequestEmailChange` RPC requires `current_password` (see `settings.proto:49`) and correctly rejects an empty value with `InvalidCredentialsError`. Result: every real-BE email-change attempt fails with "invalid password" from a form that never asked for one.

The bug is invisible in dev + smoke because the mock `SettingsClient.requestEmailChange` returns `undefined` unconditionally.

## Why now

100% failure rate on a self-service surface. Users cannot change their email in production.

## What the receiver needs to do

1. Extend `SettingsClient.requestEmailChange` (types.ts) to `(newEmail: string, currentPassword: string) => Promise<void>`.
2. Update both `makeMockSettingsClient` (accept + ignore, or accept + validate against a fake) and `makeApiSettingsClient` (forward the password into the RPC payload).
3. Add a `<Input type="password" autoComplete="current-password">` to [frontend/apps/candidate/components/settings/change-email-dialog.tsx](../../../frontend/apps/candidate/components/settings/change-email-dialog.tsx), disable submit until both fields are non-empty and email is valid.
4. The `it.fails` pin in `frontend/apps/candidate/app/settings/settings-client.test.ts` (`SettingsClient.requestEmailChange forwards a current password`) will flip to unexpected-pass — remove the `.fails` marker so it guards the regression.

## Success criteria

- Manual repro from the bug ledger no longer surfaces "invalid password" on a well-formed submission.
- BUG-06 pin in `settings-client.test.ts` becomes a normal `it(...)` after the fix; `pnpm --filter @ip/candidate test` stays green.
- Bug entry moves to `state=verified` with a new `verified_in` sha.
