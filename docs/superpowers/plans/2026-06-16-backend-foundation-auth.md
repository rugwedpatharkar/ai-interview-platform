# Backend Foundation & Auth/Tenancy Implementation Plan

> 🛑 **SUPERSEDED — do not implement the code in this plan as written.**
> This plan predates the **library-first migration**. The project has since moved to a
> shared `libs/corelib` package and `comp_id` multi-tenancy. Specifically, this plan is
> stale on: `Organization`/`org_id` → **`Company`/`comp_id`/`company_admin`**; Motor →
> **PyMongo `AsyncMongoClient`**; passlib → corelib **bcrypt + SHA-256 pre-hash**;
> `mongomock-motor` → **fake in-memory repositories** in tests; and `backend/` →
> **`admin-service/`**. **Authoritative sources: `AUTH.md` (current auth design) +
> `HANDOFF.md` §7 + §9.**
> What's still valid here: the auth **test contracts** — the request/response shapes for
> `register/company`, `register/candidate`, `verify`, `login`, and the role/tenant guards.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the FastAPI backend foundation with a tenant-scoped MongoDB data layer and JWT auth supporting multi-recruiter company orgs and candidate accounts, with email verification and role/tenant guards.

**Architecture:** A stateless FastAPI app over MongoDB (Motor, async). Every tenant-owned document carries `org_id`; access is mediated by FastAPI dependencies that resolve the current user from a JWT and enforce role + tenant scope. Email verification and notifications go through a `Notifier` interface (stub that logs in dev). This plan delivers a runnable, fully tested auth API; later plans (jobs, applications, etc.) build on these models, repositories, and guards.

**Tech Stack:** Python 3.12, uv, FastAPI, Uvicorn, Motor, Pydantic v2 + pydantic-settings, python-jose (JWT), bcrypt (via passlib), pytest, pytest-asyncio, mongomock-motor, httpx.

> ⚠️ **No version control (private local project).** Do **not** run `git init`, create branches, or commit. Every "**Commit**" step below is left only as a logical checkpoint — treat it as "run the full test suite and confirm green," and skip all `git` commands.

---

## File Structure

```
backend/
  pyproject.toml              # uv-managed project + deps
  .env.example                # config template
  app/
    __init__.py
    main.py                   # FastAPI app factory + health route
    config.py                 # Settings (pydantic-settings)
    db.py                     # Motor client + get_db() + collection helpers
    models/
      __init__.py
      enums.py                # Role enum
      organization.py         # Organization model
      user.py                 # User model (+ in/out schemas)
    security/
      __init__.py
      passwords.py            # hash_password / verify_password
      tokens.py               # JWT + email-verification token helpers
    repositories/
      __init__.py
      base.py                 # tenant-aware helpers
      organizations.py        # OrganizationRepository
      users.py                # UserRepository
    notifications/
      __init__.py
      notifier.py             # Notifier protocol + LoggingNotifier
    api/
      __init__.py
      deps.py                 # get_current_user, require_role, tenant scope
      auth.py                 # register/verify/login routes
      protected_demo.py       # demonstrates tenant scoping (removed later)
  tests/
    __init__.py
    conftest.py               # app + db + client fixtures (mongomock-motor)
    test_health.py
    test_security.py
    test_repositories.py
    test_auth_company.py
    test_auth_candidate.py
    test_auth_login.py
    test_guards.py
```

---

### Task 1: Project scaffold + health check

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py` (empty)
- Create: `backend/app/main.py`
- Create: `backend/tests/__init__.py` (empty)
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_health.py`

- [ ] **Step 1: Initialize the uv project**

Run from project root:
```bash
cd backend
uv init --no-readme --python 3.12 . 2>/dev/null || true
uv add fastapi "uvicorn[standard]" motor "pydantic>=2" pydantic-settings "python-jose[cryptography]" "passlib[bcrypt]" httpx
uv add --dev pytest pytest-asyncio mongomock-motor
```

- [ ] **Step 2: Write `backend/pyproject.toml` pytest config**

Append to the generated `pyproject.toml`:
```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 3: Write the failing health test**

`backend/tests/test_health.py`:
```python
import pytest


