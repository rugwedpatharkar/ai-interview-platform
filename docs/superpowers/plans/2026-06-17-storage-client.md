# Storage Client (`corelib/storage`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tenant-aware, S3-compatible async object-storage client to corelib for resume upload/serve (Epic C, P1).

**Architecture:** A single `ObjectStorage` class in `corelib/storage` over aioboto3. Keys are namespaced `{comp_id}/{category}/{key}`; objects are encrypted at rest (SSE-S3); timeouts + bounded retries live on the botocore `Config`; a long-lived S3 client opens in `connect()` (mirroring `MongoManager`/`Publisher`). Unit tests inject a `FakeS3Client` (no real S3, mirroring the existing `FakeCollection`/`FakeRedis`/`FakeMessage`); `connect`/`close` are covered by integration later.

**Tech Stack:** Python 3.12, aioboto3>=13 (aiobotocore/botocore), pydantic-settings, pytest + pytest-asyncio.

**Spec:** `docs/superpowers/specs/2026-06-17-storage-client-design.md`.

## Global Constraints

- Python 3.12, async, Pydantic v2; mirror corelib patterns (lifecycle like `MongoManager`/`Publisher`; fake-injection tests).
- Production bar (`docs/superpowers/plans/PRODUCTION_STANDARDS.md`): validate at boundaries, secrets from env only, timeouts + bounded retries on every external call, tenant isolation via `comp_id`.
- Keys are exactly `{comp_id}/{category}/{key}`; SSE-S3 (`AES256`) on every put; presign default **900s**; **no presigned PUT** (uploads are server-proxied).
- **No git — local-only project.** There are no commit steps; "verify green" means run the gate. Do NOT run any `git`/`gh` command.
- Gate: `bash scripts/check.sh` (ruff incl. `S`/`ASYNC` + pip-audit + corelib pytest) must stay green.
- Run corelib tests from `libs/corelib`: `../../.venv/bin/python -m pytest -q`.

---

### Task 1: aioboto3 dependency + S3 settings

**Files:**
- Modify: `libs/corelib/pyproject.toml` (add dependency)
- Modify: `libs/corelib/corelib/config.py` (add S3 settings)
- Test: `libs/corelib/tests/test_config.py` (create)

**Interfaces:**
- Produces: `BaseServiceSettings` fields `s3_endpoint_url: str | None`, `s3_region: str`, `s3_access_key_id: str`, `s3_secret_access_key: str`, `s3_bucket: str`, `storage_presign_ttl_seconds: int`.

- [ ] **Step 1: Write the failing test**

Create `libs/corelib/tests/test_config.py`:
```python
from corelib.config import BaseServiceSettings


def test_s3_settings_defaults(monkeypatch):
    for var in ("S3_ENDPOINT_URL", "S3_REGION", "S3_BUCKET", "STORAGE_PRESIGN_TTL_SECONDS"):
        monkeypatch.delenv(var, raising=False)
    s = BaseServiceSettings()
    assert s.s3_endpoint_url is None
    assert s.s3_region == "auto"
    assert s.s3_bucket == "interview-platform"
    assert s.storage_presign_ttl_seconds == 900
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest tests/test_config.py -q`
Expected: FAIL (`AttributeError: 'BaseServiceSettings' object has no attribute 's3_endpoint_url'`).

- [ ] **Step 3: Add the S3 settings**

Append inside `class BaseServiceSettings` in `libs/corelib/corelib/config.py` (after the JWT block):
```python
    # Object storage (S3-compatible: Cloudflare R2 / MinIO). Secrets via env only.
    s3_endpoint_url: str | None = None
    s3_region: str = "auto"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_bucket: str = "interview-platform"
    storage_presign_ttl_seconds: int = 900
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest tests/test_config.py -q`
Expected: PASS.

- [ ] **Step 5: Add and install the aioboto3 dependency**

Add `"aioboto3>=13",` to the `dependencies` list in `libs/corelib/pyproject.toml`, then install:
```bash
/Users/rugwedpatharkar/Projects/Project/.venv/bin/python -m pip install "aioboto3>=13"
```
Expected: installs aioboto3 + aiobotocore + botocore.

- [ ] **Step 6: Verify green**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest -q`
Expected: PASS (all existing tests + the new config test).

---

### Task 2: `ObjectStorage` skeleton + tenant key builder

**Files:**
- Create: `libs/corelib/corelib/storage/__init__.py`
- Create: `libs/corelib/corelib/storage/client.py`
- Test: `libs/corelib/tests/test_storage.py` (create)

**Interfaces:**
- Consumes: aioboto3, botocore `Config`.
- Produces: `ObjectStorage(endpoint_url: str | None, region: str, access_key_id: str, secret_access_key: str, bucket: str, presign_ttl_seconds: int = 900)`; `async connect()`; `async close()`; `staticmethod _key(comp_id: str, category: str, key: str) -> str`. Exported from `corelib.storage`.

- [ ] **Step 1: Write the failing test**

Create `libs/corelib/tests/test_storage.py`:
```python
import pytest

