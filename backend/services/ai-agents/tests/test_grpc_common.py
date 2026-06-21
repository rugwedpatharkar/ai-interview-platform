import grpc
import pytest
from lib.security import TokenService

from app.errors import ConflictError, ForbiddenError, NotFoundError
from app.routes.grpc_common import abort_domain, caller_identity, caller_user_id

_SECRET = "test-secret"


class _Aborted(Exception):
    """Stand-in for the abort the gRPC context raises to unwind the servicer."""


class _FakeContext:
    def __init__(self, metadata=()):
        self._md = list(metadata)
        self.code = None
        self.details = None

    def invocation_metadata(self):
        return self._md

    async def abort(self, code, details):
        self.code = code
        self.details = details
        raise _Aborted(details)


def _tokens():
    return TokenService(secret=_SECRET)


def _bearer(user_id, role="candidate", comp_id=None):
    token = _tokens().access_token(user_id, role, comp_id, "j1")
    return [("authorization", f"Bearer {token}")]


@pytest.mark.asyncio
async def test_caller_user_id_returns_sub():
    ctx = _FakeContext(_bearer("u1"))
    assert await caller_user_id(ctx, _tokens()) == "u1"


@pytest.mark.asyncio
async def test_caller_user_id_missing_token_aborts_unauthenticated():
    ctx = _FakeContext()
    with pytest.raises(_Aborted):
        await caller_user_id(ctx, _tokens())
    assert ctx.code == grpc.StatusCode.UNAUTHENTICATED


@pytest.mark.asyncio
async def test_caller_user_id_invalid_token_aborts_unauthenticated():
    ctx = _FakeContext([("authorization", "Bearer not-a-jwt")])
    with pytest.raises(_Aborted):
        await caller_user_id(ctx, _tokens())
    assert ctx.code == grpc.StatusCode.UNAUTHENTICATED


@pytest.mark.asyncio
async def test_caller_identity_returns_scope():
    ctx = _FakeContext(_bearer("u2", role="recruiter", comp_id="c1"))
    assert await caller_identity(ctx, _tokens()) == {
        "user_id": "u2",
        "role": "recruiter",
        "comp_id": "c1",
    }


@pytest.mark.asyncio
async def test_abort_domain_maps_each_status():
    cases = [
        (NotFoundError("nope"), grpc.StatusCode.NOT_FOUND),
        (ForbiddenError("nope"), grpc.StatusCode.PERMISSION_DENIED),
        (ConflictError("nope"), grpc.StatusCode.FAILED_PRECONDITION),
    ]
    for exc, code in cases:
        ctx = _FakeContext()
        with pytest.raises(_Aborted):
            await abort_domain(ctx, exc)
        assert ctx.code == code
