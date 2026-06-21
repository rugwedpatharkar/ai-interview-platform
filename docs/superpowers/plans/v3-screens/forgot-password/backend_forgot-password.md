# Forgot password — Backend contract (v3 · frozen)

> **Screen.** Request password reset. **FE consumer:** [`frontend_forgot-password.md`](./frontend_forgot-password.md).
> **Status:** `EXISTING — reuse Auth.*` · no new backend, no new collection, no new RPC, no proto delta.
> **Anti-fiction reminder:** Aptura is pre-launch. This contract documents only what the UI consumes
> today. The neutral-by-design response is load-bearing — never confirm or deny account existence.
> See the anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities

- **Request a password reset** for an email → email the user a reset link (carrying a single-use
  token consumed by `reset-password`).
- Response is **neutral by design** — never reveal whether the account exists.

## Service & RPCs (`admin` `AuthService`, gRPC-web — unauthenticated)

| Function | RPC / endpoint | Auth/scope |
|---|---|---|
| Request reset | `api.auth.forgotPassword({ email })` | public (pre-token) |

## Request / Response structures

- **Request:** `{ email: string }`.
- **Response:** treated as **fire-and-confirm** — on resolve the page sets `sent=true` and shows a
  neutral "if an account exists…" message. The body is not read for account existence.
- **FE mock shape:** none — binds to the **existing** `api.auth.forgotPassword`.

## Data required

- Reads the account by email (if present) and writes/queues a reset token + sends the email. Token
  consumed by `reset-password`. Owned by the existing `AuthService` servicer — unchanged.

## Errors & edge cases

- Any RPC error → **neutral** UI: `<Alert tone="danger">` "Couldn't send right now — please try
  again." (never leaks existence).
- Success (resolve) → `<Alert tone="success">` "If an account exists for `<email>`, a reset link
  is on its way." + "Back to sign in" link.

## Cross-references

- Design language (auth-card primitive + anti-fiction):
  [`../_design-language.md`](../_design-language.md).
- FE consumer: [`frontend_forgot-password.md`](./frontend_forgot-password.md).
- Shared auth contract (legacy v2 doc, still authoritative for RPC shapes):
  [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A.
- The emailed token is consumed by `reset-password`
  ([`../reset-password/backend_reset-password.md`](../reset-password/backend_reset-password.md)).
- Sibling screens reusing the same `Auth.*`: `login`, `register-candidate`, `register-company`,
  `reset-password`, `verify-email`, `auth-callback`.
