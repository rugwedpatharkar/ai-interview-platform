# Auth Foundations (`corelib`) — Design Spec

> The three shared-library primitives that company/candidate logins are built on: an
> extended `TokenService` (access + refresh, `type`/`jti`/`iat`), a Redis-backed
> `RefreshSessionStore` (rotation + revocation), and a Redis `RateLimiter` (brute-force
> + lockout). Built to `PRODUCTION_STANDARDS.md`, implementing the locked decisions in
> `AUTH.md` §4/§7/§8. Approved 2026-06-17. Local-only — no git commit.

## 1. Goal & scope

Add the library primitives admin-service needs for production logins. **In scope:** the
`TokenService` extension, `RefreshSessionStore`, `RateLimiter`, and the auth TTL
settings. **Out of scope:** admin-service auth routes/guards (HANDOFF §9.1, a separate
plan) and password-reset *tokens* (added when the reset endpoint is built).

## 2. Locked decisions (from AUTH.md)

- Access + refresh; **access 15 min**, **refresh 14 days** (20160 min).
- Rotation + reuse-detection; revoke **single** (logout) and **by-user** (reset / role change).
- **Lockout 5 fails → 15 min**; **fixed-window** rate limiting.
- **`jti` caller-generated** (`uuid4`) — `TokenService` stays pure (no randomness, no I/O).
- **`type` claim** (`"access"`/`"refresh"`) so a refresh token can't be replayed as access.

## 3. Components

- Modify: `corelib/security/tokens.py` (`TokenService`).
- Modify: `corelib/config.py` (auth TTL settings).
- Create: `corelib/security/sessions.py` (`RefreshSessionStore`) + export from `corelib.security`.
- Create: `corelib/redis/ratelimit.py` (`RateLimiter`, `RateLimitResult`) + export from `corelib.redis`.
- Tests: extend `tests/test_security.py` (tokens) + `tests/test_config.py` (settings); new `tests/test_sessions.py`, `tests/test_ratelimit.py`.

## 4. Config additions (`BaseServiceSettings`)

- Change `access_token_minutes` default **60 → 15**.
- Add `refresh_token_minutes: int = 20160` (14 days).

## 5. API

### 5.1 `TokenService` — `corelib/security/tokens.py`

- `__init__(secret, algorithm="HS256", access_minutes=15, refresh_minutes=20160, verification_minutes=1440)`.
- Every issued token includes `iat`.
- `access_token(sub, role, comp_id, jti) -> str` — claims `sub, role, comp_id, jti, type="access", iat, exp`.
- `refresh_token(sub, jti) -> str` — claims `sub, jti, type="refresh", iat, exp`.
- `verification_token(sub) -> str` — unchanged claims (`sub, purpose="email_verify"`) plus `iat`.
- `decode(token, expected_type=None) -> dict` — verify signature/exp; if `expected_type` is given and `claims.get("type") != expected_type`, raise `jose.JWTError`.

### 5.2 `RefreshSessionStore` — `corelib/security/sessions.py`

Redis-backed (inject `redis.asyncio.Redis`); keys namespaced (default `"refresh"`).

| Method | Behavior |
|---|---|
| `allow(user_id, jti, ttl_seconds)` | `SET {ns}:jti:{jti}=user_id EX ttl`; `SADD {ns}:user:{user_id} jti`; `EXPIRE {ns}:user:{user_id} ttl` |
| `is_active(jti) -> bool` | `EXISTS {ns}:jti:{jti}` |
| `revoke(jti)` | read user_id; `DEL {ns}:jti:{jti}`; `SREM {ns}:user:{user_id} jti` |
| `revoke_user(user_id)` | `SMEMBERS {ns}:user:{user_id}`; `DEL` each jti key; `DEL {ns}:user:{user_id}` |

### 5.3 `RateLimiter` — `corelib/redis/ratelimit.py`

- `RateLimitResult(allowed: bool, retry_after: int)` (frozen dataclass; `retry_after` = 0 when allowed).
- `RateLimiter(redis, namespace="rl")`.
- `hit(key, limit, window_seconds) -> RateLimitResult` — `count = INCR {ns}:{key}`; if `count == 1` then `EXPIRE {ns}:{key} window_seconds`; `allowed = count <= limit`; `retry_after = TTL({ns}:{key})` when blocked else 0.

## 6. Data flow (how admin-service will use these — context, not in scope)

- **Login:** `RateLimiter.hit(f"login:{ip}", 5, 900)` (+ per-account); on success, issue access + refresh with a fresh `uuid4().hex` jti and `RefreshSessionStore.allow(user_id, jti, refresh_ttl)`.
- **Refresh:** `decode(token, expected_type="refresh")`; if not `is_active(jti)` → reuse → `revoke_user` + 401; else `allow(new_jti)` + `revoke(old_jti)`.
- **Logout:** `revoke(jti)`. **Password reset / role change:** `revoke_user(user_id)`.

## 7. Error handling & robustness

- `decode` raises `JWTError` on bad signature/exp/type-mismatch (admin maps to 401).
- Redis ops are awaited; transient Redis errors propagate to the admin boundary (no defensive bloat in the lib).
- `TokenService` has **no I/O and no randomness** (jti injected) — fully deterministic and unit-testable.
- No secrets logged; `jti` is opaque.

## 8. Testing (TDD)

Unit (no real infra — hand `FakeRedis` stand-ins mirroring the existing `FakeRedis`/`FakeCollection` pattern, extended with the ops each piece uses; no real TTL needed for logic tests):

- **TokenService** (extend `test_security.py`): access carries `type="access"`/`jti`/`iat`; refresh carries `type="refresh"`; `decode(t, expected_type="access")` rejects a refresh token (raises `JWTError`); a valid access decodes with `expected_type="access"`. The existing `access_token` test is updated for the new required `jti` parameter.
- **RefreshSessionStore** (`test_sessions.py`; FakeRedis with `set/get/delete/exists/sadd/smembers/srem/expire`): `allow` → `is_active` True; `revoke` → `is_active` False; `revoke_user` kills every jti in the family.
- **RateLimiter** (`test_ratelimit.py`; FakeRedis with `incr/expire/ttl`): hits 1..limit allowed; hit limit+1 blocked with `retry_after > 0`; first hit sets the window expiry.
- **Settings** (extend `test_config.py`): `access_token_minutes == 15`, `refresh_token_minutes == 20160`.

Integration (later, real Redis): TTL expiry + `INCR` atomicity.

## 9. Acceptance criteria

- All unit tests green; `bash scripts/check.sh` passes.
- A refresh token **cannot** decode as access (`type` enforced).
- A revoked or rotated `jti` is not active; `revoke_user` kills the whole family.
- The rate limiter blocks the `(limit + 1)`th hit within the window and reports `retry_after`.

## 10. References

`AUTH.md` §4/§7/§8 · `PRODUCTION_STANDARDS.md` · corelib `security`/`redis` modules · security memory (tenant isolation, secrets from env).
