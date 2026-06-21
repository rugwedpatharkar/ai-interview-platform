# Verify email — Backend contract (v3 · frozen)

> **Screen.** Verify email. **FE consumer:** [`frontend_verify-email.md`](./frontend_verify-email.md).
> **Status:** `EXISTING — reuse Auth.*` · no new backend, no new collection, no new RPC, no proto delta.
> **Anti-fiction reminder:** Aptura is pre-launch. This contract documents only what the UI consumes
> today; the resend response is neutral by design (never leak existence). See the anti-fiction rule
> in [`_design-language.md`](../_design-language.md).

## Functionalities

- **Verify an email** by consuming the token from `?token=` → mark the account verified.
- **Resend verification** for an email → re-issue the verification email (offered from the
  `error` and `invalid` branches).

## Service & RPCs (`admin` `AuthService`, gRPC-web — unauthenticated)

| Function | RPC / endpoint | Auth/scope |
|---|---|---|
| Verify email | `api.auth.verify({ token })` | public (token-scoped) |
| Resend verification | `api.auth.resendVerification({ email })` | public |

## Request / Response structures

- **`verify` request:** `{ token: string }` — token read from `window.location.search`; empty ⇒
  `status="invalid"` (RPC not called).
- **`verify` response:** on resolve → `status="ok"`; on reject → `status="error"` + `message =
  errorMessage(err)`.
- **`resendVerification` request:** `{ email: string }`; response → resolved (`.then(() => {})`),
  surfaced by the auth-card resend block UI as a neutral `<Alert>` (never confirm or deny
  existence).
- **FE mock shape:** none — binds to the **existing** `api.auth.verify` / `api.auth.resendVerification`
  (both consumed inside the rebuilt auth-card primitive).

## Data required

- Validates the verification token (existence, not-expired) and flips the account's verified flag;
  re-mints + emails a fresh token on resend. Owned by the existing `AuthService` servicer —
  unchanged.

## Errors & edge cases

- **Missing token** → `status="invalid"` (no RPC).
- **Invalid / expired token** → `status="error"` + message; the auth-card offers resend.
- **`VerifyStatus` values:** `working | ok | error | invalid` (existing `@ip/ui` type, re-exported
  from `frontend/packages/ui/src/verify-status.ts` in the v3 rebuild).
- **`called` ref guard** on the FE ensures `verify` fires exactly once in StrictMode — this is FE
  behavior; the server contract is one-shot per token.

## Cross-references

- Design language (auth-card primitive + anti-fiction):
  [`../_design-language.md`](../_design-language.md).
- FE consumer: [`frontend_verify-email.md`](./frontend_verify-email.md).
- Shared auth contract (legacy v2 doc, still authoritative for RPC shapes):
  [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A.
- `VerifyStatus` is an existing `@ip/ui` export (no new enum); re-exported in the v3 rebuild from
  `frontend/packages/ui/src/verify-status.ts`.
- Sibling screens reusing the same `Auth.*`: `login`, `register-candidate`, `register-company`,
  `forgot-password`, `reset-password`, `auth-callback`.
