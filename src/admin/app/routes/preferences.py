"""gRPC PreferencesService — thin adapter over resources/preferences (token-scoped)."""

from lib.errors import to_grpc_status
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter

from app.errors import AuthDomainError
from app.resources import preferences as preferences_res
from app.routes.auth import caller_identity
from app.routes.pb import preferences_pb2, preferences_pb2_grpc

log = get_logger(component="preferences.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


def _to_proto(dto):
    return preferences_pb2.Appearance(
        mode=dto["mode"],
        base=dto["base"],
        accent=dto["accent"],
        accent_hue=dto["accent_hue"] or 0,  # None -> 0 (uint32); FE reads it iff custom
    )


class PreferencesServicer(preferences_pb2_grpc.PreferencesServiceServicer):
    def __init__(self, *, preferences, tokens):
        self._preferences = preferences
        self._tokens = tokens

    async def _abort(self, context, exc, method):
        code, msg = to_grpc_status(exc)
        log.warning(
            "preferences.routes.{}: {} code={}",
            method,
            exc,
            code.name,
        )
        _grpc_errors.labels(method=method).inc()
        await context.abort(code, msg)

    async def GetAppearance(self, request, context):
        _grpc_total.labels(method="GetAppearance").inc()
        async with log_context(log, "preferences.GetAppearance"):
            try:
                identity = await caller_identity(context, self._tokens)
                dto = await preferences_res.get_appearance(
                    identity, prefs=self._preferences
                )
                return _to_proto(dto)
            except AuthDomainError as exc:
                await self._abort(context, exc, "GetAppearance")

    async def UpdateAppearance(self, request, context):
        _grpc_total.labels(method="UpdateAppearance").inc()
        async with log_context(
            log, "preferences.UpdateAppearance", **bind_ids(accent=request.accent)
        ):
            try:
                identity = await caller_identity(context, self._tokens)
                dto = await preferences_res.update_appearance(
                    identity,
                    {
                        "mode": request.mode,
                        "base": request.base,
                        "accent": request.accent,
                        "accent_hue": request.accent_hue,
                    },
                    prefs=self._preferences,
                )
                return _to_proto(dto)
            except AuthDomainError as exc:
                await self._abort(context, exc, "UpdateAppearance")
