"""gRPC TeamService route layer — a thin adapter over app/resources/team.

Authenticates from the access token, maps proto<->resource, and translates app.errors to
gRPC status via to_grpc_status from lib.errors. All authz / last-admin / lifecycle logic
stays in the resource.
"""

from lib.errors import to_grpc_status
from lib.logging import bind_ids, get_logger, log_context
from lib.observability import counter, span

from app.errors import AuthDomainError
from app.resources import team as team_res
from app.routes.auth import caller_identity
from app.routes.pb import team_pb2, team_pb2_grpc

log = get_logger(component="team.routes")

_grpc_total = counter("admin_grpc_requests_total", "gRPC requests received", ["method"])
_grpc_errors = counter(
    "admin_grpc_errors_total",
    "gRPC requests that resulted in a domain error",
    ["method"],
)


def _member_pb(m):
    return team_pb2.MemberDTO(
        id=m["id"],
        email=m["email"],
        role=m["role"],
        status=m["status"],
        last_active_at=m["last_active_at"],
        invited_by=m["invited_by"],
    )


class TeamServicer(team_pb2_grpc.TeamServiceServicer):
    def __init__(self, *, users, audit, tokens, sessions, notifier=None, nonces=None):
        self._users = users
        self._audit = audit
        self._tokens = tokens
        self._sessions = sessions
        self._notifier = notifier
        self._nonces = nonces

    async def _abort(self, context, exc, method):
        code, msg = to_grpc_status(exc)
        log.warning(
            "team.routes.{}: {} code={}",
            method,
            exc,
            code.name,
        )
        _grpc_errors.labels(method=method).inc()
        await context.abort(code, msg)

    def _ctx(self, method, user_id=""):
        _grpc_total.labels(method=method).inc()
        return log_context(log, f"team.{method}", **bind_ids(user_id=user_id)), span(
            f"team.{method}"
        )

    async def ListMembers(self, request, context):
        lc, sp = self._ctx("ListMembers")
        async with lc, sp:
            try:
                identity = await caller_identity(context, self._tokens)
                out = await team_res.list_members(
                    identity,
                    page=request.page,
                    page_size=request.page_size,
                    users=self._users,
                )
                return team_pb2.ListMembersResponse(
                    members=[_member_pb(m) for m in out["members"]],
                    page=out["page"],
                    page_size=out["page_size"],
                    total=out["total"],
                )
            except AuthDomainError as exc:
                await self._abort(context, exc, "ListMembers")

    async def InviteMember(self, request, context):
        lc, sp = self._ctx("InviteMember")
        async with lc, sp:
            try:
                identity = await caller_identity(context, self._tokens)
                out = await team_res.invite_member(
                    identity,
                    request.email,
                    request.role,
                    request.temp_password,
                    users=self._users,
                    tokens=self._tokens,
                    notifier=self._notifier,
                    nonces=self._nonces,
                    audit=self._audit,
                )
                return _member_pb(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "InviteMember")

    async def ResendInvite(self, request, context):
        lc, sp = self._ctx("ResendInvite", request.user_id)
        async with lc, sp:
            try:
                identity = await caller_identity(context, self._tokens)
                out = await team_res.resend_invite(
                    identity,
                    request.user_id,
                    users=self._users,
                    tokens=self._tokens,
                    notifier=self._notifier,
                    nonces=self._nonces,
                    audit=self._audit,
                )
                return _member_pb(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "ResendInvite")

    async def RevokeInvite(self, request, context):
        lc, sp = self._ctx("RevokeInvite", request.user_id)
        async with lc, sp:
            try:
                identity = await caller_identity(context, self._tokens)
                out = await team_res.revoke_invite(
                    identity,
                    request.user_id,
                    users=self._users,
                    sessions=self._sessions,
                    audit=self._audit,
                )
                return _member_pb(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "RevokeInvite")

    async def RemoveMember(self, request, context):
        lc, sp = self._ctx("RemoveMember", request.user_id)
        async with lc, sp:
            try:
                identity = await caller_identity(context, self._tokens)
                out = await team_res.remove_member(
                    identity,
                    request.user_id,
                    users=self._users,
                    sessions=self._sessions,
                    audit=self._audit,
                )
                return _member_pb(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "RemoveMember")

    async def ChangeRole(self, request, context):
        lc, sp = self._ctx("ChangeRole", request.user_id)
        async with lc, sp:
            try:
                identity = await caller_identity(context, self._tokens)
                out = await team_res.change_role(
                    identity,
                    request.user_id,
                    request.role,
                    users=self._users,
                    sessions=self._sessions,
                    audit=self._audit,
                )
                return _member_pb(out)
            except AuthDomainError as exc:
                await self._abort(context, exc, "ChangeRole")
