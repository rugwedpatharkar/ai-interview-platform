# Backend — `auth-callback` (Midnight v3)

> **Screen:** SSO callback · **FE consumer:** [`frontend_auth-callback.md`](./frontend_auth-callback.md)
> **Status:** **EXISTING — reuse `Auth.*` (no RPC).** Restated from [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A. **No proto delta, no new collection, no new endpoint.**
> **Real-vs-mock today:** **live** — the SSO authorize→callback round-trip ships; the callback reads the hash token client-side. No mock seam.

## Functionalities
- **Receive the SSO hash token** from the provider redirect (`#access_token=…`), **validate the JWT** client-side (structure + non-expired), **seed** the access token into the store, and **role-route** the user onward (candidate → `/`).
- **No RPC is called here** — the access token is minted by the OAuth dispatcher upstream (during `GET ${ADMIN_URL}/auth/oauth/authorize`); this page only consumes what the redirect delivered.

## Service & RPCs
| Function | RPC / endpoint | Auth/scope |
|---|---|---|
| (upstream) Authorize | `GET ${ADMIN_URL}/auth/oauth/authorize?provider=<p>&redirect=<thisApp/auth/callback>` — initiated by `SsoButtons` on `login` | public |
| Callback handling | **none** — pure client: parse `window.location.hash`, validate JWT, `store.set({ access, refresh: "" })`, `router.replace("/")` | n/a |

## Request / Response structures
- **Inbound (hash):** `#access_token=<jwt>` (or `#error=<...>`). The refresh token rides an **HttpOnly cookie** (not JS-readable) — cookie-based silent refresh is a documented follow-up; `refresh` seeded as `""`.
- **JWT validation (client):** 3 dot-segments, all non-empty; base64url payload parses to a non-null object; `exp` not in the past (10 s clock-skew grace).
- **FE mock shape:** none — no contract; the page binds to the **existing** `store` + JWT parsing.

## Data required
- None server-side here. Client reads `window.location.hash`, writes the access token to the in-memory/persisted auth `store`.

## Errors & edge cases
- `#error=…` present → "Sign-in failed. Please try again." + back-to-login.
- No `access_token` → "No session was returned."
- Structurally-invalid/expired JWT → "The session token was invalid. Please sign in again."
- **Resolve timeout** (`RESOLVE_TIMEOUT_MS = 8000`) → "Sign-in is taking too long. Please try again." (never spins forever).

## Cross-references
- Shared contract: [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A (OAuth authorize/providers).
- The authorize redirect is started by `SsoButtons` on `login` (`login/backend_login.md`).
