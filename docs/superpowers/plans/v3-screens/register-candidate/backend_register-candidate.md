# Backend — `register-candidate` (Midnight v3)

> **Screen:** Candidate sign-up · **FE consumer:** [`frontend_register-candidate.md`](./frontend_register-candidate.md)
> **Status:** **EXISTING — reuse `Auth.*`.** Restated from [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A. **No proto delta, no new collection, no new endpoint.**
> **Real-vs-mock today:** **live** — `registerCandidate` ships and is consumed via `makeAuth`'s `register` config. No mock seam.

## Functionalities
- **Register** a candidate from email + password → create the account, issue a session (same token shape as login).
- After register, the FE routes to `/` (candidate home) — a frontend concern; no extra RPC.
- Same OAuth providers list is available as a sign-up alternative (reused `SsoButtons` if present; the candidate register page today has no SSO footer — unchanged).

## Service & RPCs (`admin` `AuthService`, gRPC-web — unauthenticated)
| Function | RPC / endpoint | Auth/scope |
|---|---|---|
| Register candidate | `register(email, password)` from `useAuth()` → `api.auth.registerCandidate({ email, password })` (wired as the `makeAuth` `register` closure) | public (pre-token) |

## Request / Response structures
- **Request:** `registerCandidate({ email: string, password: string })`.
- **Response:** auth tokens / identity handled **inside `makeAuth`** (`{ access, refresh }` stored, `identity` set) — same as login. The page reacts to `useAuth()` state, then `router.push("/")`.
- **FE mock shape:** none — binds to the **existing** `useAuth().register` → `api.auth.registerCandidate`.

## Data required
- Writes a new candidate account/credential record (email uniqueness, hashed password) + role claim `candidate`. Owned by the existing `AuthService` servicer — unchanged.

## Errors & edge cases
- Duplicate email / weak password / `INVALID_ARGUMENT` → surfaced as `errorMessage(err)` in the shared `CredentialsForm` `Alert tone="danger"`.
- `UNAVAILABLE`/network → same `Alert`. Min-length 8 enforced client-side (`Input minLength={8}`) + server.

## Cross-references
- Shared contract: [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A.
- Uses the **same `CredentialsForm`** as `login` (just a different `action` + labels), so it inherits the split layout automatically.
