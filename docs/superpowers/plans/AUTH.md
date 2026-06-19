# AUTHENTICATION & SESSION (JWT) — company + candidate logins

> **⚠️ 2026-06-17 update:** transport is **gRPC** (admin-service is gRPC). The auth *design*
> below (JWT access+refresh, sessions, rate-limit, lockout) is unchanged and lives in
> `app/resources/auth.py`; the §5 REST endpoints are now gRPC RPCs (`app/pb/auth.proto`),
> with tokens in proto messages + the `authorization` metadata.

> Design + plan for identity, login, and session for **both personas** (company users
> and candidates) at the production-security bar (`PRODUCTION_STANDARDS.md`). Auth is
> **Epic A, Phase 1**, built on corelib `security`. This is the authoritative auth
> design; it **supersedes** the scattered/stale auth notes in
> `2026-06-16-backend-foundation-auth.md` (that file's code is obsolete — only its
> endpoint contracts remain a reference). See `ARCHITECTURE.md` §6/§9 and
> `ADMIN_SERVICE.md` §3–4.

## 1. Scope

JWT authentication for **company orgs** (multi-recruiter: `company_admin`, `recruiter`)
and **candidates**. Covers registration, email verification, login, session
(access + refresh), logout/revocation, password reset, and role/tenant guards.
**admin-service owns auth**; ai-agents and mcp servers only *verify* tokens. SSO is P2
(out of scope here).

## 2. Current state — built vs. to-build

| Piece | State |
|---|---|
| corelib `TokenService` (access/verification/decode, alg-pinned) | ✅ built, green |
| corelib `hash_password`/`verify_password` (bcrypt + SHA-256 pre-hash) | ✅ built, green |
| `Company`/`User` models + repos (`comp_id`, `Role`) | ✅ migrated |
| admin-service auth routes / `get_current_user` / `require_role` | ⏳ HANDOFF §9.1 (in-flux) |
| Refresh tokens + revocation, rate-limit/lockout, password reset, auth audit | ❌ **this plan adds** |

## 3. Identity model

- **Company registration** creates the org (`Company`) + its first `company_admin`;
  admins **invite** recruiters (role assigned, `comp_id` inherited).
- **Candidates self-register** (no `comp_id`).
- Roles (`corelib.schemas.Role`): `company_admin`, `recruiter` (tenant users — carry
  `comp_id`), `candidate` (no `comp_id`).
- **`comp_id` is derived from the authenticated token on every request — never from
  client input** (tenant isolation; see security standard).

## 4. Token strategy (production)

- **Access + refresh** (locked): short-lived **access** JWT (**15 min**) + longer
  **refresh** token (**14 days**). Cheap-to-verify access, fast expiry, revocable
  sessions.
- **Access claims:** `sub` (user_id), `role`, `comp_id`, `iat`, `exp`, `jti`, `type:"access"`;
  HS256 with the algorithm **pinned on decode** (no `alg=none` confusion). `type` claim
  prevents a refresh token being replayed as an access token (and vice-versa).
- **Refresh:** own `jti`, `type:"refresh"`; **rotated on every use** (one-time-use; reuse
  of a retired refresh → revoke the whole token family). Active refresh `jti`s live in
  **Redis** (with TTL) for revocation + logout.
- **Frontend storage: httpOnly, `Secure`, `SameSite` cookies** for both tokens
  (XSS-safe; FRONTEND.md preference) paired with **CSRF protection** (double-submit
  token), since cookies auto-send.
- **Secret** from env / secret-manager; never logged. Full rotation (key id / grace
  window) is P5; single secret in P1.

## 5. Endpoints (admin-service, `/api/v1`, `{status,message,data}` envelope)

| Endpoint | Purpose |
|---|---|
| `POST /auth/register/company` | create org + `company_admin`; send verification email |
| `POST /auth/register/candidate` | create candidate; send verification email |
| `POST /auth/verify` | confirm email (purpose-scoped verification token) |
| `POST /auth/login` | credentials → access + refresh (set httpOnly cookies) |
| `POST /auth/refresh` | rotate refresh → new access + refresh |
| `POST /auth/logout` | revoke refresh `jti` (Redis), clear cookies |
| `POST /auth/password/forgot` | issue reset token by email (no user enumeration) |
| `POST /auth/password/reset` | set new password via reset token; revoke sessions |
| `POST /companies/{id}/invite` | `company_admin` invites a recruiter |
| `GET /me` | current identity (from token) |

## 6. Guards (deny-by-default)

- **`get_current_user`** — decode access token (alg-pinned, `exp` + `type:"access"`
  checked) → `CurrentUser{id, role, comp_id}`; **401** if missing/invalid.
- **`require_role(*allowed)`** — closure dependency; **403** unless `role ∈ allowed`;
  denies by default.
- **Tenant scope** — handlers use `CurrentUser.comp_id` (from the token) for every
  tenant query; a client-supplied `comp_id` is never trusted.

## 7. Production-security hardening

| Concern | Approach |
|---|---|
| Brute force | Redis rate-limit on `login`/`register`/`forgot` (per-IP + per-account); **lockout after 5 failed logins → 15-min backoff** |
| User enumeration | `login` + `forgot` return uniform responses **and timing** regardless of whether the account exists |
| Password policy | min length; bcrypt + SHA-256 pre-hash (done); breached-password check optional (P2) |
| Token theft | short access TTL; refresh rotation + reuse detection; httpOnly+`Secure`+`SameSite` cookies; CSRF token |
| Revocation / logout | refresh `jti` in Redis; logout, password reset, and role change all revoke |
| Audit | every login, failed login, logout, reset, role change, invite → `audit_log` (Epic J) |
| Secrets | JWT secret + DB creds from env / secret-manager; never logged |
| Transport | HTTPS only in production (deployment) |

## 8. corelib changes this requires (library-first)

- **`TokenService`** — add `refresh_token(sub, jti)`; add `type` (`access`/`refresh`) +
  `jti` + `iat` claims to issued tokens; `decode` already verifies signature/exp.
- **New `corelib` Redis-backed session store** — active refresh `jti` allowlist + TTL,
  with revoke (single + by-user family). Small, reused by admin-service.
- **New `corelib` Redis rate-limiter** — fixed-window or token-bucket; reused by auth
  now and other endpoints later (2+ uses justify the shared boundary).
- All added **TDD-first, to the gate**, before admin-service consumes them.

## 9. Phasing

- **P1:** registration (company + candidate), email verification, login, access+refresh,
  logout/revocation, role/tenant guards, password reset, rate-limit + lockout, auth
  audit. Completes **Epic A / HANDOFF §9.1** on corelib.
- **P2:** SSO (Google/Microsoft), breached-password check, optional MFA.
- **P5:** full secret rotation, multi-region sessions, anomaly detection.

## 10. Locked decisions

1. **Access + refresh** for P1 (not access-only) — revocable sessions + real logout.
2. **Password reset in P1** — emailed token, no user enumeration.
3. **TTLs** — access **15 min**, refresh **14 days**.
4. **Lockout** — **5 failed logins → 15-min backoff** (Redis), per IP + account.

## 11. References

`ARCHITECTURE.md` §6/§9 · `ADMIN_SERVICE.md` §3–4 · `PRODUCTION_STANDARDS.md` ·
`HANDOFF.md` §9.1 · supersedes the *code* in `2026-06-16-backend-foundation-auth.md`
(endpoint contracts only remain a reference).
