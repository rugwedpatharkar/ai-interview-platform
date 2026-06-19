"""Shared gRPC route helpers for ai-agents servicers: metadata auth + error mapping.

Mirrors the admin route layer (src/admin/app/routes/auth.py): the caller's identity
comes from the access token carried in gRPC metadata, and `app.errors` domain errors
map to gRPC status codes. Servicers stay thin adapters over app/resources — the same
contract the REST routes had, moved onto the shared gRPC-web translator (lib/grpcweb).
"""

import grpc
from jose import JWTError

from app.errors import ConflictError, ForbiddenError, NotFoundError

# Domain error -> gRPC status. Same mapping the REST layer expressed as HTTP codes
# (404/403/409); INTERNAL is the fallback so an unexpected error stays opaque.
_STATUS = {
    NotFoundError: grpc.StatusCode.NOT_FOUND,
    ForbiddenError: grpc.StatusCode.PERMISSION_DENIED,
    ConflictError: grpc.StatusCode.FAILED_PRECONDITION,
}


def _bearer_from_metadata(context):
    header = dict(context.invocation_metadata()).get("authorization", "")
    return header[7:] if header.lower().startswith("bearer ") else None


async def caller_user_id(context, tokens):
    """The caller's user_id from the access token in metadata.

    Aborts UNAUTHENTICATED when the token is absent OR invalid/expired, so the FE
    transport refreshes-and-retries rather than surfacing a hard error.
    """
    token = _bearer_from_metadata(context)
    if token is None:
        await context.abort(grpc.StatusCode.UNAUTHENTICATED, "Not authenticated")
    try:
        return tokens.decode(token, expected_type="access")["sub"]
    except JWTError:
        await context.abort(grpc.StatusCode.UNAUTHENTICATED, "Invalid or expired token")


async def caller_identity(context, tokens):
    """Scope context (user_id/role/comp_id) from the signed access token in metadata."""
    token = _bearer_from_metadata(context)
    if token is None:
        await context.abort(grpc.StatusCode.UNAUTHENTICATED, "Not authenticated")
    try:
        claims = tokens.decode(token, expected_type="access")
    except JWTError:
        await context.abort(grpc.StatusCode.UNAUTHENTICATED, "Invalid or expired token")
    return {
        "user_id": claims["sub"],
        "role": str(claims.get("role", "")),
        "comp_id": claims.get("comp_id"),
    }


async def abort_domain(context, exc):
    """Abort with the gRPC status mapped from a domain error (INTERNAL if unmapped)."""
    await context.abort(_STATUS.get(type(exc), grpc.StatusCode.INTERNAL), str(exc))
