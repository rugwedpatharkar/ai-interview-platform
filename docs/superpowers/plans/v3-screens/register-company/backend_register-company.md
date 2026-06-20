# Backend — `register-company` (Midnight v3)

> **Screen:** Company sign-up · **FE consumer:** [`frontend_register-company.md`](./frontend_register-company.md)
> **Status:** **EXISTING — reuse `Auth.*`.** Restated from [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A. **No proto delta, no new collection, no new endpoint.**
> **Real-vs-mock today:** **live** — `registerCompany` + `login` ship and are called directly in `apps/company/app/register/page.tsx`. No mock seam.

## Functionalities
- **Register a company** from `companyName` + work email + password → create the company + recruiter account, then **auto-login**.
- On auto-login success → route to `/jobs` (company landing); on failure (e.g. email-verify required) → route to `/login?notice=account-created`. Both are **frontend** branches; no extra RPC.

## Service & RPCs (`admin` `AuthService`, gRPC-web — unauthenticated)
| Function | RPC / endpoint | Auth/scope |
|---|---|---|
| Register company | `api.auth.registerCompany({ companyName, email, password })` (called directly — company register needs `companyName`, so **no `register` config** on the company `makeAuth`) | public (pre-token) |
| Auto-login | `login(email, password)` from `useAuth()` → `AuthService.Login` | public |

## Request / Response structures
- **`registerCompany` request:** `{ companyName: string, email: string, password: string }`.
- **`registerCompany` response:** account/company created; the page does **not** read the body — it proceeds to `login(email, password)`.
- **`login` response:** tokens+identity via `makeAuth` (incl. company/recruiter role).
- **FE mock shape:** none — binds to the **existing** `api.auth.registerCompany` + `useAuth().login`.

## Data required
- Writes a new **company tenant** record + a recruiter account/credential (role `recruiter`/`company`, `tenantId`). Owned by the existing `AuthService` servicer — unchanged.

## Errors & edge cases
- `registerCompany` error → `errorMessage(err)` in `Alert tone="danger"`, `busy=false`, return (no login attempt).
- Auto-login failure (verification gate) → **caught**, routes to `/login?notice=account-created` (success notice on login). `toast.success("Company created — check your email to verify.")` on the happy path.
- `INVALID_ARGUMENT`/duplicate company/`UNAVAILABLE` → same `Alert`.

## Cross-references
- Shared contract: [`../../v2-screens/auth.md`](../../v2-screens/auth.md) §A.
- The `?notice=account-created` query is consumed by `login`'s success notice (see `login/backend_login.md`).
