"""Typed exception hierarchy for the platform.

Every domain error raised inside resource / repository / handler code is a subclass of
:class:`AppError`. The central gRPC translator (``lib.grpcweb``) maps each subclass to
the correct gRPC status. Internals raise; the translator catches at the egress boundary.
``TimeoutError`` is a re-export of :class:`lib.resilience.OperationTimeout` so callers
import a single name from one module.
"""

from typing import Any

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
