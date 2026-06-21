"""Typed exception hierarchy for the platform.

Every domain error raised inside resource / repository / handler code is a subclass of
:class:`AppError`. The central gRPC translator (``lib.grpcweb``) maps each subclass to
the correct gRPC status. Internals raise; the translator catches at the egress boundary.
``TimeoutError`` is a re-export of :class:`lib.resilience.OperationTimeout` so callers
import a single name from one module.
"""

from typing import Any

import grpc

from lib.resilience import OperationTimeout


class AppError(Exception):
    """Base for every domain error. Carries a *client-safe* public message + structured
    ``context`` for log binding. Internal details (stack traces, original exception
    chains) stay on the exception itself; ``public_message`` is what crosses the wire.
    """

    def __init__(
        self, public_message: str, *, context: dict[str, Any] | None = None
    ) -> None:
        super().__init__(public_message)
        self.public_message = public_message
        self.context: dict[str, Any] = context or {}


class ValidationError(AppError):
    """Boundary validation failed (bad email, missing required field, oversize)."""


class NotFoundError(AppError):
    """The requested resource does not exist for this tenant/user."""


class ConflictError(AppError):
    """Resource already exists or violates a uniqueness constraint."""


class PermissionError(AppError):
    """Authenticated caller is not allowed to perform this action."""


class AuthError(AppError):
    """Caller is not authenticated (missing/expired/invalid token)."""


class DependencyError(AppError):
    """A downstream dependency (Mongo, Redis, RabbitMQ, MCP, LLM) is unavailable."""


class BusinessRuleError(AppError):
    """The request is well-formed but violates a domain invariant."""


class InternalError(AppError):
    """An unexpected condition — the only error mapped to gRPC INTERNAL."""


TimeoutError = OperationTimeout


_STATUS_MAP: dict[type[Exception], grpc.StatusCode] = {
    ValidationError: grpc.StatusCode.INVALID_ARGUMENT,
    NotFoundError: grpc.StatusCode.NOT_FOUND,
    ConflictError: grpc.StatusCode.ALREADY_EXISTS,
    PermissionError: grpc.StatusCode.PERMISSION_DENIED,
    AuthError: grpc.StatusCode.UNAUTHENTICATED,
    DependencyError: grpc.StatusCode.UNAVAILABLE,
    BusinessRuleError: grpc.StatusCode.FAILED_PRECONDITION,
    OperationTimeout: grpc.StatusCode.DEADLINE_EXCEEDED,
    InternalError: grpc.StatusCode.INTERNAL,
}


def to_grpc_status(err: Exception) -> tuple[grpc.StatusCode, str]:
    """Map any exception to ``(grpc.StatusCode, public_message)`` for the egress
    boundary. Unknown exceptions fall back to ``INTERNAL`` with a generic message —
    the original exception still propagates through ``log.exception``; this is only
    what we put on the wire.
    """
    for cls, code in _STATUS_MAP.items():
        if isinstance(err, cls):
            msg = err.public_message if isinstance(err, AppError) else str(err)
            return code, msg
    return grpc.StatusCode.INTERNAL, "internal error"
