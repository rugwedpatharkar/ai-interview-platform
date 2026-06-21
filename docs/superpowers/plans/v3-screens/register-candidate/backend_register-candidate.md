# Candidate sign-up — Backend contract (v3 · frozen)

> **Screen.** Candidate sign-up. **FE consumer:** [`frontend_register-candidate.md`](./frontend_register-candidate.md).
> **Status:** `EXISTING — reuse Auth.*` · no new backend, no new collection, no new RPC, no proto delta.
> **Anti-fiction reminder:** Aptura is pre-launch. This contract documents only what the UI consumes
> today — no fake user counts, no fabricated social proof. See the anti-fiction rule in
> [`_design-language.md`](../_design-language.md).

## Functionalities

- **Register** a candidate from email + password → create the account, issue a session (same token
  shape as login).
- After register, the FE routes to `/` (candidate home) — a frontend concern; no extra RPC.
- Same OAuth providers list is available as a sign-up alternative on `/login`; the candidate
  register page currently has no SSO group (unchanged here — see `login/backend_login.md` for the
  provider-listing contract).

## Service & RPCs (`admin` `AuthService`, gRPC-web — unauthenticated)

| Function | RPC / endpoint | Auth/scope |
|---|---|---|
| Register candidate | `register(email, password)` from `useAuth()` → `api.auth.registerCandidate({ email, password })` (wired as the `makeAuth` `register` closure) | public (pre-token) |

## Request / Response structures

- **Request:** `registerCandidate({ email: string, password: string })`.
- **Response:** auth tokens / identity handled **inside `makeAuth`** (`{ access, refresh }` stored,
  `identity` set with role `candidate`) — same as login. The page reacts to `useAuth()` state, then
  `router.push("/")`.
- **FE mock shape:** none — binds to the **existing** `useAuth().register` →
  `api.auth.registerCandidate`.

## Data required

- Writes a new candidate account/credential record (email uniqueness, hashed password) + role
  claim `candidate`. Owned by the existing `AuthService` servicer — unchanged.

## Errors & edge cases

- Duplicate email / weak password / `INVALID_ARGUMENT` → surfaced as `errorMessage(err)` in the
  auth-card's `<Alert tone="danger">`.
- `UNAVAILABLE` / network → same `<Alert>`. Min-length 8 enforced client-side (`Input
  minLength={8}`) + server. The FE password-strength meter is purely presentational — it does NOT
  call any backend.

## Cross-references

- Design language (auth-card primitive + password-strength meter + anti-fiction):
  [`../_design-language.md`](../_design-language.md).
- FE consumer: [`frontend_register-candidate.md`](./frontend_register-candidate.md).
- Shared auth contract (legacy v2 doc, still authoritative for RPC shapes):
  [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A.
- Sibling screens reusing the same `Auth.*`: `login`, `register-company`, `forgot-password`,
  `reset-password`, `verify-email`, `auth-callback`.
- Uses the **same auth-card primitive** as `login` (just a different headline + action). Different
  field set (no SSO group today), shared primitive.
