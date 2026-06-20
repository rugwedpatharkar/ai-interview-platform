# Backend — `reset-password` (Midnight v3)

> **Screen:** Complete password reset · **FE consumer:** [`frontend_reset-password.md`](./frontend_reset-password.md)
> **Status:** **EXISTING — reuse `Auth.*`.** Restated from [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A. **No proto delta, no new collection, no new endpoint.**
> **Real-vs-mock today:** **live** — `resetPassword` (complete-reset) ships and is called in `apps/candidate/app/reset/page.tsx`. No mock seam.

## Functionalities
- **Complete a password reset:** consume the single-use token (from the emailed link, read from `?token=`) + a new password → set the new password, invalidate the token.
- After success → route to `/login`. A **frontend** concern; no extra RPC.

## Service & RPCs (`admin` `AuthService`, gRPC-web — unauthenticated)
| Function | RPC / endpoint | Auth/scope |
|---|---|---|
| Complete reset | `api.auth.resetPassword({ token, newPassword })` | public (token-scoped) |

## Request / Response structures
- **Request:** `{ token: string, newPassword: string }` — `token` read from `window.location.search` (`?token=`); empty token (`""`) ⇒ "invalid link" branch, RPC never called.
- **Response:** on resolve → `router.push("/login")`. Body not read.
- **FE mock shape:** none — binds to the **existing** `api.auth.resetPassword`.

## Data required
- Validates the reset token (existence, not-expired, single-use), writes the new hashed password, invalidates the token. Owned by the existing `AuthService` servicer — unchanged.

## Errors & edge cases
- **Missing token** (`?token=` absent) → client-side "Invalid or expired link" `Alert tone="danger"` + "Request a new link" → `/forgot` (no RPC).
- **Invalid/expired/used token** server-side → `errorMessage(err)` in `Alert tone="danger"`.
- Token state `null` (still reading URL) → submit `disabled`. Min-length 8 enforced client + server.

## Cross-references
- Shared contract: [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A.
- Token is minted by `forgot-password` (`forgot-password/backend_forgot-password.md`).
