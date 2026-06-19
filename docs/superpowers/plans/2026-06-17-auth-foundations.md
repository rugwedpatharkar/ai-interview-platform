# Auth Foundations (`corelib`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the corelib primitives for production logins — JWT access+refresh with `type`/`jti`/`iat`, a Redis refresh-session store (rotation + revocation), and a Redis fixed-window rate limiter.

**Architecture:** Extend the pure `TokenService` (no I/O, caller-supplied `jti`); add two Redis-backed classes (`RefreshSessionStore`, `RateLimiter`) that take an injected `redis.asyncio.Redis`. Unit-tested with hand `FakeRedis` stand-ins (mirroring the existing `FakeRedis`/`FakeCollection`/`FakeMessage`); real-Redis TTL/atomicity left to integration later.

**Tech Stack:** Python 3.12, python-jose (JWT), redis.asyncio, pytest + pytest-asyncio.

**Spec:** `docs/superpowers/specs/2026-06-17-auth-foundations-design.md`.

## Global Constraints

- Python 3.12, async, Pydantic v2; mirror corelib patterns (fake-injection tests; lifecycle/DI like `Cache`).
- Production bar (`PRODUCTION_STANDARDS.md`): secrets from env, validate at boundaries, no defensive bloat in internals.
- Locked: access **15 min**, refresh **20160 min** (14 days); `jti` caller-generated; `type` claim (`access`/`refresh`); lockout 5→15 min; fixed-window limiting.
- **No git — local-only project.** No commit steps; "verify green" = run the gate. Do NOT run any `git`/`gh` command.
- Gate: `bash scripts/check.sh` must stay green. Run corelib tests from `libs/corelib`: `../../.venv/bin/python -m pytest -q`.

---

### Task 1: Auth TTL settings

**Files:**
- Modify: `libs/corelib/corelib/config.py`
- Test: `libs/corelib/tests/test_config.py`

**Interfaces:**
- Produces: `BaseServiceSettings.access_token_minutes` (now default 15), `BaseServiceSettings.refresh_token_minutes` (default 20160).

- [ ] **Step 1: Write the failing test**

Append to `libs/corelib/tests/test_config.py`:
```python
def test_auth_token_ttls():
    s = BaseServiceSettings()
    assert s.access_token_minutes == 15
    assert s.refresh_token_minutes == 20160
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest tests/test_config.py::test_auth_token_ttls -q`
Expected: FAIL (`assert 60 == 15`, then `AttributeError` for `refresh_token_minutes`).

- [ ] **Step 3: Update the settings**

In `libs/corelib/corelib/config.py`, change the access line and add the refresh line:
```python
    access_token_minutes: int = 15
    refresh_token_minutes: int = 20160
    email_verification_minutes: int = 1440
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest tests/test_config.py -q`
Expected: PASS.

- [ ] **Step 5: Verify green**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest -q`
Expected: PASS (all tests).

---

### Task 2: `TokenService` — access+refresh, `type`/`jti`/`iat`, type-checked `decode`

**Files:**
- Modify (replace): `libs/corelib/corelib/security/tokens.py`
- Test: `libs/corelib/tests/test_security.py`

**Interfaces:**
- Produces: `TokenService(secret, algorithm="HS256", access_minutes=15, refresh_minutes=20160, verification_minutes=1440)`; `access_token(sub, role, comp_id, jti) -> str`; `refresh_token(sub, jti) -> str`; `verification_token(sub) -> str`; `decode(token, expected_type=None) -> dict` (raises `jose.JWTError` on type mismatch).

- [ ] **Step 1: Update the existing test + write the new failing tests**

In `libs/corelib/tests/test_security.py`, change the import line:
```python
from jose import JWTError

from corelib.security import TokenService, hash_password, verify_password
```

Replace `test_access_token_claims` with:
```python
def test_access_token_claims():
    svc = TokenService(SECRET)
    claims = svc.decode(
        svc.access_token(sub="u1", role="recruiter", comp_id="c1", jti="j1")
    )
    assert claims["sub"] == "u1"
    assert claims["role"] == "recruiter"
    assert claims["comp_id"] == "c1"
    assert claims["jti"] == "j1"
    assert claims["type"] == "access"
