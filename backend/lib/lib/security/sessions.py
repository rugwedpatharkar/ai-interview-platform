from datetime import UTC, datetime

from redis.asyncio import Redis

from lib.logging import get_logger
from lib.resilience import with_timeout

log = get_logger(component="security.sessions")

_DEFAULT_TIMEOUT_S = 5.0

# Revoke every refresh jti for a user in ONE atomic server-side step. A plain
# smembers-then-delete loop has a TOCTOU window: a concurrent allow() could add a jti
# after the read, leaving its key alive but untracked. Lua runs without interleaving, so
# revoke-all stays airtight (breach response, password reset, refresh-reuse detection).
_REVOKE_USER_LUA = """
local jtis = redis.call('SMEMBERS', KEYS[1])
for _, jti in ipairs(jtis) do
    redis.call('DEL', ARGV[1] .. jti)
end
redis.call('DEL', KEYS[1])
return #jtis
"""


class RefreshSessionStore:
    """Redis-backed allowlist of active refresh-token jtis, for rotation +
    revocation. Access tokens stay stateless; only refresh sessions are tracked here
    so logout / password-reset / reuse-detection can revoke them.

    Boundary logging: allow/revoke/is_active failures are logged with the jti
    (non-sensitive) but never with the token value.
    """

    def __init__(
        self,
        redis: Redis,
        namespace: str = "refresh",
        timeout_s: float = _DEFAULT_TIMEOUT_S,
    ) -> None:
        self._r = redis
        self._ns = namespace
        self._timeout_s = timeout_s

    def _jti_key(self, jti: str) -> str:
        return f"{self._ns}:jti:{jti}"

    def _user_key(self, user_id: str) -> str:
        return f"{self._ns}:user:{user_id}"

    def _meta_key(self, jti: str) -> str:
        return f"{self._ns}:meta:{jti}"

    async def allow(
        self,
        user_id: str,
        jti: str,
        ttl_seconds: int,
        *,
        ip: str = "",
        user_agent: str = "",
    ) -> None:
        try:
            await with_timeout(
                self._r.set(self._jti_key(jti), user_id, ex=ttl_seconds),
                self._timeout_s,
                op="sessions.allow.set",
            )
            await with_timeout(
                self._r.sadd(self._user_key(user_id), jti),
                self._timeout_s,
                op="sessions.allow.sadd",
            )
            await with_timeout(
                self._r.expire(self._user_key(user_id), ttl_seconds),
                self._timeout_s,
                op="sessions.allow.expire",
            )
            # Per-jti display metadata for the sessions list (ip/ua, when it started).
            # Shares the jti TTL; not listed once revoke() srem's the jti from the set.
            now = datetime.now(UTC).isoformat()
            await with_timeout(
                self._r.hset(
                    self._meta_key(jti),
                    mapping={
                        "ip": ip,
                        "user_agent": user_agent,
                        "created_at": now,
                        "last_seen": now,
                    },
                ),
                self._timeout_s,
                op="sessions.allow.meta",
            )
            await with_timeout(
                self._r.expire(self._meta_key(jti), ttl_seconds),
                self._timeout_s,
                op="sessions.allow.meta_expire",
            )
        except Exception:
            log.error("sessions.allow_failed jti={} user_id={}", jti, user_id)
            raise

    async def is_active(self, jti: str) -> bool:
        return bool(
            await with_timeout(
                self._r.exists(self._jti_key(jti)),
                self._timeout_s,
                op="sessions.is_active",
            )
        )

    async def revoke(self, jti: str) -> None:
        try:
            user_id = await with_timeout(
                self._r.get(self._jti_key(jti)),
                self._timeout_s,
                op="sessions.revoke.get",
            )
            await with_timeout(
                self._r.delete(self._jti_key(jti)),
                self._timeout_s,
                op="sessions.revoke.delete",
            )
            if user_id is not None:
                await with_timeout(
                    self._r.srem(self._user_key(user_id), jti),
                    self._timeout_s,
                    op="sessions.revoke.srem",
                )
        except Exception:
            log.error("sessions.revoke_failed jti={}", jti)
            raise

    async def revoke_user(self, user_id: str) -> None:
        try:
            await with_timeout(
                self._r.eval(
                    _REVOKE_USER_LUA, 1, self._user_key(user_id), f"{self._ns}:jti:"
                ),
                self._timeout_s,
                op="sessions.revoke_user",
            )
        except Exception:
            log.error("sessions.revoke_user_failed user_id={}", user_id)
            raise

    async def list_for_user(self, user_id: str) -> list[dict]:
        """Active refresh sessions for a user: [{jti, meta}], most-recent set members.

        The user set is the source of truth; a still-active jti (key not yet expired) is
        included with its meta hash. Stale set entries whose jti key has expired are
        skipped, so the list never shows a revoked/expired session.
        """
        jtis = await with_timeout(
            self._r.smembers(self._user_key(user_id)),
            self._timeout_s,
            op="sessions.list.smembers",
        )
        out = []
        for jti in jtis:
            if not await self.is_active(jti):
                continue
            meta = await with_timeout(
                self._r.hgetall(self._meta_key(jti)),
                self._timeout_s,
                op="sessions.list.hgetall",
            )
            out.append({"jti": jti, "meta": dict(meta)})
        return out

    async def revoke_all_except(self, user_id: str, current_jti: str) -> None:
        """Revoke every refresh jti for the user except `current_jti` (keep-this-device
        logout — password change / 'log out everywhere else')."""
        jtis = await with_timeout(
            self._r.smembers(self._user_key(user_id)),
            self._timeout_s,
            op="sessions.revoke_others.smembers",
        )
        for jti in jtis:
            if jti != current_jti:
                await self.revoke(jti)


class SingleUseTokenStore:
    """One-time nonces for email-verify / password-reset tokens. `allow` registers a
    jti with a TTL; `consume` returns True exactly once (the jti is deleted), so a
    captured link cannot be replayed within its validity window.
    """

    def __init__(
        self,
        redis: Redis,
        namespace: str = "onetime",
        timeout_s: float = _DEFAULT_TIMEOUT_S,
    ) -> None:
        self._r = redis
        self._ns = namespace
        self._timeout_s = timeout_s

    def _key(self, jti: str) -> str:
        return f"{self._ns}:{jti}"

    async def allow(self, jti: str, ttl_seconds: int) -> None:
        await with_timeout(
            self._r.set(self._key(jti), "1", ex=ttl_seconds),
            self._timeout_s,
            op="onetime.allow",
        )

    async def consume(self, jti: str) -> bool:
        # DELETE is atomic: exactly one concurrent caller sees the key removed.
        result = bool(
            await with_timeout(
                self._r.delete(self._key(jti)),
                self._timeout_s,
                op="onetime.consume",
            )
        )
        if not result:
            log.warning("sessions.consume_failed_or_replayed jti={}", jti)
        return result
