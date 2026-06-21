# Company sign-up — Backend contract (v3 · frozen)

> **Screen.** Company sign-up. **FE consumer:** [`frontend_register-company.md`](./frontend_register-company.md).
> **Status:** `EXISTING — reuse Auth.*` · no new backend, no new collection, no new RPC, no proto delta.
> **Anti-fiction reminder:** Aptura is pre-launch. This contract documents only what the UI consumes
> today — no fake customer counts, no fabricated social proof, no claimed ATS integrations. See the
> anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities

- **Register a company** from `companyName` + work email + password → create the company tenant +
  recruiter account, then **auto-login**.
- On auto-login success → route to `/jobs` (company landing); on failure (e.g. email-verify
  required) → route to `/login?notice=account-created`. Both are **frontend** branches; no extra
  RPC.

## Service & RPCs (`admin` `AuthService`, gRPC-web — unauthenticated)

| Function | RPC / endpoint | Auth/scope |
|---|---|---|
| Register company | `api.auth.registerCompany({ companyName, email, password })` (called directly — company register needs `companyName`, so **no `register` config** on the company `makeAuth`) | public (pre-token) |
| Auto-login | `login(email, password)` from `useAuth()` → `AuthService.Login` | public |

## Request / Response structures

- **`registerCompany` request:** `{ companyName: string, email: string, password: string }`.
- **`registerCompany` response:** account/company created; the page does **not** read the body —
  it proceeds to `login(email, password)`.
- **`login` response:** tokens + identity via `makeAuth` (incl. role `recruiter` / `company` and
  `tenantId`).
- **FE mock shape:** none — binds to the **existing** `api.auth.registerCompany` +
  `useAuth().login`.

## Data required

- Writes a new **company tenant** record + a recruiter account/credential (role
  `recruiter` / `company`, `tenantId`). Owned by the existing `AuthService` servicer — unchanged.

## Errors & edge cases

- `registerCompany` error → `errorMessage(err)` in `<Alert tone="danger">`, `busy=false`, return
  (no login attempt).
- Auto-login failure (verification gate) → **caught**, routes to `/login?notice=account-created`
  (success notice on login). `toast.success("Company created — check your email to verify.")` on
  the happy path.
- `INVALID_ARGUMENT` / duplicate company / `UNAVAILABLE` → same `<Alert>`.
- The FE password-strength meter is purely presentational — it does NOT call any backend.

## Cross-references

- Design language (auth-card primitive + anti-fiction):
  [`../_design-language.md`](../_design-language.md).
- FE consumer: [`frontend_register-company.md`](./frontend_register-company.md).
- Shared auth contract (legacy v2 doc, still authoritative for RPC shapes):
  [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A.
- The `?notice=account-created` query is consumed by `login`'s success-notice render path (see
  `login/backend_login.md`).
- Sibling screens reusing the same `Auth.*`: `login`, `register-candidate`, `forgot-password`,
  `reset-password`, `verify-email`, `auth-callback`.
