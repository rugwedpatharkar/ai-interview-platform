"""resources/settings — notification prefs + TOTP 2FA (defaults + validation)."""

import pytest
from lib.security import TokenService, hash_password, verify_password

from app.errors import ConflictError, InvalidTokenError, ValidationError
from app.resources import settings

_TOKENS = TokenService("s" * 40)


class _FakeUsers:
    def __init__(self, doc):
        self._doc = doc

    async def get(self, user_id):
        return self._doc

    async def update_fields(self, user_id, fields):
        self._doc.update(fields)


class _FakeTotp:
    """Deterministic stand-in: secret 'S', the only valid code is '123456'."""

    def new_secret(self):
        return "S"

    def provisioning_uri(self, secret, *, account):
        return f"otpauth://totp/{account}?secret={secret}"

    def verify(self, secret, code):
        return secret == "S" and code == "123456"


class _FakeBox:
    def encrypt(self, plain):
        return f"enc:{plain}"

    def decrypt(self, token):
        return token.removeprefix("enc:")


@pytest.mark.asyncio
async def test_totp_setup_stages_encrypted_secret_disabled():
    user = {"email": "a@b.co", "totp_enabled": False}
    users = _FakeUsers(user)
    out = await settings.setup_totp(
        "u1", users=users, totp=_FakeTotp(), secretbox=_FakeBox()
    )
    assert out["secret"] == "S" and "otpauth://" in out["provisioning_uri"]
    assert user["totp_secret"] == "enc:S" and user["totp_enabled"] is False


@pytest.mark.asyncio
async def test_totp_verify_enables_and_returns_recovery_codes():
    user = {"email": "a@b.co", "totp_secret": "enc:S", "totp_enabled": False}
    users = _FakeUsers(user)
    out = await settings.verify_totp(
        "u1", "123456", users=users, totp=_FakeTotp(), secretbox=_FakeBox()
    )
    assert out["enabled"] is True and len(out["recovery_codes"]) == 10
    assert user["totp_enabled"] is True
    assert (
        user["recovery_codes"] and user["recovery_codes"][0] != out["recovery_codes"][0]
    )


@pytest.mark.asyncio
async def test_totp_verify_bad_code_rejected():
    user = {"email": "a@b.co", "totp_secret": "enc:S", "totp_enabled": False}
    with pytest.raises(ValidationError):
        await settings.verify_totp(
            "u1",
            "000000",
            users=_FakeUsers(user),
            totp=_FakeTotp(),
            secretbox=_FakeBox(),
        )
    assert user["totp_enabled"] is False


@pytest.mark.asyncio
async def test_totp_disable_with_recovery_code():

    user = {
        "totp_secret": "enc:S",
        "totp_enabled": True,
        "recovery_codes": [hash_password("rescue1")],
    }
    users = _FakeUsers(user)
    out = await settings.disable_totp(
        "u1", "rescue1", users=users, totp=_FakeTotp(), secretbox=_FakeBox()
    )
    assert out["ok"] is True
    assert user["totp_enabled"] is False and user["totp_secret"] == ""


@pytest.mark.asyncio
async def test_totp_disable_bad_code_rejected():
    user = {"totp_secret": "enc:S", "totp_enabled": True, "recovery_codes": []}
    with pytest.raises(ValidationError):
        await settings.disable_totp(
            "u1", "nope", users=_FakeUsers(user), totp=_FakeTotp(), secretbox=_FakeBox()
        )
    assert user["totp_enabled"] is True


class _FakePrefs:
    def __init__(self):
        self._docs = {}

    async def get_by_user(self, user_id):
        return self._docs.get(user_id)

    async def upsert(self, user_id, fields):
        self._docs[user_id] = {**fields, "user_id": user_id}


@pytest.mark.asyncio
async def test_get_returns_safe_defaults_when_unset():
    out = await settings.get_notification_prefs("u1", prefs=_FakePrefs())
    assert out["digest"] == "off" and out["sms_critical"] is False
    assert out["email_categories"]["security"] is True
    assert out["quiet_hours"] is None


@pytest.mark.asyncio
async def test_set_persists_and_returns_doc():
    prefs = _FakePrefs()
    out = await settings.set_notification_prefs(
        "u1",
        {
            "email_categories": {"messages": False},
            "sms_critical": True,
            "digest": "weekly",
            "quiet_hours": {"start": "22:00", "end": "07:30", "tz": "Europe/Berlin"},
        },
        prefs=prefs,
    )
    assert out["digest"] == "weekly" and out["sms_critical"] is True
    assert out["email_categories"] == {"messages": False}
    assert out["quiet_hours"] == {
        "start": "22:00",
        "end": "07:30",
        "tz": "Europe/Berlin",
    }


@pytest.mark.asyncio
async def test_set_rejects_bad_digest():
    with pytest.raises(ValidationError):
        await settings.set_notification_prefs(
            "u1", {"digest": "hourly"}, prefs=_FakePrefs()
        )


@pytest.mark.asyncio
async def test_set_rejects_bad_quiet_hours_time():
    with pytest.raises(ValidationError):
        await settings.set_notification_prefs(
            "u1",
            {
                "digest": "off",
                "quiet_hours": {"start": "25:00", "end": "07:00", "tz": "UTC"},
            },
            prefs=_FakePrefs(),
        )


@pytest.mark.asyncio
async def test_set_rejects_bad_timezone():
    with pytest.raises(ValidationError):
        await settings.set_notification_prefs(
            "u1",
            {
                "digest": "off",
                "quiet_hours": {"start": "22:00", "end": "07:00", "tz": "Mars/Phobos"},
            },
            prefs=_FakePrefs(),
        )