@pytest.mark.asyncio
async def test_health_ok(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
```

- [ ] **Step 4: Write the conftest fixtures**

`backend/tests/conftest.py`:
```python
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app.main import create_app
from app import db as db_module


@pytest_asyncio.fixture
async def test_db():
    client = AsyncMongoMockClient()
    return client["test_db"]


@pytest_asyncio.fixture
async def client(test_db):
    app = create_app()
    app.dependency_overrides[db_module.get_db] = lambda: test_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_health.py -v`
Expected: FAIL (ImportError: cannot import name `create_app`).

- [ ] **Step 6: Write minimal app + db stub**

`backend/app/db.py`:
```python
from motor.motor_asyncio import AsyncIOMotorDatabase


def get_db() -> AsyncIOMotorDatabase:  # overridden in tests / wired in main
    raise RuntimeError("get_db not configured")
```

`backend/app/main.py`:
```python
from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="AI Interview Platform")

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_health.py -v`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "feat: scaffold FastAPI backend with health check"
```

---

### Task 2: Settings/config

**Files:**
- Create: `backend/app/config.py`
- Create: `backend/.env.example`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_health.py`:
```python
def test_settings_defaults(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "x" * 32)
    from app.config import Settings
    s = Settings()
    assert s.jwt_secret == "x" * 32
    assert s.access_token_minutes == 60
    assert s.mongo_db_name == "interview_platform"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_health.py::test_settings_defaults -v`
Expected: FAIL (ModuleNotFoundError: app.config).

- [ ] **Step 3: Write the settings**

`backend/app/config.py`:
```python
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db_name: str = "interview_platform"
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60
    email_verification_minutes: int = 1440


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

`backend/.env.example`:
```
MONGO_URI=mongodb://localhost:27017
MONGO_DB_NAME=interview_platform
JWT_SECRET=change-me-to-a-long-random-string-min-32-chars
ACCESS_TOKEN_MINUTES=60
EMAIL_VERIFICATION_MINUTES=1440
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_health.py::test_settings_defaults -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/config.py backend/.env.example backend/tests/test_health.py
git commit -m "feat: add typed settings via pydantic-settings"
```

---

### Task 3: Domain models + enums

**Files:**
- Create: `backend/app/models/__init__.py` (empty)
- Create: `backend/app/models/enums.py`
- Create: `backend/app/models/organization.py`
- Create: `backend/app/models/user.py`
- Create: `backend/tests/test_models.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_models.py`:
```python
from app.models.enums import Role
from app.models.user import User
from app.models.organization import Organization


def test_role_values():
    assert {r.value for r in Role} == {"org_admin", "recruiter", "candidate"}


def test_candidate_has_no_org():
    u = User(email="c@x.com", password_hash="h", role=Role.candidate)
    assert u.org_id is None
    assert u.email_verified is False


def test_org_defaults_unverified():
    o = Organization(name="Acme")
    assert o.verified is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_models.py -v`
Expected: FAIL (ModuleNotFoundError: app.models.enums).

- [ ] **Step 3: Write the models**

`backend/app/models/enums.py`:
```python
from enum import Enum


class Role(str, Enum):
    org_admin = "org_admin"
    recruiter = "recruiter"
    candidate = "candidate"
```

`backend/app/models/organization.py`:
```python
from datetime import datetime, timezone

from pydantic import BaseModel, Field


class Organization(BaseModel):
    name: str
    verified: bool = False
    plan: str = "free"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

`backend/app/models/user.py`:
```python
from datetime import datetime, timezone

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import Role


class User(BaseModel):
    email: EmailStr
    password_hash: str
    role: Role
    org_id: str | None = None
    email_verified: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_models.py -v`
Expected: PASS. (If EmailStr errors, run `uv add "pydantic[email]"`.)

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/ backend/tests/test_models.py
git commit -m "feat: add Organization/User domain models and Role enum"
```

---

### Task 4: Security — passwords + JWT/verification tokens