from corelib.storage import ObjectStorage


def test_key_builds_tenant_prefix():
    assert ObjectStorage._key("c1", "resumes", "u1.pdf") == "c1/resumes/u1.pdf"


def test_key_rejects_empty_parts():
    with pytest.raises(ValueError):
        ObjectStorage._key("", "resumes", "u1.pdf")
    with pytest.raises(ValueError):
        ObjectStorage._key("c1", "", "u1.pdf")
    with pytest.raises(ValueError):
        ObjectStorage._key("c1", "resumes", "")
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest tests/test_storage.py -q`
Expected: FAIL (`ModuleNotFoundError: No module named 'corelib.storage'`).

- [ ] **Step 3: Write the skeleton**

Create `libs/corelib/corelib/storage/client.py`:
```python
from typing import Any

import aioboto3
from botocore.config import Config


class ObjectStorage:
    """Tenant-aware async object-storage client over an S3-compatible backend.

    Keys are namespaced `{comp_id}/{category}/{key}` so a caller cannot read or write
    outside its tenant. Objects are encrypted at rest (SSE-S3). One instance per
    service process: `connect()` on startup, `close()` on shutdown.
    """

    def __init__(
        self,
        endpoint_url: str | None,
        region: str,
        access_key_id: str,
        secret_access_key: str,
        bucket: str,
        presign_ttl_seconds: int = 900,
    ) -> None:
        self._endpoint_url = endpoint_url
        self._region = region
        self._access_key_id = access_key_id
        self._secret_access_key = secret_access_key
        self._bucket = bucket
        self._presign_ttl = presign_ttl_seconds
        self._session = aioboto3.Session()
        self._config = Config(
            connect_timeout=5,
            read_timeout=30,
            retries={"max_attempts": 3, "mode": "standard"},
        )
        self._client_cm: Any = None
        self._client: Any = None

    async def connect(self) -> None:
        self._client_cm = self._session.client(
            "s3",
            endpoint_url=self._endpoint_url,
            region_name=self._region,
            aws_access_key_id=self._access_key_id,
            aws_secret_access_key=self._secret_access_key,
            config=self._config,
        )
        self._client = await self._client_cm.__aenter__()

    async def close(self) -> None:
        if self._client_cm is not None:
            await self._client_cm.__aexit__(None, None, None)
            self._client = None
            self._client_cm = None

    @staticmethod
    def _key(comp_id: str, category: str, key: str) -> str:
        if not (comp_id and category and key):
            raise ValueError("comp_id, category, and key must all be non-empty")
        return f"{comp_id}/{category}/{key}"
```

Create `libs/corelib/corelib/storage/__init__.py`:
```python
from corelib.storage.client import ObjectStorage

__all__ = ["ObjectStorage"]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest tests/test_storage.py -q`
Expected: PASS.

- [ ] **Step 5: Verify green**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest -q`
Expected: PASS (all tests).

---

### Task 3: `put` + `get` (write/read, encrypted, tenant-scoped)

**Files:**
- Modify: `libs/corelib/corelib/storage/client.py` (add `put`, `get`)
- Modify: `libs/corelib/tests/test_storage.py` (add fakes + tests)

**Interfaces:**
- Consumes: `ObjectStorage`, `_key`.
- Produces: `async put(comp_id, category, key, data: bytes, content_type: str) -> str` (returns the full object key); `async get(comp_id, category, key) -> bytes`.

- [ ] **Step 1: Write the failing tests**

Append to `libs/corelib/tests/test_storage.py`:
```python
class _FakeBody:
    def __init__(self, data: bytes):
        self._data = data

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def read(self) -> bytes:
        return self._data


class FakeS3Client:
    """Async stand-in for an aioboto3 S3 client (subset ObjectStorage uses)."""

    def __init__(self):
        self.objects: dict[str, dict] = {}
        self.deleted: list[str] = []

    async def put_object(self, **kw):
        self.objects[kw["Key"]] = kw
        return {}

    async def get_object(self, *, Bucket, Key):
        return {"Body": _FakeBody(self.objects[Key]["Body"])}

    async def delete_object(self, *, Bucket, Key):
        self.deleted.append(Key)
        return {}

    async def generate_presigned_url(self, client_method, *, Params, ExpiresIn):
        return f"https://example/{Params['Key']}?exp={ExpiresIn}"


def _storage_with_fake() -> ObjectStorage:
    s = ObjectStorage(None, "auto", "ak", "sk", "bucket")
    s._client = FakeS3Client()
    return s


@pytest.mark.asyncio
async def test_put_stores_encrypted_tenant_key():
    s = _storage_with_fake()
    object_key = await s.put("c1", "resumes", "u1.pdf", b"PDF", "application/pdf")
    assert object_key == "c1/resumes/u1.pdf"
    stored = s._client.objects["c1/resumes/u1.pdf"]
    assert stored["Bucket"] == "bucket"
    assert stored["Body"] == b"PDF"
    assert stored["ContentType"] == "application/pdf"
    assert stored["ServerSideEncryption"] == "AES256"


@pytest.mark.asyncio
async def test_get_round_trips_bytes():
    s = _storage_with_fake()
    await s.put("c1", "resumes", "u1.pdf", b"PDFDATA", "application/pdf")
    assert await s.get("c1", "resumes", "u1.pdf") == b"PDFDATA"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest tests/test_storage.py -q`
