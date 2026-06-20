"""RBAC permission matrix — the single authority for company-role capabilities.

Pure + dependency-free (lib must not import app code). `company_admin` holds all scopes,
`recruiter` all but team/branding management, `hiring_manager` a read/comms subset, and
any other role (candidate / unknown) holds none. The admin service wraps it in
`require_permission` (which raises ForbiddenError); lib stays exception-policy-free.
"""

from lib.schemas.enums import Role

PERMISSIONS: dict[Role, frozenset[str]] = {
    Role.company_admin: frozenset(
        {
            "team:manage",
            "branding:edit",
            "job:post",
            "job:template",
            "applicant:review",
            "applicant:decide",
            "messaging:send",
            "analytics:view",
        }
    ),
    Role.recruiter: frozenset(
        {
            "job:post",
            "job:template",
            "applicant:review",
            "applicant:decide",
            "messaging:send",
            "analytics:view",
        }
    ),
    Role.hiring_manager: frozenset(
        {"applicant:review", "messaging:send", "analytics:view"}
    ),
}


def has_permission(role: str, scope: str) -> bool:
    """True when `role` holds `scope`. An unknown role string yields no permissions."""
    try:
        return scope in PERMISSIONS.get(Role(role), frozenset())
    except ValueError:
        return False
