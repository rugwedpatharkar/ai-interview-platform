"""gRPC SettingsService — self-scoped account settings over resources/settings.

The caller is the token (caller_identity -> identity["id"]); no request carries a target
user_id. This slice serves notification preferences.
"""

import grpc
from lib.logging import get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import settings as settings_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import settings_pb2, settings_pb2_grpc

log = get_logger(component="settings.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


def _prefs_proto(d):
    msg = settings_pb2.NotificationPrefs(
        sms_critical=d["sms_critical"], digest=d["digest"]
    )
    for key, enabled in d["email_categories"].items():
        msg.email_categories[key] = enabled
    if d["quiet_hours"] is not None:
        qh = d["quiet_hours"]
        msg.quiet_hours.start = qh["start"]
        msg.quiet_hours.end = qh["end"]
        msg.quiet_hours.tz = qh["tz"]
    return msg


class SettingsServicer(settings_pb2_grpc.SettingsServiceServicer):
    def __init__(
        self,
        *,
        prefs,
        tokens,
        users=None,
        totp=None,
        secretbox=None,
        sessions=None,
        limiter=None,
        nonces=None,
        notifier=None,
        audit=None,
    ):
        self._prefs = prefs
        self._tokens = tokens
        self._users = users
        self._totp = totp
        self._secretbox = secretbox
        self._sessions = sessions
        self._limiter = limiter
        self._nonces = nonces
        self._notifier = notifier
        self._audit = audit

    async def _abort(self, context, exc, method):
        code = _STATUS.get(type(exc), grpc.StatusCode.INTERNAL)
        log.warning("settings.routes.{}: {} code={}", method, exc, code.name)
        _grpc_errors.labels(method=method).inc()
        await context.abort(code, str(exc))

    async def GetNotificationPrefs(self, request, context):
        _grpc_total.labels(method="GetNotificationPrefs").inc()
        ident = await caller_identity(context, self._tokens)
        async with log_context(log, "settings.GetPrefs"), span("settings.GetPrefs"):
            out = await settings_res.get_notification_prefs(
                ident["id"], prefs=self._prefs
            )
            return _prefs_proto(out)

    async def SetNotificationPrefs(self, request, context):
        _grpc_total.labels(method="SetNotificationPrefs").inc()
        ident = await caller_identity(context, self._tokens)
        async with log_context(log, "settings.SetPrefs"), span("settings.SetPrefs"):
            payload = {
                "email_categories": dict(request.email_categories),
                "sms_critical": request.sms_critical,
                "digest": request.digest,
                "quiet_hours": (
                    {
                        "start": request.quiet_hours.start,
                        "end": request.quiet_hours.end,
                        "tz": request.quiet_hours.tz,
                    }
                    if request.HasField("quiet_hours")
                    else None
                ),
            }
            try:
                out = await settings_res.set_notification_prefs(
                    ident["id"], payload, prefs=self._prefs
                )
                return _prefs_proto(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "SetNotificationPrefs")

    async def SetupTotp(self, request, context):
        _grpc_total.labels(method="SetupTotp").inc()
        ident = await caller_identity(context, self._tokens)
        async with log_context(log, "settings.SetupTotp"):
            out = await settings_res.setup_totp(
                ident["id"],
                users=self._users,
                totp=self._totp,
                secretbox=self._secretbox,
            )
            return settings_pb2.SetupTotpResponse(
                provisioning_uri=out["provisioning_uri"], secret=out["secret"]
            )

    async def VerifyTotp(self, request, context):
        _grpc_total.labels(method="VerifyTotp").inc()
        ident = await caller_identity(context, self._tokens)
        async with log_context(log, "settings.VerifyTotp"):
            try:
                out = await settings_res.verify_totp(
                    ident["id"],
                    request.code,
                    users=self._users,
                    totp=self._totp,
                    secretbox=self._secretbox,
                )
                return settings_pb2.VerifyTotpResponse(
                    enabled=out["enabled"], recovery_codes=out["recovery_codes"]
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "VerifyTotp")

    async def DisableTotp(self, request, context):
        _grpc_total.labels(method="DisableTotp").inc()
        ident = await caller_identity(context, self._tokens)
        async with log_context(log, "settings.DisableTotp"):
            try:
                await settings_res.disable_totp(
                    ident["id"],
                    request.code,
                    users=self._users,
                    totp=self._totp,
                    secretbox=self._secretbox,
                )
                return settings_pb2.OkResponse(ok=True)
            except AuthDomainError as exc:
                await self._abort(context, exc, "DisableTotp")

    async def ChangePassword(self, request, context):
        _grpc_total.labels(method="ChangePassword").inc()
        ident = await caller_identity(context, self._tokens)
        async with log_context(log, "settings.ChangePassword"):
            try:
                await settings_res.change_password(
                    ident["id"],
                    request.current_password,
                    request.new_password,
                    ident.get("sid"),
                    users=self._users,
                    sessions=self._sessions,
                    limiter=self._limiter,
                    audit=self._audit,
                )
                return settings_pb2.OkResponse(ok=True)
            except AuthDomainError as exc:
                await self._abort(context, exc, "ChangePassword")

    async def RequestEmailChange(self, request, context):
        _grpc_total.labels(method="RequestEmailChange").inc()
        ident = await caller_identity(context, self._tokens)
        async with log_context(log, "settings.RequestEmailChange"):
            try:
                await settings_res.request_email_change(
                    ident["id"],
                    request.new_email,
                    users=self._users,
                    tokens=self._tokens,
                    notifier=self._notifier,
                    nonces=self._nonces,
                    audit=self._audit,
                )
                return settings_pb2.OkResponse(ok=True)
            except AuthDomainError as exc:
                await self._abort(context, exc, "RequestEmailChange")

    async def VerifyEmailChange(self, request, context):
        # Pre-auth: the single-use link is the proof (no caller_identity).
        _grpc_total.labels(method="VerifyEmailChange").inc()
        async with log_context(log, "settings.VerifyEmailChange"):
            try:
                await settings_res.verify_email_change(
                    request.token,
                    users=self._users,
                    tokens=self._tokens,
                    nonces=self._nonces,
                    audit=self._audit,
                )
                return settings_pb2.OkResponse(ok=True)
            except AuthDomainError as exc:
                await self._abort(context, exc, "VerifyEmailChange")
