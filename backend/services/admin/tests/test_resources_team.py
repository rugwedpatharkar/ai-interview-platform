import pytest
from lib.security import TokenService

from app.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.resources import team

_TOKENS = TokenService("s" * 40)


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

    async def set_status(self, user_id, status):
        self.docs[user_id]["status"] = status

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
    def __init__(self):
        self.emails = []

    async def send_email(self, to, subject, body):
        self.emails.append((to, subject, body))


class _FakeAudit:
    def __init__(self):
        self.records = []

    async def insert(self, entry):
        self.records.append(entry.model_dump())


class _FakeSessions:
    def __init__(self):
        self.revoked = []

    async def revoke_user(self, user_id):
        self.revoked.append(user_id)


def _seed(users, uid, role, status="active", comp_id="c1", email=None):
    users.docs[uid] = {
        "_id": uid,
        "email": email or f"{uid}@c.com",
        "role": role,
        "comp_id": comp_id,
        "status": status,
        "invited_by": "",
        "password_hash": "h",
    }


def _admin(comp_id="c1", uid="admin1"):
    return {"id": uid, "role": "company_admin", "comp_id": comp_id}


def _kw(users, **over):
    base = {
        "users": users,
        "tokens": _TOKENS,
        "notifier": _FakeNotifier(),
        "audit": _FakeAudit(),
    }
    base.update(over)
    return base


async def test_list_members_gated_scoped_and_subset():
    users = _FakeUsers()
    _seed(users, "admin1", "company_admin")
    _seed(users, "rec1", "recruiter")
    _seed(users, "other", "recruiter", comp_id="c2")
    out = await team.list_members(_admin(), page=1, page_size=50, users=users)
    assert out["total"] == 2  # own comp only
    ids = {m["id"] for m in out["members"]}
    assert ids == {"admin1", "rec1"}
    assert all("password_hash" not in m for m in out["members"])  # strict subset
    # Non-admin is denied team:manage.
    with pytest.raises(ForbiddenError):
        await team.list_members(
            {"id": "rec1", "role": "recruiter", "comp_id": "c1"},
            page=1,
            page_size=50,
            users=users,
        )


async def test_invite_member_creates_pending_and_audits():
    users = _FakeUsers()
    notifier, audit = _FakeNotifier(), _FakeAudit()
    out = await team.invite_member(
        _admin(),
        "new@c.com",
        "recruiter",
        "temp1234",
        **_kw(users, notifier=notifier, audit=audit),
    )
    assert out["status"] == "pending" and out["role"] == "recruiter"
    assert out["invited_by"] == "admin1"
    assert notifier.emails  # verification email sent
    assert any(r["action"] == "member_invited" for r in audit.records)


async def test_invite_member_role_and_duplicate_validation():
    users = _FakeUsers()
    with pytest.raises(ValidationError):  # cannot invite a company_admin
        await team.invite_member(
            _admin(), "x@c.com", "company_admin", "temp1234", **_kw(users)
        )
    await team.invite_member(
        _admin(), "dup@c.com", "recruiter", "temp1234", **_kw(users)
    )
    with pytest.raises(ConflictError):
        await team.invite_member(
            _admin(), "dup@c.com", "recruiter", "temp1234", **_kw(users)
        )


async def test_resend_invite_pending_ok_active_conflict_crosstenant_notfound():
    users = _FakeUsers()
    _seed(users, "pend1", "recruiter", status="pending")
    _seed(users, "act1", "recruiter", status="active")
    _seed(users, "x", "recruiter", status="pending", comp_id="c2")
    notifier = _FakeNotifier()
    await team.resend_invite(_admin(), "pend1", **_kw(users, notifier=notifier))
    assert notifier.emails
    with pytest.raises(ConflictError):
        await team.resend_invite(_admin(), "act1", **_kw(users))
    with pytest.raises(NotFoundError):
        await team.resend_invite(_admin(), "x", **_kw(users))


