"""TeamService over gRPC-web: auth, RBAC gate, invite, last-admin guard."""

import struct

import httpx
import pytest
from lib.grpcweb import GrpcWebASGI
from lib.security import TokenService

from app.routes.pb import team_pb2, team_pb2_grpc
from app.routes.team import TeamServicer

_SECRET = "test-secret-" + "x" * 32
_SVC = "/admin.team.v1.TeamService"


class _FakeUsers:
    def __init__(self):
        self.docs = {}
        self._n = 0

    async def insert(self, user):
        self._n += 1
        uid = f"u{self._n}"
        d = user.model_dump()
        d["_id"] = uid
        self.docs[uid] = d
        return uid

    async def get(self, user_id):
        return self.docs.get(user_id)

    async def get_by_email(self, email):
        return next((d for d in self.docs.values() if d["email"] == email), None)

    async def list_company(self, comp_id, *, skip=0, limit=50):
        rows = [d for d in self.docs.values() if d.get("comp_id") == comp_id]
        return rows[skip : skip + limit]

    async def count_company(self, comp_id):
        return len([d for d in self.docs.values() if d.get("comp_id") == comp_id])

    async def set_role(self, user_id, role):
        self.docs[user_id]["role"] = role

    async def count_active_admins(self, comp_id):
        return len(
            [
                d
                for d in self.docs.values()
                if d.get("comp_id") == comp_id
                and d.get("role") == "company_admin"
                and d.get("status") == "active"
            ]
        )

    async def revoke_seat(self, user_id):
        self.docs[user_id].update(status="revoked", password_hash="")


class _FakeNotifier:
    async def send_email(self, to, subject, body):
        pass


class _FakeAudit:
    async def insert(self, entry):
        pass


class _FakeSessions:
    async def revoke_user(self, user_id):
        pass


def _seed(users, uid, role, status="active", comp_id="c1"):
    users.docs[uid] = {
        "_id": uid,
        "email": f"{uid}@c.com",
        "role": role,
        "comp_id": comp_id,
        "status": status,
        "invited_by": "",
        "password_hash": "h",
    }


def _app(users):
    grpc_app = GrpcWebASGI()
    team_pb2_grpc.add_TeamServiceServicer_to_server(
        TeamServicer(
            users=users,
            audit=_FakeAudit(),
            tokens=TokenService(_SECRET),
            sessions=_FakeSessions(),
            notifier=_FakeNotifier(),
        ),
        grpc_app,
    )
    return grpc_app


def _frame(b):
    return b"\x00" + struct.pack(">I", len(b)) + b


def _ds(body):
    data, status, i = None, None, 0
    while i + 5 <= len(body):
        flag = body[i]
        (n,) = struct.unpack(">I", body[i + 1 : i + 5])
        p = body[i + 5 : i + 5 + n]
        if flag & 0x80:
            for line in p.decode().replace("\r\n", "\n").splitlines():
                if line.startswith("grpc-status:"):
                    status = int(line.split(":", 1)[1])
        else:
            data = p
        i += 5 + n
    return data, status


async def _call(app, method, req, *, metadata=None):
    transport = httpx.ASGITransport(app=app)
    headers = {"content-type": "application/grpc-web+proto", **(metadata or {})}
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        return await client.post(
            f"{_SVC}/{method}", content=_frame(req.SerializeToString()), headers=headers
        )


def _auth(uid, role="company_admin"):
    token = TokenService(_SECRET).access_token(uid, role, "c1", "j1")
    return {"authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_list_requires_auth():
    resp = await _call(_app(_FakeUsers()), "ListMembers", team_pb2.ListMembersRequest())
    _, status = _ds(resp.content)
    assert status == 16  # UNAUTHENTICATED


@pytest.mark.asyncio
async def test_list_members_admin():
    users = _FakeUsers()
    _seed(users, "admin1", "company_admin")
    _seed(users, "rec1", "recruiter")
    resp = await _call(
        _app(users),
        "ListMembers",
        team_pb2.ListMembersRequest(),
        metadata=_auth("admin1"),
    )
    data, status = _ds(resp.content)
    assert status == 0
    out = team_pb2.ListMembersResponse.FromString(data)
    assert out.total == 2


@pytest.mark.asyncio
async def test_list_members_non_admin_denied():
    users = _FakeUsers()
    _seed(users, "rec1", "recruiter")
    resp = await _call(
        _app(users),
        "ListMembers",
        team_pb2.ListMembersRequest(),
        metadata=_auth("rec1", role="recruiter"),
    )
    _, status = _ds(resp.content)
    assert status == 7  # PERMISSION_DENIED — recruiter lacks team:manage


@pytest.mark.asyncio
async def test_invite_member_creates_pending():
    users = _FakeUsers()
    resp = await _call(
        _app(users),
        "InviteMember",
        team_pb2.InviteMemberRequest(
            email="new@c.com", role="recruiter", temp_password="temp1234"
        ),
        metadata=_auth("admin1"),
    )
    data, status = _ds(resp.content)
    assert status == 0
    out = team_pb2.MemberDTO.FromString(data)
    assert out.status == "pending" and out.role == "recruiter"


@pytest.mark.asyncio
async def test_invite_admin_role_invalid():
    resp = await _call(
        _app(_FakeUsers()),
        "InviteMember",
        team_pb2.InviteMemberRequest(
            email="x@c.com", role="company_admin", temp_password="temp1234"
        ),
        metadata=_auth("admin1"),
    )
    _, status = _ds(resp.content)
    assert status == 3  # INVALID_ARGUMENT


@pytest.mark.asyncio
async def test_remove_last_admin_blocked():
    users = _FakeUsers()
    _seed(users, "admin1", "company_admin")
    resp = await _call(
        _app(users),
        "RemoveMember",
        team_pb2.RemoveMemberRequest(user_id="admin1"),
        metadata=_auth("admin1"),
    )
    _, status = _ds(resp.content)
    assert status == 3  # INVALID_ARGUMENT — cannot remove the last admin
