from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt

from lib.logging import get_logger

log = get_logger(component="security.tokens")

# Bind every token to this service mesh so a JWT minted for another audience/issuer
# (even with the same secret) is rejected.
_ISSUER = "admin"
_AUDIENCE = "interview-platform"


class TokenService:
    """Issues and verifies JWTs. Configured with the secret once, not via globals,
    so any service (admin issues; ai-agents/mcp verify) can use it consistently.

    Access and refresh tokens carry a `type` claim so a refresh token cannot be
    replayed as an access token, and a caller-supplied `jti` so refresh sessions are
    revocable via a separate store. Verify/reset tokens accept an optional `jti` so the
    caller can register them in a single-use store. The service is pure — no I/O, no
    randomness.

    Boundary logging: verify failures are logged with context (sub, error type) but
    never with the token value.
    """

    def __init__(
        self,
        secret: str,
        algorithm: str = "HS256",
        access_minutes: int = 15,
        refresh_minutes: int = 20160,
        verification_minutes: int = 1440,
        reset_minutes: int = 60,
        mfa_minutes: int = 5,
    ) -> None:
        if not secret:
            raise ValueError("TokenService requires a non-empty secret")
        self._secret = secret
        self._alg = algorithm
        self._access_minutes = access_minutes
        self._refresh_minutes = refresh_minutes
        self._verification_minutes = verification_minutes
        self._reset_minutes = reset_minutes
        self._mfa_minutes = mfa_minutes

    def _encode(self, claims: dict, minutes: int) -> str:
        now = datetime.now(UTC)
        return jwt.encode(
            {
                **claims,
                "iat": now,
                "exp": now + timedelta(minutes=minutes),
                "iss": _ISSUER,
                "aud": _AUDIENCE,
            },
            self._secret,
            algorithm=self._alg,
        )

    def access_token(
        self, sub: str, role: str, comp_id: str | None, jti: str, sid: str | None = None
    ) -> str:
        # `sid` binds the access token to its refresh-session jti so settings can show
        # "this device" + keep-current on revoke. Additive: included only when supplied.
        claims = {
            "sub": sub,
            "role": role,
            "comp_id": comp_id,
            "jti": jti,
            "type": "access",
        }
        if sid is not None:
            claims["sid"] = sid
        return self._encode(claims, self._access_minutes)

    def refresh_token(self, sub: str, jti: str) -> str:
        return self._encode(
            {"sub": sub, "jti": jti, "type": "refresh"}, self._refresh_minutes
        )

    def verification_token(self, sub: str, jti: str | None = None) -> str:
        claims = {"sub": sub, "purpose": "email_verify"}
        if jti is not None:
            claims["jti"] = jti
        return self._encode(claims, self._verification_minutes)

    def reset_token(self, sub: str, jti: str | None = None) -> str:
        claims = {"sub": sub, "purpose": "password_reset"}
        if jti is not None:
            claims["jti"] = jti
        return self._encode(claims, self._reset_minutes)

    def mfa_token(self, sub: str, jti: str) -> str:
        # Short-lived single-use challenge between Login (2FA required) and
        # VerifyTotpLogin. Carries no role/comp_id — it is not an access token.
        return self._encode(
            {"sub": sub, "jti": jti, "purpose": "mfa"}, self._mfa_minutes
        )

    def decode(self, token: str, expected_type: str | None = None) -> dict:
        try:
            claims = jwt.decode(
                token,
                self._secret,
                algorithms=[self._alg],
                audience=_AUDIENCE,
                issuer=_ISSUER,
            )
        except JWTError as exc:
            # Log the failure with context but never the token value.
            log.warning(
                "token.verify_failed expected_type={} error={}",
                expected_type,
                type(exc).__name__,
            )
            raise

        if expected_type is not None and claims.get("type") != expected_type:
            log.warning(
                "token.type_mismatch expected={} got={} sub={}",
                expected_type,
                claims.get("type"),
                claims.get("sub"),
            )
            raise JWTError(f"expected token type {expected_type!r}")
        return claims
