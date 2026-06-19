class AuthDomainError(Exception):
    """Base for auth domain errors; the routes layer maps these to gRPC status codes."""


class ConflictError(AuthDomainError):
    """A unique constraint (e.g. email) was violated."""


class InvalidTokenError(AuthDomainError):
    """A token was malformed, expired, or of the wrong purpose/type."""


class InvalidCredentialsError(AuthDomainError):
    """Login credentials did not match."""


class NotFoundError(AuthDomainError):
    """A referenced entity does not exist."""


class RateLimitedError(AuthDomainError):
    """Too many attempts; retry after `retry_after` seconds."""

    def __init__(self, retry_after: int) -> None:
        super().__init__("Too many attempts")
        self.retry_after = retry_after


class ForbiddenError(AuthDomainError):
    """The caller is authenticated but not allowed to perform this action."""


class ValidationError(AuthDomainError):
    """Input failed a boundary validation check (size, type, format)."""


class InvalidTransition(AuthDomainError):
    """An illegal application-state transition (funnel state machine). The funnel
    consumer logs+acks it; a route maps it to FAILED_PRECONDITION."""
