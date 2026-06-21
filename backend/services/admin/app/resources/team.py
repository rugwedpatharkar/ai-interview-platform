"""TeamService resources — company seat management over the RBAC matrix.

Every mutation is `team:manage`-gated (only company_admin holds it), `comp_id`-scoped to
the caller's company, audited, and last-admin-protected (a company always keeps >=1
active company_admin). Authz reuses `require_permission` + a local `_member_scoped`.
Invites delegate to the shared `auth._invite_company_user`. No candidate PII — a seat is
an employee User, untouched by the CandidateEraser cascade.
"""

from lib.logging import bind_ids, get_logger, log_context
from lib.schemas import Role

from app.errors import ConflictError, NotFoundError, ValidationError
from app.model.audit import AuditLog
from app.resources.auth import _invite_company_user, _send_verification
from app.resources.permissions import require_permission

log = get_logger(component="team.resources")

_INVITABLE_ROLES = {Role.recruiter.value, Role.hiring_manager.value}
_ALL_ROLES = {Role.company_admin.value, Role.recruiter.value, Role.hiring_manager.value}
# Privilege rank — a lower rank than the current role is a demotion (revokes sessions).
_RANK = {
    Role.company_admin.value: 3,
    Role.recruiter.value: 2,
    Role.hiring_manager.value: 1,
}


def _iso(value):
    return value.isoformat() if hasattr(value, "isoformat") and value else ""


def _member_dto(user):
    return {
        "id": str(user["_id"]),
        "email": user.get("email", ""),
        "role": str(user.get("role", "")),
        "status": user.get("status", ""),
        "last_active_at": _iso(user.get("last_active_at")),
        "invited_by": user.get("invited_by", ""),
    }


async def _member_scoped(identity, user_id, users):
    """The target seat, scoped to the caller's company (cross-tenant -> NotFound)."""
    user = await users.get(user_id)
    if user is None or user.get("comp_id") != identity["comp_id"]:
        raise NotFoundError("Member not found")
    return user


async def _guard_last_admin(identity, user, users):
    """Refuse to remove/demote the only active company_admin (lock-out guard)."""
    if (
        user.get("role") == Role.company_admin.value
        and user.get("status") == "active"
        and await users.count_active_admins(identity["comp_id"]) <= 1
    ):
        raise ValidationError("Cannot remove the last admin")


async def _audit(audit, user_id, action, comp_id):
    if audit is not None:
        await audit.insert(
            AuditLog(entity="user", entity_id=user_id, action=action, comp_id=comp_id)
        )


async def list_members(identity, *, page, page_size, users):
    async with log_context(
        log,
        "resource.team.list_members",
        **bind_ids(comp_id=identity["comp_id"]),
    ):
        require_permission(identity, "team:manage")
        page = page or 1
        page_size = min(page_size or 50, 100)
        skip = (page - 1) * page_size
        rows = await users.list_company(identity["comp_id"], skip=skip, limit=page_size)
        total = await users.count_company(identity["comp_id"])
        return {
            "members": [_member_dto(u) for u in rows],
            "page": page,
            "page_size": page_size,
            "total": total,
        }


async def invite_member(
    identity,
    email,
    role,
    temp_password,
    *,
    users,
    tokens,
    notifier,
    nonces=None,
    audit=None,
):
    async with log_context(
        log,
        "resource.team.invite_member",
        **bind_ids(comp_id=identity["comp_id"]),
    ):
        require_permission(identity, "team:manage")
        if role not in _INVITABLE_ROLES:
            raise ValidationError("role must be recruiter or hiring_manager")
        out = await _invite_company_user(
            email,
            temp_password,
            Role(role),
            comp_id=identity["comp_id"],
            invited_by=identity["id"],
            audit_action="member_invited",
            users=users,
            tokens=tokens,
            notifier=notifier,
            nonces=nonces,
            audit=audit,
        )
        log.info(
            "member invited: comp_id={} user_id={}", identity["comp_id"], out["id"]
        )
        return {
            "id": out["id"],
            "email": out["email"],
            "role": role,
            "status": "pending",
            "last_active_at": "",
            "invited_by": identity["id"],
        }


async def resend_invite(
    identity, user_id, *, users, tokens, notifier, nonces=None, audit=None
):
    async with log_context(
        log,
        "resource.team.resend_invite",
        **bind_ids(user_id=user_id, comp_id=identity["comp_id"]),
    ):
        require_permission(identity, "team:manage")
        user = await _member_scoped(identity, user_id, users)
        if user.get("status") == "active":
            raise ConflictError("Member is already active")
        await _send_verification(notifier, tokens, user_id, user["email"], nonces)
        await _audit(audit, user_id, "member_invite_resent", identity["comp_id"])
        return _member_dto(user)


async def revoke_invite(identity, user_id, *, users, sessions, audit=None):
    async with log_context(
        log,
        "resource.team.revoke_invite",
        **bind_ids(user_id=user_id, comp_id=identity["comp_id"]),
    ):
        require_permission(identity, "team:manage")
        user = await _member_scoped(identity, user_id, users)
        if user.get("status") != "pending":
            raise ConflictError("Not a pending invite")
        await users.revoke_seat(user_id)
        await sessions.revoke_user(user_id)
        await _audit(audit, user_id, "member_invite_revoked", identity["comp_id"])
        return _member_dto({**user, "status": "revoked"})


async def remove_member(identity, user_id, *, users, sessions, audit=None):
    async with log_context(
        log,
        "resource.team.remove_member",
        **bind_ids(user_id=user_id, comp_id=identity["comp_id"]),
    ):
        require_permission(identity, "team:manage")
        user = await _member_scoped(identity, user_id, users)
        await _guard_last_admin(identity, user, users)
        await users.revoke_seat(user_id)
        await sessions.revoke_user(user_id)
        await _audit(audit, user_id, "member_removed", identity["comp_id"])
        return _member_dto({**user, "status": "revoked"})


async def change_role(identity, user_id, role, *, users, sessions, audit=None):
    async with log_context(
        log,
        "resource.team.change_role",
        **bind_ids(user_id=user_id, comp_id=identity["comp_id"]),
    ):
        require_permission(identity, "team:manage")
        if role not in _ALL_ROLES:
            raise ValidationError("invalid role")
        user = await _member_scoped(identity, user_id, users)
        old_role = str(user.get("role", ""))
        if old_role == Role.company_admin.value and role != Role.company_admin.value:
            await _guard_last_admin(identity, user, users)
        await users.set_role(user_id, role)
        # A demotion (privilege reduction) revokes sessions; a promotion does not.
        if _RANK.get(role, 0) < _RANK.get(old_role, 0):
            await sessions.revoke_user(user_id)
        await _audit(audit, user_id, "member_role_changed", identity["comp_id"])
        return _member_dto({**user, "role": role})
