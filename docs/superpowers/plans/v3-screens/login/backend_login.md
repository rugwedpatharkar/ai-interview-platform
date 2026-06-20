# Backend — `login` (Midnight v3)

> **Screen:** Sign in · **FE consumer:** [`frontend_login.md`](./frontend_login.md)
> **Status:** **EXISTING — reuse `Auth.*`.** Restated from [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A (the shared auth contract). **No proto delta, no new collection, no new endpoint.** The Midnight redesign is appearance-only; this page consumes the same `AuthService.Login` it ships today.
> **Real-vs-mock today:** **live.** `AuthService.Login` + the OAuth providers endpoint are built and consumed in production. There is no mock seam to stand up.

## Functionalities
- **Authenticate** an email + password → issue a session (access + refresh JWT), set `identity` (role-bearing).
- **List OAuth providers** (public) so the SSO buttons render no dead 404s.
- **Begin OAuth authorize** redirect to this app's own `/auth/callback`.
- **Role-aware post-login redirect** is a **frontend** concern (see FE plan): candidate role → `/`, recruiter/company role → `/company`. The token simply carries the role claim; no extra RPC.

## Service & RPCs (`admin` `AuthService`, gRPC-web — unauthenticated entry points)
| Function | RPC / endpoint | Auth/scope |
|---|---|---|
| Log in | `login(email, password)` from `useAuth()` → `AuthService.Login` (the `makeAuth` closure stores tokens + sets `identity`) | public (pre-token) |
| List SSO providers | `api.auth.listOAuthProviders({})` → `{ providers: string[] }` | public |
| OAuth authorize | `GET ${ADMIN_URL}/auth/oauth/authorize?provider=<p>&redirect=<thisApp/auth/callback>` | public |
| Log out (shell) | `logout()` from `useAuth()` → clears the token store | n/a |

## Request / Response structures
- **Login request:** `{ email: string, password: string }` (positional `login(email, password)` on the FE).
- **Login response:** auth tokens + identity handled **inside `makeAuth`** — `{ access: string, refresh: string }` stored; `identity` (incl. **role**) set on the context. The page does not read the raw response; it reacts to `useAuth()` state.
- **`listOAuthProviders` response:** `{ providers: string[] }` (e.g. `["google","microsoft"]`); empty → `SsoButtons` renders nothing.
- **FE mock shape:** none — the screen binds to the **existing** `useAuth()` / `api.auth.listOAuthProviders`. No new contract to mock.

## Data required
- Reads the user credential/account record (email → hashed password verify) and the role/tenant claims minted into the JWT. **Owned by the existing `AuthService` servicer + OAuth dispatcher** — unchanged by this redesign.

## Errors & edge cases
- Bad credentials → RPC error surfaced as `errorMessage(err)` in the form's `Alert tone="danger"` (existing behavior).
- `UNAVAILABLE` / network → same `Alert`; SSO providers RPC failing degrades **silently** (no dead buttons, logged at `debug`).
- `?notice=account-created` query (set by company register's fallback) renders a success notice on `/login` — preserved.

## Cross-references
- Shared contract: [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A (all auth RPCs, unchanged).
- Sibling pages reusing the same `Auth.*`: `register-candidate`, `register-company`, `forgot-password`, `reset-password`, `verify-email`, `auth-callback`.
- Role claim consumed by the FE redirect; same claim drives the shell's role gating (no extra enum here).
