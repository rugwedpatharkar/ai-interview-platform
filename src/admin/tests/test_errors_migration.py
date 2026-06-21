import grpc
from lib.errors import to_grpc_status

from app.errors import (
    AuthDomainError,
    ConflictError,
    ForbiddenError,
    InvalidCredentialsError,
    InvalidTokenError,
    InvalidTransition,
    LimitExceededError,
    NotFoundError,
    RateLimitedError,
    ValidationError,
)
from lib import errors as lib_errors


def test_authdomainerror_inherits_apperror():
    err = AuthDomainError("base")
    assert isinstance(err, lib_errors.AppError)


def test_notfound_translates_to_not_found():
    err = NotFoundError("missing")
    assert isinstance(err, lib_errors.NotFoundError)
    code, _msg = to_grpc_status(err)
    assert code == grpc.StatusCode.NOT_FOUND


def test_conflict_translates_to_already_exists():
    err = ConflictError("dup")
    code, _ = to_grpc_status(err)
    assert code == grpc.StatusCode.ALREADY_EXISTS


def test_validation_translates_to_invalid_argument():
    err = ValidationError("bad input")
    code, _ = to_grpc_status(err)
    assert code == grpc.StatusCode.INVALID_ARGUMENT


def test_invalidcredentials_translates_to_unauthenticated():
    err = InvalidCredentialsError("wrong")
    code, _ = to_grpc_status(err)
    assert code == grpc.StatusCode.UNAUTHENTICATED


def test_forbidden_translates_to_permission_denied():
    err = ForbiddenError("denied")
    code, _ = to_grpc_status(err)
    assert code == grpc.StatusCode.PERMISSION_DENIED


def test_invalid_transition_translates_to_failed_precondition():
    err = InvalidTransition("bad state")
    code, _ = to_grpc_status(err)
    assert code == grpc.StatusCode.FAILED_PRECONDITION


def test_limit_exceeded_translates_to_failed_precondition():
    err = LimitExceededError("over cap")
    code, _ = to_grpc_status(err)
    assert code == grpc.StatusCode.FAILED_PRECONDITION


def test_invalid_token_no_peer_falls_back_to_internal():
    # InvalidTokenError has no lib.* peer; translator falls back to INTERNAL.
    # Routes layer manually aborts with INVALID_ARGUMENT (email-verify / reset links).
    err = InvalidTokenError("bad token")
    code, _ = to_grpc_status(err)
    assert code == grpc.StatusCode.INTERNAL  # documents fallback


def test_rate_limited_keeps_retry_after():
    err = RateLimitedError(30)
    assert err.retry_after == 30
