"""Admin domain errors. Inherit lib.errors.AppError so the central gRPC translator
maps them correctly; multi-inherit specific peers (NotFoundError, ConflictError, etc.)
so isinstance checks in lib.errors._STATUS_MAP hit. InvalidTokenError and
RateLimitedError have no lib peer — routes handle them manually.
"""

from lib import errors as lib_errors


class AuthDomainError(lib_errors.AppError):
    """Base for admin domain errors; routes map these to gRPC status codes."""


class ConflictError(AuthDomainError, lib_errors.ConflictError):
    """A unique constraint (e.g. email) was violated."""


class InvalidTokenError(AuthDomainError):
    """A token was malformed, expired, or of the wrong purpose/type.
    No lib.errors peer — routes manually abort with INVALID_ARGUMENT or UNAUTHENTICATED.
    """


class InvalidCredentialsError(AuthDomainError, lib_errors.AuthError):
    """Login credentials did not match."""


class NotFoundError(AuthDomainError, lib_errors.NotFoundError):
    """A referenced entity does not exist."""


class RateLimitedError(AuthDomainError):
    """Too many attempts; retry after `retry_after` seconds.
    No lib peer (RESOURCE_EXHAUSTED not in the typed map). Routes manually abort.
    """

    def __init__(self, retry_after: int) -> None:
        super().__init__("Too many attempts")
        self.retry_after = retry_after


class ForbiddenError(AuthDomainError, lib_errors.PermissionError):
    """The caller is authenticated but not allowed to perform this action."""


class ValidationError(AuthDomainError, lib_errors.ValidationError):
    """Input failed a boundary validation check (size, type, format)."""


class InvalidTransition(AuthDomainError, lib_errors.BusinessRuleError):
    """An illegal application-state transition (funnel state machine)."""


class LimitExceededError(AuthDomainError, lib_errors.BusinessRuleError):
    """A per-caller resource cap was exceeded (e.g. max active job alerts)."""