**Files:**
- Create: `backend/app/security/__init__.py` (empty)
- Create: `backend/app/security/passwords.py`
- Create: `backend/app/security/tokens.py`
- Create: `backend/tests/test_security.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_security.py`:
```python
import pytest

from app.security.passwords import hash_password, verify_password
from app.security.tokens import (
    create_access_token,
    decode_token,
    create_verification_token,
)


def test_password_roundtrip():
    h = hash_password("s3cret")
    assert h != "s3cret"
    assert verify_password("s3cret", h) is True
    assert verify_password("wrong", h) is False


def test_access_token_carries_claims():
    token = create_access_token(sub="u1", role="recruiter", org_id="o1")
    claims = decode_token(token)
    assert claims["sub"] == "u1"
    assert claims["role"] == "recruiter"
    assert claims["org_id"] == "o1"


def test_verification_token_is_purpose_scoped():
    token = create_verification_token(sub="u1")
    claims = decode_token(token)
    assert claims["purpose"] == "email_verify"
    assert claims["sub"] == "u1"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_security.py -v` (set `JWT_SECRET` first: `export JWT_SECRET=$(python -c "print('x'*40)")`)
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Write password helpers**

`backend/app/security/passwords.py`:
```python
from passlib.context import CryptContext

_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _ctx.verify(plain, hashed)
```

- [ ] **Step 4: Write token helpers**

`backend/app/security/tokens.py`:
```python
from datetime import datetime, timedelta, timezone

from jose import jwt

from app.config import get_settings


def _encode(claims: dict, minutes: int) -> str:
    s = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    return jwt.encode({**claims, "exp": exp}, s.jwt_secret, algorithm=s.jwt_algorithm)


def create_access_token(sub: str, role: str, org_id: str | None) -> str:
    s = get_settings()
    return _encode(
        {"sub": sub, "role": role, "org_id": org_id}, s.access_token_minutes
    )


def create_verification_token(sub: str) -> str:
    s = get_settings()
    return _encode(
        {"sub": sub, "purpose": "email_verify"}, s.email_verification_minutes
    )


def decode_token(token: str) -> dict:
    s = get_settings()
    return jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && JWT_SECRET=$(python -c "print('x'*40)") uv run pytest tests/test_security.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/security/ backend/tests/test_security.py
git commit -m "feat: add password hashing and JWT/verification token helpers"
```

---

### Task 5: Repositories (tenant-aware)

**Files:**
- Create: `backend/app/repositories/__init__.py` (empty)
- Create: `backend/app/repositories/organizations.py`
- Create: `backend/app/repositories/users.py`
- Create: `backend/tests/test_repositories.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_repositories.py`:
```python
import pytest

from app.models.enums import Role
from app.models.organization import Organization
from app.models.user import User
from app.repositories.organizations import OrganizationRepository
from app.repositories.users import UserRepository


@pytest.mark.asyncio
async def test_create_and_find_org(test_db):
    repo = OrganizationRepository(test_db)
    org_id = await repo.create(Organization(name="Acme"))
    found = await repo.get(org_id)
    assert found["name"] == "Acme"


@pytest.mark.asyncio
async def test_user_lookup_by_email_is_unique(test_db):
    repo = UserRepository(test_db)
    await repo.create(User(email="a@x.com", password_hash="h", role=Role.candidate))
    assert await repo.get_by_email("a@x.com") is not None
    assert await repo.get_by_email("missing@x.com") is None


@pytest.mark.asyncio
async def test_set_email_verified(test_db):
    repo = UserRepository(test_db)
    uid = await repo.create(User(email="b@x.com", password_hash="h", role=Role.candidate))
    await repo.set_email_verified(uid)
    assert (await repo.get(uid))["email_verified"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_repositories.py -v`
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Write repositories**

`backend/app/repositories/organizations.py`:
```python
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.organization import Organization


class OrganizationRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.col = db["organizations"]

    async def create(self, org: Organization) -> str:
        res = await self.col.insert_one(org.model_dump())
        return str(res.inserted_id)

    async def get(self, org_id: str) -> dict | None:
        return await self.col.find_one({"_id": ObjectId(org_id)})
```