```

Append:
```python
def test_refresh_token_type():
    svc = TokenService(SECRET)
    claims = svc.decode(svc.refresh_token(sub="u1", jti="r1"), expected_type="refresh")
    assert claims["type"] == "refresh"
    assert claims["jti"] == "r1"


def test_decode_rejects_wrong_type():
    svc = TokenService(SECRET)
    access = svc.access_token(sub="u1", role="recruiter", comp_id="c1", jti="j1")
    with pytest.raises(JWTError):
        svc.decode(access, expected_type="refresh")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest tests/test_security.py -q`
Expected: FAIL (`access_token()` missing `jti`; `refresh_token`/`expected_type` not defined).

- [ ] **Step 3: Replace `tokens.py`**

Replace `libs/corelib/corelib/security/tokens.py` with:
```python
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt


class TokenService:
    """Issues and verifies JWTs. Configured with the secret once, not via globals,
    so any service (admin issues; ai-agents/mcp verify) can use it consistently.

    Access and refresh tokens carry a `type` claim so a refresh token cannot be
    replayed as an access token, and a caller-supplied `jti` so refresh sessions are
    revocable via a separate store. The service is pure — no I/O, no randomness.
    """

    def __init__(
        self,
        secret: str,
        algorithm: str = "HS256",
        access_minutes: int = 15,
        refresh_minutes: int = 20160,
        verification_minutes: int = 1440,
    ) -> None:
        if not secret:
            raise ValueError("TokenService requires a non-empty secret")
        self._secret = secret
        self._alg = algorithm
        self._access_minutes = access_minutes
        self._refresh_minutes = refresh_minutes
        self._verification_minutes = verification_minutes

    def _encode(self, claims: dict, minutes: int) -> str:
        now = datetime.now(UTC)
        return jwt.encode(
            {**claims, "iat": now, "exp": now + timedelta(minutes=minutes)},
            self._secret,
            algorithm=self._alg,
        )

    def access_token(self, sub: str, role: str, comp_id: str | None, jti: str) -> str:
        return self._encode(
            {"sub": sub, "role": role, "comp_id": comp_id, "jti": jti, "type": "access"},
            self._access_minutes,
        )

    def refresh_token(self, sub: str, jti: str) -> str:
        return self._encode(
            {"sub": sub, "jti": jti, "type": "refresh"}, self._refresh_minutes
        )

    def verification_token(self, sub: str) -> str:
        return self._encode(
            {"sub": sub, "purpose": "email_verify"}, self._verification_minutes
        )

    def decode(self, token: str, expected_type: str | None = None) -> dict:
        claims = jwt.decode(token, self._secret, algorithms=[self._alg])
        if expected_type is not None and claims.get("type") != expected_type:
            raise JWTError(f"expected token type {expected_type!r}")
        return claims
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest tests/test_security.py -q`
Expected: PASS.

- [ ] **Step 5: Verify green**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest -q`
Expected: PASS (all tests).

---

### Task 3: `RefreshSessionStore` (Redis allowlist + revocation)

**Files:**
- Create: `libs/corelib/corelib/security/sessions.py`
- Modify (replace): `libs/corelib/corelib/security/__init__.py`
- Test: `libs/corelib/tests/test_sessions.py`

**Interfaces:**
- Consumes: `redis.asyncio.Redis`.
- Produces: `RefreshSessionStore(redis, namespace="refresh")`; `async allow(user_id, jti, ttl_seconds)`; `async is_active(jti) -> bool`; `async revoke(jti)`; `async revoke_user(user_id)`. Exported from `corelib.security`.

- [ ] **Step 1: Write the failing tests**

