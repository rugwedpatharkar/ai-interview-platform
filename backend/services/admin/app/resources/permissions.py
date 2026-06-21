"""require_permission — the admin-side RBAC gate.

Wraps lib's pure `has_permission` (the matrix authority) and raises ForbiddenError when
the caller's role lacks the scope. lib must not import app.errors, so the raise-policy
lives here.
"""

from lib.schemas.permissions import has_permission

from app.errors import ForbiddenError


def require_permission(identity, scope):
    if not has_permission(identity.get("role", ""), scope):
        raise ForbiddenError(f"missing permission: {scope}")