`backend/app/repositories/users.py`:
```python
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.user import User


class UserRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.col = db["users"]

    async def create(self, user: User) -> str:
        res = await self.col.insert_one(user.model_dump())
        return str(res.inserted_id)

    async def get(self, user_id: str) -> dict | None:
        return await self.col.find_one({"_id": ObjectId(user_id)})

    async def get_by_email(self, email: str) -> dict | None:
        return await self.col.find_one({"email": email})

    async def set_email_verified(self, user_id: str) -> None:
        await self.col.update_one(
            {"_id": ObjectId(user_id)}, {"$set": {"email_verified": True}}
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_repositories.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/repositories/ backend/tests/test_repositories.py
git commit -m "feat: add Organization and User repositories"
```

---

### Task 6: Notifier interface (stub)

**Files:**
- Create: `backend/app/notifications/__init__.py` (empty)
- Create: `backend/app/notifications/notifier.py`
- Create: `backend/tests/test_notifier.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_notifier.py`:
```python
import pytest

from app.notifications.notifier import LoggingNotifier


@pytest.mark.asyncio
async def test_logging_notifier_records_sent():
    n = LoggingNotifier()
    await n.send_email("a@x.com", "Verify", "link")
    assert n.sent == [("a@x.com", "Verify", "link")]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_notifier.py -v`
Expected: FAIL (ModuleNotFoundError).

- [ ] **Step 3: Write the notifier**

`backend/app/notifications/notifier.py`:
```python
from typing import Protocol


class Notifier(Protocol):
    async def send_email(self, to: str, subject: str, body: str) -> None: ...


class LoggingNotifier:
    """Dev/test notifier — records messages instead of sending."""

    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str]] = []

    async def send_email(self, to: str, subject: str, body: str) -> None:
        self.sent.append((to, subject, body))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_notifier.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/notifications/ backend/tests/test_notifier.py
git commit -m "feat: add Notifier protocol with logging stub"
```

---

### Task 7: Company registration (org + admin) + DI wiring

**Files:**
- Create: `backend/app/api/__init__.py` (empty)
- Create: `backend/app/api/deps.py`
- Create: `backend/app/api/auth.py`
- Modify: `backend/app/main.py` (mount auth router, wire real `get_db`)
- Create: `backend/tests/test_auth_company.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_auth_company.py`:
```python
import pytest


@pytest.mark.asyncio
async def test_register_company_creates_org_and_admin(client, test_db, notifier):
    resp = await client.post(
        "/auth/register/company",
        json={"org_name": "Acme", "email": "boss@acme.com", "password": "pw12345"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["role"] == "org_admin"
    assert body["org_id"]
    assert body["email_verified"] is False
    # verification email queued
    assert notifier.sent and notifier.sent[0][0] == "boss@acme.com"


@pytest.mark.asyncio
async def test_register_company_rejects_duplicate_email(client):
    payload = {"org_name": "A", "email": "dup@x.com", "password": "pw12345"}
    await client.post("/auth/register/company", json=payload)
    resp = await client.post("/auth/register/company", json=payload)
    assert resp.status_code == 409
```

- [ ] **Step 2: Add `notifier` + db deps + fixture**

Add to `backend/app/api/deps.py`:
```python
from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db import get_db
from app.notifications.notifier import LoggingNotifier, Notifier
from app.repositories.organizations import OrganizationRepository
from app.repositories.users import UserRepository

_notifier = LoggingNotifier()


def get_notifier() -> Notifier:
    return _notifier


def get_org_repo(db: AsyncIOMotorDatabase = Depends(get_db)) -> OrganizationRepository:
    return OrganizationRepository(db)


def get_user_repo(db: AsyncIOMotorDatabase = Depends(get_db)) -> UserRepository:
    return UserRepository(db)
```

Add to `backend/tests/conftest.py`:
```python
import pytest
from app.api import deps as deps_module


@pytest.fixture
def notifier():
    deps_module._notifier.sent.clear()
    return deps_module._notifier
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_auth_company.py -v`
Expected: FAIL (404 — route not mounted).

- [ ] **Step 4: Write the auth router (company registration)**