Expected: FAIL (`AttributeError: 'ObjectStorage' object has no attribute 'put'`).

- [ ] **Step 3: Implement `put` and `get`**

Add these methods to `ObjectStorage` in `libs/corelib/corelib/storage/client.py` (after `_key`):
```python
    async def put(
        self, comp_id: str, category: str, key: str, data: bytes, content_type: str
    ) -> str:
        object_key = self._key(comp_id, category, key)
        await self._client.put_object(
            Bucket=self._bucket,
            Key=object_key,
            Body=data,
            ContentType=content_type,
            ServerSideEncryption="AES256",
        )
        return object_key

    async def get(self, comp_id: str, category: str, key: str) -> bytes:
        resp = await self._client.get_object(
            Bucket=self._bucket, Key=self._key(comp_id, category, key)
        )
        async with resp["Body"] as body:
            return await body.read()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest tests/test_storage.py -q`
Expected: PASS.

- [ ] **Step 5: Verify green**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest -q`
Expected: PASS (all tests).

---

### Task 4: `presigned_get_url` + `delete`

**Files:**
- Modify: `libs/corelib/corelib/storage/client.py` (add `presigned_get_url`, `delete`)
- Modify: `libs/corelib/tests/test_storage.py` (add tests)

**Interfaces:**
- Consumes: `ObjectStorage`, `_key`, `FakeS3Client`/`_storage_with_fake` (from Task 3).
- Produces: `async presigned_get_url(comp_id, category, key, ttl: int | None = None) -> str`; `async delete(comp_id, category, key) -> None`.

- [ ] **Step 1: Write the failing tests**

Append to `libs/corelib/tests/test_storage.py`:
```python
@pytest.mark.asyncio
async def test_presigned_get_url_scoped_with_ttl():
    s = _storage_with_fake()
    url = await s.presigned_get_url("c1", "resumes", "u1.pdf")
    assert "c1/resumes/u1.pdf" in url
    assert "exp=900" in url  # default TTL
    url2 = await s.presigned_get_url("c1", "resumes", "u1.pdf", ttl=60)
    assert "exp=60" in url2  # per-call override


@pytest.mark.asyncio
async def test_delete_removes_tenant_key():
    s = _storage_with_fake()
    await s.put("c1", "resumes", "u1.pdf", b"X", "application/pdf")
    await s.delete("c1", "resumes", "u1.pdf")
    assert "c1/resumes/u1.pdf" in s._client.deleted
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest tests/test_storage.py -q`
Expected: FAIL (`AttributeError: 'ObjectStorage' object has no attribute 'presigned_get_url'`).

- [ ] **Step 3: Implement `presigned_get_url` and `delete`**

Add these methods to `ObjectStorage` in `libs/corelib/corelib/storage/client.py` (after `get`):
```python
    async def presigned_get_url(
        self, comp_id: str, category: str, key: str, ttl: int | None = None
    ) -> str:
        return await self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": self._key(comp_id, category, key)},
            ExpiresIn=ttl or self._presign_ttl,
        )

    async def delete(self, comp_id: str, category: str, key: str) -> None:
        await self._client.delete_object(
            Bucket=self._bucket, Key=self._key(comp_id, category, key)
        )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd libs/corelib && ../../.venv/bin/python -m pytest tests/test_storage.py -q`
Expected: PASS.

- [ ] **Step 5: Verify the whole gate is green**

Run: `bash scripts/check.sh`
Expected: `==> GATE PASSED` (ruff format + lint incl. `S`/`ASYNC`, pip-audit, corelib pytest with the new storage + config tests).

---

## Verification (whole plan)

- [ ] `bash scripts/check.sh` → GATE PASSED.
- [ ] `corelib.storage` exports `ObjectStorage`; methods `put`/`get`/`presigned_get_url`/`delete` all tenant-scope via `_key` and reject empty key parts.
- [ ] Every `put` sets `ServerSideEncryption="AES256"`; there is **no** presigned-PUT method.
- [ ] `pip-audit` clean for the aioboto3/botocore chain. If a CVE surfaces, report it and pin/upgrade — do not silently ignore.

## Notes for the consumer (admin-service, later plan)

- `POST /profiles/resume` validates content-type + size **at the boundary**, then calls `put(comp_id, "resumes", f"{candidate_id}/{uuid4()}.pdf", data, content_type)` and persists the returned object key on the candidate profile.
- Serve/download issues `presigned_get_url(comp_id, "resumes", key)`; retention/GDPR uses `delete(...)`.
- `comp_id` comes from the authenticated token, never client input.
