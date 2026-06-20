# Backend — `verify-email` (Midnight v3)

> **Screen:** Verify email · **FE consumer:** [`frontend_verify-email.md`](./frontend_verify-email.md)
> **Status:** **EXISTING — reuse `Auth.*`.** Restated from [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A. **No proto delta, no new collection, no new endpoint.**
> **Real-vs-mock today:** **live** — `verify` + `resendVerification` ship and are called in `apps/candidate/app/verify/page.tsx` (the latter wired into `VerifyCard` per the recent `FE-D` commit). No mock seam.

## Functionalities
- **Verify an email** by consuming the token from `?token=` → mark the account verified.
- **Resend verification** for an email → re-issue the verification email (offered from the verify card).

## Service & RPCs (`admin` `AuthService`, gRPC-web — unauthenticated)
| Function | RPC / endpoint | Auth/scope |
|---|---|---|
| Verify email | `api.auth.verify({ token })` | public (token-scoped) |
| Resend verification | `api.auth.resendVerification({ email })` | public |

## Request / Response structures
- **`verify` request:** `{ token: string }` — token read from `window.location.search`; empty ⇒ `status="invalid"` (RPC not called).
- **`verify` response:** on resolve → `status="ok"`; on reject → `status="error"` + `message = errorMessage(err)`.
- **`resendVerification` request:** `{ email: string }`; response → resolved (`.then(() => {})`), surfaced by `VerifyCard` UI.
- **FE mock shape:** none — binds to the **existing** `api.auth.verify` / `api.auth.resendVerification` (both consumed by `@ip/ui VerifyCard`).

## Data required
- Validates the verification token (existence, not-expired) and flips the account's verified flag; re-mints + emails a fresh token on resend. Owned by the existing `AuthService` servicer — unchanged.

## Errors & edge cases
- **Missing token** → `status="invalid"` (no RPC).
- **Invalid/expired token** → `status="error"` + message; the `VerifyCard` offers resend.
- `VerifyStatus` values: `working | ok | error | invalid` (existing `@ip/ui` type).

## Cross-references
- Shared contract: [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A.
- `VerifyStatus` + `VerifyCard` are existing `@ip/ui` exports (no new enum).