`backend/app/api/auth.py`:
```python
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.api.deps import get_notifier, get_org_repo, get_user_repo
from app.models.enums import Role
from app.models.organization import Organization
from app.models.user import User
from app.notifications.notifier import Notifier
from app.repositories.organizations import OrganizationRepository
from app.repositories.users import UserRepository
from app.security.passwords import hash_password
from app.security.tokens import create_verification_token

router = APIRouter(prefix="/auth", tags=["auth"])


class CompanyRegisterIn(BaseModel):
    org_name: str
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    role: Role
    org_id: str | None
    email_verified: bool


async def _send_verification(notifier: Notifier, user_id: str, email: str) -> None:
    token = create_verification_token(sub=user_id)
    await notifier.send_email(email, "Verify your email", f"/verify?token={token}")


@router.post("/register/company", status_code=status.HTTP_201_CREATED, response_model=UserOut)
async def register_company(
    body: CompanyRegisterIn,
    orgs: OrganizationRepository = Depends(get_org_repo),
    users: UserRepository = Depends(get_user_repo),
    notifier: Notifier = Depends(get_notifier),
):
    if await users.get_by_email(body.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    org_id = await orgs.create(Organization(name=body.org_name))
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        role=Role.org_admin,
        org_id=org_id,
    )
    user_id = await users.create(user)
    await _send_verification(notifier, user_id, body.email)
    return UserOut(
        id=user_id, email=body.email, role=Role.org_admin,
        org_id=org_id, email_verified=False,
    )
```

- [ ] **Step 5: Wire router + real get_db in `main.py`**

Replace `backend/app/main.py`:
```python
from fastapi import FastAPI
from motor.motor_asyncio import AsyncIOMotorClient

from app.api.auth import router as auth_router
from app.config import get_settings
from app import db as db_module


def create_app() -> FastAPI:
    app = FastAPI(title="AI Interview Platform")

    @app.on_event("startup")
    async def _startup():
        s = get_settings()
        app.state.mongo = AsyncIOMotorClient(s.mongo_uri)
        real_db = app.state.mongo[s.mongo_db_name]
        app.dependency_overrides.setdefault(db_module.get_db, lambda: real_db)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    app.include_router(auth_router)
    return app


app = create_app()
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && JWT_SECRET=$(python -c "print('x'*40)") uv run pytest tests/test_auth_company.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/ backend/app/main.py backend/tests/
git commit -m "feat: company registration creates org + admin and sends verification"
```

---

### Task 8: Email verification endpoint

**Files:**
- Modify: `backend/app/api/auth.py` (add `/auth/verify`)
- Create: `backend/tests/test_auth_verify.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_auth_verify.py`:
```python
import pytest

from app.security.tokens import create_verification_token, create_access_token


@pytest.mark.asyncio
async def test_verify_marks_user_verified(client, notifier):
    await client.post(
        "/auth/register/company",
        json={"org_name": "Acme", "email": "v@acme.com", "password": "pw12345"},
    )
    # token sent in the email body: "/verify?token=..."
    token = notifier.sent[0][2].split("token=")[1]
    resp = await client.post("/auth/verify", json={"token": token})
    assert resp.status_code == 200
    assert resp.json()["email_verified"] is True


@pytest.mark.asyncio
async def test_verify_rejects_wrong_purpose(client):
    bad = create_access_token(sub="u1", role="candidate", org_id=None)
    resp = await client.post("/auth/verify", json={"token": bad})
    assert resp.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && JWT_SECRET=$(python -c "print('x'*40)") uv run pytest tests/test_auth_verify.py -v`
Expected: FAIL (404).

- [ ] **Step 3: Add the verify route**

Append to `backend/app/api/auth.py`:
```python
from jose import JWTError

from app.security.tokens import decode_token


class VerifyIn(BaseModel):
    token: str


@router.post("/verify", response_model=UserOut)
async def verify_email(
    body: VerifyIn,
    users: UserRepository = Depends(get_user_repo),
):
    try:
        claims = decode_token(body.token)
    except JWTError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid token")
    if claims.get("purpose") != "email_verify":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Wrong token purpose")
    user = await users.get(claims["sub"])
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    await users.set_email_verified(claims["sub"])
    return UserOut(
        id=claims["sub"], email=user["email"], role=user["role"],
        org_id=user.get("org_id"), email_verified=True,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && JWT_SECRET=$(python -c "print('x'*40)") uv run pytest tests/test_auth_verify.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/auth.py backend/tests/test_auth_verify.py
git commit -m "feat: add email verification endpoint"
```

