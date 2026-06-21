# Reset password — Backend contract (v3 · frozen)

> **Screen.** Complete password reset. **FE consumer:** [`frontend_reset-password.md`](./frontend_reset-password.md).
> **Status:** `EXISTING — reuse Auth.*` · no new backend, no new collection, no new RPC, no proto delta.
> **Anti-fiction reminder:** Aptura is pre-launch. This contract documents only what the UI consumes
> today. See the anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities

- **Complete a password reset:** consume the single-use token (from the emailed link, read from
  `?token=`) + a new password → set the new password, invalidate the token.
- After success → route to `/login`. A **frontend** concern; no extra RPC.

## Service & RPCs (`admin` `AuthService`, gRPC-web — unauthenticated)

| Function | RPC / endpoint | Auth/scope |
|---|---|---|
| Complete reset | `api.auth.resetPassword({ token, newPassword })` | public (token-scoped) |

## Request / Response structures

- **Request:** `{ token: string, newPassword: string }` — `token` read from `window.location.search`
  (`?token=`); empty token (`""`) ⇒ "invalid link" branch, RPC never called.
- **Response:** on resolve → `router.push("/login")`. Body not read.
- **FE mock shape:** none — binds to the **existing** `api.auth.resetPassword`.

## Data required

- Validates the reset token (existence, not-expired, single-use), writes the new hashed password,
  invalidates the token. Owned by the existing `AuthService` servicer — unchanged.

## Errors & edge cases

- **Missing token** (`?token=` absent) → client-side "This reset link is invalid or expired."
  `<Alert tone="danger">` + "Request a new link" → `/forgot` (no RPC).
- **Invalid / expired / used token** server-side → `errorMessage(err)` in `<Alert tone="danger">`.
- Token state `null` (still reading URL) → submit `disabled`. Min-length 8 enforced client + server.
- The FE password-strength meter is purely presentational — it does NOT call any backend.

## Cross-references

- Design language (auth-card primitive + password-strength meter + anti-fiction):
  [`../_design-language.md`](../_design-language.md).
- FE consumer: [`frontend_reset-password.md`](./frontend_reset-password.md).
- Shared auth contract (legacy v2 doc, still authoritative for RPC shapes):
  [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A.
- Token is minted by `forgot-password`
  ([`../forgot-password/backend_forgot-password.md`](../forgot-password/backend_forgot-password.md)).
- Sibling screens reusing the same `Auth.*`: `login`, `register-candidate`, `register-company`,
  `forgot-password`, `verify-email`, `auth-callback`.