async def test_revoke_invite_only_pending_and_revokes_sessions():
    users = _FakeUsers()
    _seed(users, "pend1", "recruiter", status="pending")
    _seed(users, "act1", "recruiter", status="active")
    sessions = _FakeSessions()
    dto = await team.revoke_invite(
        _admin(), "pend1", users=users, sessions=sessions, audit=_FakeAudit()
    )
    assert dto["status"] == "revoked"
    assert "pend1" in sessions.revoked
    with pytest.raises(ConflictError):  # active member is not a pending invite
        await team.revoke_invite(
            _admin(), "act1", users=users, sessions=sessions, audit=_FakeAudit()
        )


async def test_remove_member_last_admin_guard():
    users = _FakeUsers()
    _seed(users, "admin1", "company_admin")
    _seed(users, "rec1", "recruiter")
    sessions = _FakeSessions()
    # Removing a recruiter is fine.
    await team.remove_member(
        _admin(), "rec1", users=users, sessions=sessions, audit=_FakeAudit()
    )
    assert users.docs["rec1"]["status"] == "revoked"
    # Removing the only active admin is refused.
    with pytest.raises(ValidationError):
        await team.remove_member(
            _admin(), "admin1", users=users, sessions=sessions, audit=_FakeAudit()
        )
    # Once a second active admin exists, the guard lifts.
    _seed(users, "admin2", "company_admin")
    await team.remove_member(
        _admin(), "admin1", users=users, sessions=sessions, audit=_FakeAudit()
    )
    assert users.docs["admin1"]["status"] == "revoked"


async def test_change_role_demotion_revokes_promotion_does_not():
    users = _FakeUsers()
    _seed(users, "admin1", "company_admin")
    _seed(users, "rec1", "recruiter")
    sessions = _FakeSessions()
    # Demote recruiter -> hiring_manager: sessions revoked.
    await team.change_role(
        _admin(),
        "rec1",
        "hiring_manager",
        users=users,
        sessions=sessions,
        audit=_FakeAudit(),
    )
    assert users.docs["rec1"]["role"] == "hiring_manager"
    assert "rec1" in sessions.revoked
    # Promote hiring_manager -> recruiter: no session revoke.
    sessions2 = _FakeSessions()
    await team.change_role(
        _admin(),
        "rec1",
        "recruiter",
        users=users,
        sessions=sessions2,
        audit=_FakeAudit(),
    )
    assert sessions2.revoked == []


async def test_change_role_cannot_demote_last_admin():
    users = _FakeUsers()
    _seed(users, "admin1", "company_admin")
    with pytest.raises(ValidationError):
        await team.change_role(
            _admin(),
            "admin1",
            "recruiter",
            users=users,
            sessions=_FakeSessions(),
            audit=_FakeAudit(),
        )


async def test_concurrent_admin_demotions_never_land_zero_admins():
    # C2: two admins concurrently demoting each other used to both pass the
    # count>1 guard and both succeed, leaving the company with ZERO admins and
    # locked out. The per-company lock now serializes guard+write so exactly
    # one demotion wins; the loser sees count==1 and raises ValidationError.
    import asyncio as _asyncio

    users = _FakeUsers()
    _seed(users, "admin1", "company_admin", comp_id="C1")
    _seed(users, "admin2", "company_admin", comp_id="C1")

    async def demote(target):
        try:
            await team.change_role(
                _admin(comp_id="C1"),
                target,
                "recruiter",
                users=users,
                sessions=_FakeSessions(),
                audit=_FakeAudit(),
            )
            return "ok"
        except ValidationError:
            return "guard_tripped"

    results = await _asyncio.gather(demote("admin1"), demote("admin2"))
    # Exactly one succeeded; the other was rejected by the last-admin guard.
    assert sorted(results) == ["guard_tripped", "ok"]
    # And at least one company_admin remains active in comp C1.
    assert await users.count_active_admins("C1") == 1
