# SSO callback — Backend contract (v3 · frozen)

> **Screen.** SSO callback (transient interstitial). **FE consumer:**
> [`frontend_auth-callback.md`](./frontend_auth-callback.md).
> **Status:** `EXISTING — reuse Auth.* (no RPC)` · no new backend, no new collection, no new RPC,
> no proto delta.
> **Anti-fiction reminder:** Aptura is pre-launch. This contract documents only what the UI consumes
> today — no fabricated SSO partner names. See the anti-fiction rule in
> [`_design-language.md`](../_design-language.md).

## Functionalities

- **Receive the SSO hash token** from the provider redirect (`#access_token=…`), **validate the
  JWT** client-side (structure + non-expired), **seed** the access token into the store, and
  **role-route** the user onward (candidate → `/`, recruiter/company → `/company`).
- **No RPC is called here** — the access token is minted by the OAuth dispatcher upstream (during
  `GET ${ADMIN_URL}/auth/oauth/authorize`); this page only consumes what the redirect delivered.

## Service & RPCs

| Function | RPC / endpoint | Auth/scope |
|---|---|---|
| (upstream) Authorize | `GET ${ADMIN_URL}/auth/oauth/authorize?provider=<p>&redirect=<thisApp/auth/callback>` — initiated by the SSO group on `/login` | public |
| Callback handling | **none** — pure client: parse `window.location.hash`, validate JWT, `store.set({ access, refresh: "" })`, `router.replace("/")` (or `/company` for recruiter role) | n/a |

## Request / Response structures

- **Inbound (hash):** `#access_token=<jwt>` (or `#error=<…>`). The refresh token rides an
  **HttpOnly cookie** (not JS-readable) — cookie-based silent refresh is a documented follow-up;
  `refresh` seeded as `""`.
- **JWT validation (client, preserved verbatim):**
  1. Exactly 3 dot-segments, all non-empty.
  2. Base64url-decoded payload parses to a non-null object.
  3. `exp` claim is not in the past (10-second clock-skew grace).
- **FE mock shape:** none — no contract; the page binds to the **existing** `store` + JWT parser.

## Data required

- None server-side here. Client reads `window.location.hash`, writes the access token to the
  in-memory/persisted auth `store`.

## Errors & edge cases

- `#error=…` present → "Sign-in failed. Please try again." + back-to-login (no `store.set`).
- No `access_token` → "No session was returned." (no `store.set`).
- Structurally-invalid / expired JWT → "The session token was invalid. Please sign in again." (no
  `store.set`).
- **Resolve timeout** (`RESOLVE_TIMEOUT_MS = 8000`) → "Sign-in is taking too long. Please try
  again." (never spins forever; no `store.set`).
- All five error strings are preserved verbatim from today — see
  [`frontend_auth-callback.md`](./frontend_auth-callback.md) §Tasks.

## Cross-references

- Design language (auth-card primitive + anti-fiction):
  [`../_design-language.md`](../_design-language.md).
- FE consumer: [`frontend_auth-callback.md`](./frontend_auth-callback.md).
- Shared auth contract (legacy v2 doc, still authoritative for RPC shapes):
  [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A (OAuth authorize / providers).
- The authorize redirect is started by the SSO group on `/login`
  ([`../login/backend_login.md`](../login/backend_login.md)).
- Sibling screens reusing the same `Auth.*`: `login`, `register-candidate`, `register-company`,
  `forgot-password`, `reset-password`, `verify-email`.
