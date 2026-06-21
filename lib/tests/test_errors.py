import grpc
from lib.errors import (
    AppError,
    AuthError,
    BusinessRuleError,
    ConflictError,
    DependencyError,
    InternalError,
    NotFoundError,
    PermissionError,
    ValidationError,
    to_grpc_status,
)
from lib.errors import (
    TimeoutError as AppTimeoutError,
)
from lib.resilience import OperationTimeout


def test_app_error_carries_public_message_and_context():
    err = AppError("user-facing", context={"comp_id": "c1"})
    assert err.public_message == "user-facing"
    assert err.context == {"comp_id": "c1"}
    assert isinstance(err, Exception)


def test_app_error_context_defaults_to_empty_dict():
    err = AppError("x")
    assert err.context == {}


def test_subclasses_all_inherit_from_app_error():
    for cls in (
        ValidationError,
        NotFoundError,
        ConflictError,
        PermissionError,
        AuthError,
        DependencyError,
        BusinessRuleError,
        InternalError,
    ):
        instance = cls("msg")
        assert isinstance(instance, AppError)
        assert instance.public_message == "msg"


def test_timeout_error_is_operation_timeout_alias():
    assert AppTimeoutError is OperationTimeout


def test_to_grpc_status_maps_each_subclass():
    cases = [
        (ValidationError("bad email"), grpc.StatusCode.INVALID_ARGUMENT),
        (NotFoundError("no profile"), grpc.StatusCode.NOT_FOUND),
        (ConflictError("dup"), grpc.StatusCode.ALREADY_EXISTS),
        (PermissionError("denied"), grpc.StatusCode.PERMISSION_DENIED),
        (AuthError("expired"), grpc.StatusCode.UNAUTHENTICATED),
        (DependencyError("mongo down"), grpc.StatusCode.UNAVAILABLE),
        (BusinessRuleError("state terminal"), grpc.StatusCode.FAILED_PRECONDITION),
        (AppTimeoutError("op", 1.0), grpc.StatusCode.DEADLINE_EXCEEDED),
        (InternalError("bug"), grpc.StatusCode.INTERNAL),
    ]
    for err, expected_code in cases:
        code, msg = to_grpc_status(err)
        assert code == expected_code, (
            f"{type(err).__name__} → {code}, want {expected_code}"
        )
        assert msg == err.public_message if isinstance(err, AppError) else True


def test_to_grpc_status_falls_back_to_internal_for_unknown():
    code, msg = to_grpc_status(RuntimeError("surprise"))
    assert code == grpc.StatusCode.INTERNAL
    assert msg == "internal error"