Create `libs/corelib/tests/test_sessions.py`:
```python
import pytest

from corelib.security import RefreshSessionStore


class FakeRedis:
    """Async stand-in for redis.asyncio.Redis (the ops RefreshSessionStore uses)."""

    def __init__(self):
        self.kv: dict[str, str] = {}
        self.sets: dict[str, set] = {}

    async def set(self, key, value, ex=None):
        self.kv[key] = value

    async def get(self, key):
        return self.kv.get(key)

    async def delete(self, key):
        self.kv.pop(key, None)
        self.sets.pop(key, None)

    async def exists(self, key):
        return 1 if key in self.kv else 0

    async def sadd(self, key, *members):
        self.sets.setdefault(key, set()).update(members)

    async def smembers(self, key):
        return set(self.sets.get(key, set()))

    async def srem(self, key, *members):
        self.sets.get(key, set()).difference_update(members)

    async def expire(self, key, seconds):
        pass


@pytest.mark.asyncio
async def test_allow_then_active():
    store = RefreshSessionStore(FakeRedis())
    await store.allow("u1", "jti1", 100)
    assert await store.is_active("jti1") is True
    assert await store.is_active("nope") is False


@pytest.mark.asyncio
async def test_revoke_single():
    store = RefreshSessionStore(FakeRedis())
    await store.allow("u1", "jti1", 100)
    await store.revoke("jti1")
    assert await store.is_active("jti1") is False


@pytest.mark.asyncio
async def test_revoke_user_kills_family():
    store = RefreshSessionStore(FakeRedis())
    await store.allow("u1", "jti1", 100)
    await store.allow("u1", "jti2", 100)
    await store.revoke_user("u1")
    assert await store.is_active("jti1") is False
    assert await store.is_active("jti2") is False
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest tests/test_sessions.py -q`
Expected: FAIL (`ImportError: cannot import name 'RefreshSessionStore'`).

- [ ] **Step 3: Write `sessions.py` and export it**

Create `libs/corelib/corelib/security/sessions.py`:
```python
from redis.asyncio import Redis


class RefreshSessionStore:
    """Redis-backed allowlist of active refresh-token jtis, for rotation +
    revocation. Access tokens stay stateless; only refresh sessions are tracked here
    so logout / password-reset / reuse-detection can revoke them.
    """

    def __init__(self, redis: Redis, namespace: str = "refresh") -> None:
        self._r = redis
        self._ns = namespace

    def _jti_key(self, jti: str) -> str:
        return f"{self._ns}:jti:{jti}"

    def _user_key(self, user_id: str) -> str:
        return f"{self._ns}:user:{user_id}"

    async def allow(self, user_id: str, jti: str, ttl_seconds: int) -> None:
        await self._r.set(self._jti_key(jti), user_id, ex=ttl_seconds)
        await self._r.sadd(self._user_key(user_id), jti)
        await self._r.expire(self._user_key(user_id), ttl_seconds)

    async def is_active(self, jti: str) -> bool:
        return bool(await self._r.exists(self._jti_key(jti)))

    async def revoke(self, jti: str) -> None:
        user_id = await self._r.get(self._jti_key(jti))
        await self._r.delete(self._jti_key(jti))
        if user_id is not None:
            await self._r.srem(self._user_key(user_id), jti)

    async def revoke_user(self, user_id: str) -> None:
        for jti in await self._r.smembers(self._user_key(user_id)):
            await self._r.delete(self._jti_key(jti))
        await self._r.delete(self._user_key(user_id))
```

Replace `libs/corelib/corelib/security/__init__.py`:
```python
from corelib.security.passwords import hash_password, verify_password
from corelib.security.sessions import RefreshSessionStore
from corelib.security.tokens import TokenService

__all__ = ["RefreshSessionStore", "TokenService", "hash_password", "verify_password"]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest tests/test_sessions.py -q`
Expected: PASS.

- [ ] **Step 5: Verify green**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest -q`
Expected: PASS (all tests).

---

### Task 4: `RateLimiter` (Redis fixed-window)

**Files:**
- Create: `libs/corelib/corelib/redis/ratelimit.py`
- Modify (replace): `libs/corelib/corelib/redis/__init__.py`
- Test: `libs/corelib/tests/test_ratelimit.py`

**Interfaces:**
- Consumes: `redis.asyncio.Redis`.
- Produces: `RateLimitResult(allowed: bool, retry_after: int)`; `RateLimiter(redis, namespace="rl")`; `async hit(key, limit, window_seconds) -> RateLimitResult`. Exported from `corelib.redis`.

- [ ] **Step 1: Write the failing tests**

Create `libs/corelib/tests/test_ratelimit.py`:
```python
import pytest

from corelib.redis import RateLimiter