---

### Task 9: Candidate registration

**Files:**
- Modify: `backend/app/api/auth.py` (add `/auth/register/candidate`)
- Create: `backend/tests/test_auth_candidate.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_auth_candidate.py`:
```python
import pytest


@pytest.mark.asyncio
async def test_register_candidate_has_no_org(client, notifier):
    resp = await client.post(
        "/auth/register/candidate",
        json={"email": "cand@x.com", "password": "pw12345"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["role"] == "candidate"
    assert body["org_id"] is None
    assert notifier.sent[-1][0] == "cand@x.com"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && JWT_SECRET=$(python -c "print('x'*40)") uv run pytest tests/test_auth_candidate.py -v`
Expected: FAIL (404).

- [ ] **Step 3: Add the candidate route**

Append to `backend/app/api/auth.py`:
```python
class CandidateRegisterIn(BaseModel):
    email: EmailStr
    password: str


@router.post(
    "/register/candidate", status_code=status.HTTP_201_CREATED, response_model=UserOut
)
async def register_candidate(
    body: CandidateRegisterIn,
    users: UserRepository = Depends(get_user_repo),
    notifier: Notifier = Depends(get_notifier),
):
    if await users.get_by_email(body.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user_id = await users.create(
        User(
            email=body.email,
            password_hash=hash_password(body.password),
            role=Role.candidate,
        )
    )
    await _send_verification(notifier, user_id, body.email)
    return UserOut(
        id=user_id, email=body.email, role=Role.candidate,
        org_id=None, email_verified=False,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && JWT_SECRET=$(python -c "print('x'*40)") uv run pytest tests/test_auth_candidate.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/auth.py backend/tests/test_auth_candidate.py
git commit -m "feat: add candidate registration"
```

---

### Task 10: Login (JWT)

**Files:**
- Modify: `backend/app/api/auth.py` (add `/auth/login`)
- Create: `backend/tests/test_auth_login.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_auth_login.py`:
```python
import pytest

from app.security.tokens import decode_token


@pytest.mark.asyncio
async def test_login_returns_token_with_claims(client):
    await client.post(
        "/auth/register/company",
        json={"org_name": "Acme", "email": "boss@acme.com", "password": "pw12345"},
    )
    resp = await client.post(
        "/auth/login", json={"email": "boss@acme.com", "password": "pw12345"}
    )
    assert resp.status_code == 200
    claims = decode_token(resp.json()["access_token"])
    assert claims["role"] == "org_admin"
    assert claims["org_id"]


@pytest.mark.asyncio
async def test_login_wrong_password_401(client):
    await client.post(
        "/auth/register/candidate",
        json={"email": "c@x.com", "password": "pw12345"},
    )
    resp = await client.post(
        "/auth/login", json={"email": "c@x.com", "password": "nope"}
    )
    assert resp.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && JWT_SECRET=$(python -c "print('x'*40)") uv run pytest tests/test_auth_login.py -v`
Expected: FAIL (404).

- [ ] **Step 3: Add the login route**

Append to `backend/app/api/auth.py`:
```python
from app.security.passwords import verify_password
from app.security.tokens import create_access_token


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=TokenOut)
async def login(
    body: LoginIn,
    users: UserRepository = Depends(get_user_repo),
):
    user = await users.get_by_email(body.email)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    token = create_access_token(
        sub=str(user["_id"]), role=user["role"], org_id=user.get("org_id")
    )
    return TokenOut(access_token=token)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && JWT_SECRET=$(python -c "print('x'*40)") uv run pytest tests/test_auth_login.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/auth.py backend/tests/test_auth_login.py
git commit -m "feat: add login endpoint issuing JWT"
```

---

### Task 11: Auth dependencies — current user + role/tenant guards

