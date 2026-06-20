"""gRPC NotificationService — a recipient's feed + read-acks (resources/notification).

Recipient-scoped: caller_identity yields the owner; every RPC touches only that user's
rows. Mirrors saved_jobs.py's caller_identity + _abort shape.
"""

import grpc
from lib.logging import get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import notification as notif_res
from app.routes.auth import _STATUS, caller_identity
from app.routes.pb import notification_pb2, notification_pb2_grpc

log = get_logger(component="notification.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


def _dto(d):
    return notification_pb2.NotificationDTO(
        id=d["id"],
        kind=d["kind"],
        subject=d["subject"],
        body=d["body"],
        link=d["link"],
        created_at=d["created_at"],
        read_at=d["read_at"],
    )


class NotificationServicer(notification_pb2_grpc.NotificationServiceServicer):
    def __init__(self, *, notifications, tokens):
        self._notifications = notifications
        self._tokens = tokens

    async def _abort(self, context, exc, method):
        code = _STATUS.get(type(exc), grpc.StatusCode.INTERNAL)
        log.warning("notification.routes.{}: {} code={}", method, exc, code.name)
        _grpc_errors.labels(method=method).inc()
        await context.abort(code, str(exc))

    async def ListNotifications(self, request, context):
        _grpc_total.labels(method="ListNotifications").inc()
        ident = await caller_identity(context, self._tokens)
        async with log_context(log, "notification.List"), span("notification.List"):
            out = await notif_res.list_notifications(
                ident["id"],
                notifications=self._notifications,
                page=request.page,
                page_size=request.page_size,
                unread_only=request.unread_only,
            )
            return notification_pb2.ListResponse(
                notifications=[_dto(n) for n in out["notifications"]],
                unread_count=out["unread_count"],
                page=out["page"],
                page_size=out["page_size"],
                total=out["total"],
            )

    async def MarkRead(self, request, context):
        _grpc_total.labels(method="MarkRead").inc()
        ident = await caller_identity(context, self._tokens)
        async with log_context(log, "notification.MarkRead"):
            try:
                count = await notif_res.mark_read(
                    ident["id"],
                    request.notification_id,
                    notifications=self._notifications,
                )
                return notification_pb2.MarkReadResponse(unread_count=count)
            except AuthDomainError as exc:
                await self._abort(context, exc, "MarkRead")

    async def MarkAllRead(self, request, context):
        _grpc_total.labels(method="MarkAllRead").inc()
        ident = await caller_identity(context, self._tokens)
        async with log_context(log, "notification.MarkAllRead"):
            count = await notif_res.mark_all_read(
                ident["id"], notifications=self._notifications
            )
            return notification_pb2.MarkReadResponse(unread_count=count)
