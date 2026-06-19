"""gRPC AuthService route layer — a thin adapter over app/resources/auth.

Each RPC only: reads the request, calls the matching resource function, maps the
returned dict to a proto message, and maps `app.errors` domain errors to gRPC status
codes. No business logic lives here.
"""

import grpc
from lib.logging import get_logger, log_context
from lib.observability import counter, span

from app.errors import (
    AuthDomainError,
    ConflictError,
    ForbiddenError,
    InvalidCredentialsError,
    InvalidTokenError,
    InvalidTransition,
    NotFoundError,
    RateLimitedError,
    ValidationError,
)
from app.resources import auth as auth_res
from app.routes.pb import auth_pb2, auth_pb2_grpc

log = get_logger(component="auth.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)

_STATUS = {
    ConflictError: grpc.StatusCode.ALREADY_EXISTS,
    InvalidTokenError: grpc.StatusCode.INVALID_ARGUMENT,
    InvalidCredentialsError: grpc.StatusCode.UNAUTHENTICATED,
    NotFoundError: grpc.StatusCode.NOT_FOUND,
    RateLimitedError: grpc.StatusCode.RESOURCE_EXHAUSTED,
    ForbiddenError: grpc.StatusCode.PERMISSION_DENIED,
    ValidationError: grpc.StatusCode.INVALID_ARGUMENT,
    InvalidTransition: grpc.StatusCode.FAILED_PRECONDITION,
}


def _user_response(d):
    return auth_pb2.UserResponse(
        id=d["id"],
        email=d["email"],
        role=d["role"],
        comp_id=d["comp_id"] or "",
        email_verified=d["email_verified"],
    )


def _bearer_from_metadata(context):
    header = dict(context.invocation_metadata()).get("authorization", "")
    return header[7:] if header.lower().startswith("bearer ") else None


def _client_ip(context, trusted_proxy=False):
    """Caller IP for rate-limiting. The transport peer is the real client (no proxy in
    this deployment); X-Forwarded-For is attacker-controlled and only trusted when
    `trusted_proxy` is set, so a client cannot spoof the per-IP limit by forging it."""
    if trusted_proxy:
        forwarded = dict(context.invocation_metadata()).get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return context.peer()


async def caller_identity(context, tokens):
    """Shared route helper: resolve the caller's identity from access-token metadata.

    Aborts UNAUTHENTICATED when the token is absent OR invalid/expired — the latter
    so the FE transport refreshes-and-retries instead of surfacing a hard error (an
    expired access token is an auth failure, not a bad argument). The other
    InvalidTokenError uses (email-verify / password-reset links) keep INVALID_ARGUMENT.
    """
    token = _bearer_from_metadata(context)
    if token is None:
        await context.abort(grpc.StatusCode.UNAUTHENTICATED, "Not authenticated")
    try:
        return auth_res.identity_from_token(token, tokens=tokens)
    except InvalidTokenError:
        await context.abort(grpc.StatusCode.UNAUTHENTICATED, "Invalid or expired token")


class AuthServicer(auth_pb2_grpc.AuthServiceServicer):
    def __init__(
        self,
        *,
        users,
        companies,
        tokens,
        sessions,
        limiter,
        notifier,
        refresh_ttl_seconds,
        trusted_proxy=False,
        nonces=None,
        audit=None,
    ):
        self._users = users
        self._companies = companies
        self._tokens = tokens
        self._sessions = sessions
        self._limiter = limiter
        self._notifier = notifier
        self._refresh_ttl = refresh_ttl_seconds
        self._trusted_proxy = trusted_proxy
        self._nonces = nonces
        self._audit = audit

    async def _abort(self, context, exc, method="unknown"):
        code = _STATUS.get(type(exc), grpc.StatusCode.INTERNAL)
        log.warning("auth.routes.{}: {} code={}", method, exc, code.name)
        _grpc_errors.labels(method=method).inc()
        await context.abort(code, str(exc))

    async def RegisterCompany(self, request, context):
        _grpc_total.labels(method="RegisterCompany").inc()
        async with (
            log_context(log, "auth.RegisterCompany"),
            span("auth.RegisterCompany"),
        ):
            try:
                out = await auth_res.register_company(
                    request.company_name,
                    request.email,
                    request.password,
                    companies=self._companies,
                    users=self._users,
                    tokens=self._tokens,
                    notifier=self._notifier,
                    nonces=self._nonces,
                )
                return _user_response(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "RegisterCompany")

    async def RegisterCandidate(self, request, context):
        _grpc_total.labels(method="RegisterCandidate").inc()
        async with (
            log_context(log, "auth.RegisterCandidate"),
            span("auth.RegisterCandidate"),
        ):
            try:
                out = await auth_res.register_candidate(
                    request.email,
                    request.password,
                    users=self._users,
                    tokens=self._tokens,
                    notifier=self._notifier,
                    nonces=self._nonces,
                )
                return _user_response(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "RegisterCandidate")

    async def Verify(self, request, context):
        _grpc_total.labels(method="Verify").inc()
        async with log_context(log, "auth.Verify"), span("auth.Verify"):
            try:
                out = await auth_res.verify_email(
                    request.token,
                    users=self._users,
                    tokens=self._tokens,
                    nonces=self._nonces,
                )
                return _user_response(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "Verify")

    async def Login(self, request, context):
        _grpc_total.labels(method="Login").inc()
        async with log_context(log, "auth.Login"), span("auth.Login"):
            try:
                out = await auth_res.login(
                    request.email,
                    request.password,
                    ip=_client_ip(context, self._trusted_proxy),
                    users=self._users,
                    tokens=self._tokens,
                    sessions=self._sessions,
                    limiter=self._limiter,
                    refresh_ttl_seconds=self._refresh_ttl,
                    audit=self._audit,
                )
                return auth_pb2.TokenResponse(
                    access_token=out["access_token"],
                    refresh_token=out["refresh_token"],
                    token_type=out["token_type"],
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "Login")

    async def Me(self, request, context):
        # Route through caller_identity so an expired/invalid access token aborts
        # UNAUTHENTICATED (not INVALID_ARGUMENT) — Me is what the FE calls to validate
        # a session, so this is what lets the transport refresh-and-retry on expiry.
        _grpc_total.labels(method="Me").inc()
        async with log_context(log, "auth.Me"):
            ident = await caller_identity(context, self._tokens)
            return auth_pb2.IdentityResponse(
                id=ident["id"], role=ident["role"], comp_id=ident["comp_id"] or ""
            )

    async def Refresh(self, request, context):
        _grpc_total.labels(method="Refresh").inc()
        async with log_context(log, "auth.Refresh"), span("auth.Refresh"):
            try:
                out = await auth_res.refresh(
                    request.refresh_token,
                    users=self._users,
                    tokens=self._tokens,
                    sessions=self._sessions,
                    refresh_ttl_seconds=self._refresh_ttl,
                )
                return auth_pb2.TokenResponse(
                    access_token=out["access_token"],
                    refresh_token=out["refresh_token"],
                    token_type=out["token_type"],
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "Refresh")

    async def Logout(self, request, context):
        _grpc_total.labels(method="Logout").inc()
        async with log_context(log, "auth.Logout"):
            out = await auth_res.logout(
                request.refresh_token, tokens=self._tokens, sessions=self._sessions
            )
            return auth_pb2.LogoutResponse(ok=out["ok"])

    async def InviteRecruiter(self, request, context):
        _grpc_total.labels(method="InviteRecruiter").inc()
        token = _bearer_from_metadata(context)
        if token is None:
            log.warning("auth.InviteRecruiter: missing bearer token")
            _grpc_errors.labels(method="InviteRecruiter").inc()
            await context.abort(grpc.StatusCode.UNAUTHENTICATED, "Not authenticated")
        async with (
            log_context(log, "auth.InviteRecruiter"),
            span("auth.InviteRecruiter"),
        ):
            try:
                out = await auth_res.invite_recruiter(
                    token,
                    request.email,
                    request.password,
                    users=self._users,
                    tokens=self._tokens,
                    notifier=self._notifier,
                    nonces=self._nonces,
                    audit=self._audit,
                )
                return _user_response(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "InviteRecruiter")

    async def ForgotPassword(self, request, context):
        _grpc_total.labels(method="ForgotPassword").inc()
        async with log_context(log, "auth.ForgotPassword"):
            out = await auth_res.forgot_password(
                request.email,
                users=self._users,
                tokens=self._tokens,
                notifier=self._notifier,
                nonces=self._nonces,
            )
            return auth_pb2.OkResponse(ok=out["ok"])

    async def ResetPassword(self, request, context):
        _grpc_total.labels(method="ResetPassword").inc()
        async with log_context(log, "auth.ResetPassword"), span("auth.ResetPassword"):
            try:
                out = await auth_res.reset_password(
                    request.token,
                    request.new_password,
                    users=self._users,
                    tokens=self._tokens,
                    sessions=self._sessions,
                    nonces=self._nonces,
                    audit=self._audit,
                )
                return auth_pb2.OkResponse(ok=out["ok"])
            except AuthDomainError as exc:
                await self._abort(context, exc, "ResetPassword")