**Files:**
- Modify: `backend/app/api/deps.py` (add `get_current_user`, `require_role`)
- Create: `backend/app/api/protected_demo.py`
- Modify: `backend/app/main.py` (mount demo router)
- Create: `backend/tests/test_guards.py`

- [ ] **Step 1: Write the failing test**

`backend/tests/test_guards.py`:
```python
import pytest


async def _login(client, email, password):
    r = await client.post("/auth/login", json={"email": email, "password": password})
    return r.json()["access_token"]


@pytest.mark.asyncio
async def test_me_requires_auth(client):
    assert (await client.get("/me")).status_code == 401


@pytest.mark.asyncio
async def test_me_returns_identity(client):
    await client.post(
        "/auth/register/company",
        json={"org_name": "Acme", "email": "boss@acme.com", "password": "pw12345"},
    )
    token = await _login(client, "boss@acme.com", "pw12345")
    r = await client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["role"] == "org_admin"


@pytest.mark.asyncio
async def test_recruiter_only_route_blocks_candidate(client):
    await client.post(
        "/auth/register/candidate",
        json={"email": "c@x.com", "password": "pw12345"},
    )
    token = await _login(client, "c@x.com", "pw12345")
    r = await client.get("/recruiter-only", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && JWT_SECRET=$(python -c "print('x'*40)") uv run pytest tests/test_guards.py -v`
Expected: FAIL (404 on /me).

- [ ] **Step 3: Add current-user + role guard deps**

Append to `backend/app/api/deps.py`:
```python
from dataclasses import dataclass

from fastapi import HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.models.enums import Role
from app.security.tokens import decode_token

_bearer = HTTPBearer(auto_error=False)


@dataclass
class CurrentUser:
    id: str
    role: Role
    org_id: str | None


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> CurrentUser:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        claims = decode_token(creds.credentials)
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    return CurrentUser(
        id=claims["sub"], role=Role(claims["role"]), org_id=claims.get("org_id")
    )


def require_role(*allowed: Role):
    def _guard(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
        return user
    return _guard
```

- [ ] **Step 4: Add demo routes + mount**

`backend/app/api/protected_demo.py`:
```python
from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, get_current_user, require_role
from app.models.enums import Role

router = APIRouter()


@router.get("/me")
async def me(user: CurrentUser = Depends(get_current_user)):
    return {"id": user.id, "role": user.role.value, "org_id": user.org_id}


@router.get("/recruiter-only")
async def recruiter_only(
    user: CurrentUser = Depends(require_role(Role.org_admin, Role.recruiter)),
):
    return {"ok": True, "org_id": user.org_id}
```

Add to `create_app()` in `backend/app/main.py` (after the auth router include):
```python
    from app.api.protected_demo import router as demo_router
    app.include_router(demo_router)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && JWT_SECRET=$(python -c "print('x'*40)") uv run pytest tests/test_guards.py -v`
Expected: PASS.

- [ ] **Step 6: Run the full suite + commit**

Run: `cd backend && JWT_SECRET=$(python -c "print('x'*40)") uv run pytest -v`
Expected: ALL PASS.
```bash
git add backend/
git commit -m "feat: add current-user resolution and role/tenant guards"
```

---

## Verification (whole plan)

- [ ] `cd backend && JWT_SECRET=$(python -c "print('x'*40)") uv run pytest -v` → all green.
- [ ] Manual: `cd backend && JWT_SECRET=... uv run uvicorn app.main:app --reload`, then via `/docs`: register a company, copy the verification token from the server log (LoggingNotifier), POST `/auth/verify`, `/auth/login`, call `/me` with the bearer token, confirm `/recruiter-only` 403s for a candidate token.
- [ ] Tenant boundary holds: `org_id` is present on org users, `None` on candidates, and carried in the JWT.

## Notes for later plans (handoff)

- `CurrentUser` + `require_role` are the entry points every later router uses. Job/application repositories will accept `org_id` and filter on it for tenant isolation.
- `Notifier` will gain real email in the notifications plan; keep the `LoggingNotifier` for tests.
- Swap `@app.on_event("startup")` for a lifespan handler if FastAPI deprecation warnings appear.
