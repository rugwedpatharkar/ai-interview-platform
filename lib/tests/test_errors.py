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
)
from lib.errors import TimeoutError as AppTimeoutError
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
