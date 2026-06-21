# Sign in — Backend contract (v3 · frozen)

> **Screen.** Sign in. **FE consumer:** [`frontend_login.md`](./frontend_login.md).
> **Status:** `EXISTING — reuse Auth.*` · no new backend, no new collection, no new RPC, no proto delta.
> **Anti-fiction reminder:** Aptura is pre-launch. This contract documents only what the UI consumes
> today — no fabricated SSO partner names, no claimed integrations, no unearned trust badges. See
> the anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities

- **Authenticate** an email + password → issue a session (access + refresh JWT), set `identity`
  (role-bearing).
- **List OAuth providers** (public) so the SSO buttons render no dead 404s.
- **Begin OAuth authorize** redirect to this app's own `/auth/callback`.
- **Role-aware post-login redirect** is a **frontend** concern (see FE plan): candidate role → `/`,
  recruiter/company role → `/company`. The token simply carries the role claim; no extra RPC.

## Service & RPCs (`admin` `AuthService`, gRPC-web — unauthenticated entry points)

| Function | RPC / endpoint | Auth/scope |
|---|---|---|
| Log in | `login(email, password)` from `useAuth()` → `AuthService.Login` (the `makeAuth` closure stores tokens + sets `identity`) | public (pre-token) |
| List SSO providers | `api.auth.listOAuthProviders({})` → `{ providers: string[] }` | public |
| OAuth authorize | `GET ${ADMIN_URL}/auth/oauth/authorize?provider=<p>&redirect=<thisApp/auth/callback>` | public |
| Log out (shell) | `logout()` from `useAuth()` → clears the token store | n/a |

## Request / Response structures

- **Login request:** `{ email: string, password: string }` (positional `login(email, password)` on
  the FE).
- **Login response:** auth tokens + identity handled **inside `makeAuth`** — `{ access: string,
  refresh: string }` stored; `identity` (incl. **role**) set on the context. The page does not read
  the raw response; it reacts to `useAuth()` state.
- **`listOAuthProviders` response:** `{ providers: string[] }` (e.g. `["google","microsoft"]`);
  empty → the SSO group renders nothing.
- **FE mock shape:** none — the screen binds to the **existing** `useAuth()` / `api.auth.listOAuthProviders`.
  No new contract to mock.

## Data required

- Reads the user credential/account record (email → hashed password verify) and the role/tenant
  claims minted into the JWT. **Owned by the existing `AuthService` servicer + OAuth dispatcher**
  — unchanged by this redesign.

## Errors & edge cases

- Bad credentials → RPC error surfaced as `errorMessage(err)` in the form's `<Alert tone="danger">`
  (existing behavior).
- `UNAVAILABLE` / network → same `<Alert>`; SSO providers RPC failing degrades **silently** (no
  dead buttons, logged at `debug`).
- `?notice=account-created` query (set by company register's verify-gate fallback) renders a
  success `<Alert>` above the form — preserved.

## Cross-references

- Design language (auth-card primitive + tokens + anti-fiction): [`../_design-language.md`](../_design-language.md).
- FE consumer: [`frontend_login.md`](./frontend_login.md).
- Shared auth contract (legacy v2 doc, still authoritative for RPC shapes):
  [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A.
- Sibling pages reusing the same `Auth.*`: `register-candidate`, `register-company`,
  `forgot-password`, `reset-password`, `verify-email`, `auth-callback`.
- Role claim consumed by the FE redirect; same claim drives the shell's role gating (no extra enum
  here).