class FakeRedis:
    """Async stand-in for redis.asyncio.Redis (the ops RateLimiter uses)."""

    def __init__(self):
        self.counts: dict[str, int] = {}
        self.ttls: dict[str, int] = {}

    async def incr(self, key):
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]

    async def expire(self, key, seconds):
        self.ttls[key] = seconds

    async def ttl(self, key):
        return self.ttls.get(key, -1)


@pytest.mark.asyncio
async def test_within_limit_allowed():
    rl = RateLimiter(FakeRedis())
    for _ in range(5):
        result = await rl.hit("login:ip", 5, 900)
        assert result.allowed is True
        assert result.retry_after == 0


@pytest.mark.asyncio
async def test_over_limit_blocked_with_retry_after():
    rl = RateLimiter(FakeRedis())
    for _ in range(5):
        await rl.hit("login:ip", 5, 900)
    result = await rl.hit("login:ip", 5, 900)  # 6th hit
    assert result.allowed is False
    assert result.retry_after == 900


@pytest.mark.asyncio
async def test_first_hit_sets_window():
    fake = FakeRedis()
    rl = RateLimiter(fake)
    await rl.hit("k", 5, 120)
    assert fake.ttls["rl:k"] == 120
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest tests/test_ratelimit.py -q`
Expected: FAIL (`ImportError: cannot import name 'RateLimiter'`).

- [ ] **Step 3: Write `ratelimit.py` and export it**

Create `libs/corelib/corelib/redis/ratelimit.py`:
```python
from dataclasses import dataclass

from redis.asyncio import Redis


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    retry_after: int  # seconds until the window resets; 0 when allowed


class RateLimiter:
    """Fixed-window rate limiter over Redis: counts hits per key within a window and
    blocks once the count exceeds `limit`. Powers login/register/forgot limits and the
    failed-login lockout.
    """

    def __init__(self, redis: Redis, namespace: str = "rl") -> None:
        self._r = redis
        self._ns = namespace

    async def hit(self, key: str, limit: int, window_seconds: int) -> RateLimitResult:
        redis_key = f"{self._ns}:{key}"
        count = await self._r.incr(redis_key)
        if count == 1:
            await self._r.expire(redis_key, window_seconds)
        if count <= limit:
            return RateLimitResult(allowed=True, retry_after=0)
        ttl = await self._r.ttl(redis_key)
        return RateLimitResult(allowed=False, retry_after=max(ttl, 0))
```

Replace `libs/corelib/corelib/redis/__init__.py`:
```python
from corelib.redis.cache import Cache
from corelib.redis.client import create_redis
from corelib.redis.ratelimit import RateLimiter, RateLimitResult

__all__ = ["Cache", "RateLimiter", "RateLimitResult", "create_redis"]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest tests/test_ratelimit.py -q`
Expected: PASS.

- [ ] **Step 5: Verify the whole gate is green**

Run: `bash scripts/check.sh`
Expected: `==> GATE PASSED` (ruff format + lint incl. `S`/`ASYNC`, pip-audit, corelib pytest).

---

## Verification (whole plan)

- [ ] `bash scripts/check.sh` → GATE PASSED.
- [ ] `corelib.security` exports `TokenService` + `RefreshSessionStore`; `corelib.redis` exports `RateLimiter` + `RateLimitResult`.
- [ ] A refresh token fails `decode(..., expected_type="access")`; `revoke_user` clears the whole family; the 6th hit in a 5-limit window is blocked with `retry_after > 0`.
- [ ] `access_token_minutes == 15`, `refresh_token_minutes == 20160`.

## Notes for the consumer (admin-service, HANDOFF §9.1)

- Login (after credential check): `jti = uuid4().hex`; issue `access_token(sub, role, comp_id, jti_a)` + `refresh_token(sub, jti)`; `RefreshSessionStore.allow(user_id, jti, refresh_ttl)`; rate-limit via `RateLimiter.hit(f"login:{ip}", 5, 900)`.
- Refresh: `decode(token, expected_type="refresh")`; if not `is_active(jti)` → `revoke_user` + 401; else `allow(new)` + `revoke(old)`.
- Logout: `revoke(jti)`. Password reset / role change: `revoke_user(user_id)`.