# --- ChangePassword + email change (L1) ---


class _UsersDb:
    def __init__(self, users):
        self.docs = {u["_id"]: u for u in users}

    async def get(self, user_id):
        return self.docs.get(user_id)

    async def get_by_email(self, email):
        return next((u for u in self.docs.values() if u.get("email") == email), None)

    async def update_fields(self, user_id, fields):
        self.docs[user_id].update(fields)


class _FakeSessions:
    def __init__(self):
        self.revoked_others = []
        self.revoked_all = []

    async def revoke_all_except(self, user_id, current_jti):
        self.revoked_others.append((user_id, current_jti))

    async def revoke_user(self, user_id):
        self.revoked_all.append(user_id)


class _FakeNotifier:
    def __init__(self):
        self.emails = []

    async def send_email(self, to, subject, body):
        self.emails.append((to, subject, body))


class _FakeNonces:
    def __init__(self):
        self.allowed = set()
        self.consumed = set()

    async def allow(self, jti, ttl):
        self.allowed.add(jti)

    async def consume(self, jti):
        if jti in self.consumed or jti not in self.allowed:
            return False
        self.consumed.add(jti)
        return True


class _FakeAudit:
    def __init__(self):
        self.records = []

    async def insert(self, entry):
        self.records.append(entry.model_dump())


@pytest.mark.asyncio
async def test_change_password_verifies_current_and_keeps_current_session():
    user = {"_id": "u1", "email": "a@b.co", "password_hash": hash_password("old12345")}
    users, sessions = _UsersDb([user]), _FakeSessions()
    out = await settings.change_password(
        "u1",
        "old12345",
        "newpass123",
        "sid1",
        users=users,
        sessions=sessions,
        audit=_FakeAudit(),
    )
    assert out["ok"] is True
    assert verify_password("newpass123", user["password_hash"])
    assert sessions.revoked_others == [("u1", "sid1")]  # other devices logged out


@pytest.mark.asyncio
async def test_change_password_wrong_current_rejected():
    user = {"_id": "u1", "password_hash": hash_password("old12345")}
    with pytest.raises(ValidationError):
        await settings.change_password(
            "u1",
            "WRONG",
            "newpass123",
            "sid1",
            users=_UsersDb([user]),
            sessions=_FakeSessions(),
        )


@pytest.mark.asyncio
async def test_change_password_sso_account_rejected():
    user = {"_id": "u1", "password_hash": ""}  # SSO-only
    with pytest.raises(ValidationError):
        await settings.change_password(
            "u1",
            "x",
            "newpass123",
            "sid1",
            users=_UsersDb([user]),
            sessions=_FakeSessions(),
        )


@pytest.mark.asyncio
async def test_change_password_too_short_rejected():
    user = {"_id": "u1", "password_hash": hash_password("old12345")}
    with pytest.raises(ValidationError):
        await settings.change_password(
            "u1",
            "old12345",
            "short",
            "sid1",
            users=_UsersDb([user]),
            sessions=_FakeSessions(),
        )


@pytest.mark.asyncio
async def test_change_password_without_sid_revokes_all():
    user = {"_id": "u1", "password_hash": hash_password("old12345")}
    users, sessions = _UsersDb([user]), _FakeSessions()
    await settings.change_password(
        "u1", "old12345", "newpass123", None, users=users, sessions=sessions
    )
    assert sessions.revoked_all == ["u1"]  # no sid -> log out everywhere


@pytest.mark.asyncio
async def test_request_email_change_stages_pending_and_emails_new_address():
    user = {"_id": "u1", "email": "old@b.co"}
    users, notifier, nonces = _UsersDb([user]), _FakeNotifier(), _FakeNonces()
    out = await settings.request_email_change(
        "u1",
        "New@B.co",
        users=users,
        tokens=_TOKENS,
        notifier=notifier,
        nonces=nonces,
        audit=_FakeAudit(),
    )
    assert out["ok"] is True
    assert user["pending_email"] == "new@b.co"  # normalized, staged
    assert notifier.emails and notifier.emails[0][0] == "new@b.co"
    assert "/verify-email?token=" in notifier.emails[0][2]


@pytest.mark.asyncio
async def test_request_email_change_duplicate_rejected():
    users = _UsersDb(
        [{"_id": "u1", "email": "old@b.co"}, {"_id": "u2", "email": "taken@b.co"}]
    )
    with pytest.raises(ConflictError):
        await settings.request_email_change(
            "u1",
            "taken@b.co",
            users=users,
            tokens=_TOKENS,
            notifier=_FakeNotifier(),
            nonces=_FakeNonces(),
        )


@pytest.mark.asyncio
async def test_verify_email_change_swaps_email_and_rejects_replay():
    user = {"_id": "u1", "email": "old@b.co", "pending_email": "new@b.co"}
    users, nonces = _UsersDb([user]), _FakeNonces()
    token = _TOKENS.verification_token(sub="u1", jti="n1")
    await nonces.allow("n1", 100)
    out = await settings.verify_email_change(
        token, users=users, tokens=_TOKENS, nonces=nonces, audit=_FakeAudit()
    )
    assert out["ok"] is True
    assert user["email"] == "new@b.co"
    assert user["pending_email"] == "" and user["email_verified"] is True
    with pytest.raises(InvalidTokenError):  # nonce already consumed
        await settings.verify_email_change(
            token, users=users, tokens=_TOKENS, nonces=nonces
        )
