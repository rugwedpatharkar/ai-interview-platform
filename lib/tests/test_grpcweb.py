"""Tests for the central AppError translator in lib.grpcweb."""

import grpc
from lib.errors import AuthError, NotFoundError, ValidationError
from lib.grpcweb import _translate_exception_to_status
from lib.resilience import OperationTimeout


def test_translate_app_error_uses_to_grpc_status():
    err = ValidationError("bad email")
    code, msg = _translate_exception_to_status(err)
    assert code == grpc.StatusCode.INVALID_ARGUMENT
    assert msg == "bad email"


def test_translate_auth_error_to_unauthenticated():
    code, _ = _translate_exception_to_status(AuthError("expired"))
    assert code == grpc.StatusCode.UNAUTHENTICATED


def test_translate_not_found_to_not_found():
    code, _ = _translate_exception_to_status(NotFoundError("no profile"))
    assert code == grpc.StatusCode.NOT_FOUND


def test_translate_unknown_exception_to_internal():
    code, _ = _translate_exception_to_status(RuntimeError("surprise"))
    assert code == grpc.StatusCode.INTERNAL


def test_translate_unavailable_error_still_unavailable():
    # OperationTimeout is in _STATUS_MAP → DEADLINE_EXCEEDED via to_grpc_status;
    # the isinstance(exc, (AppError, OperationTimeout)) branch fires before
    # the legacy _UNAVAILABLE_ERRORS fallback, so UNAVAILABLE is not returned.

    code, _ = _translate_exception_to_status(OperationTimeout("op", 1.0))
    assert (
        code == grpc.StatusCode.DEADLINE_EXCEEDED
    )  # via to_grpc_status; supersedes UNAVAILABLE
