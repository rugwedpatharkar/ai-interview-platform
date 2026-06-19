# Storage Client (`corelib/storage`) — Design Spec

> A tenant-aware, S3-compatible (Cloudflare R2 / MinIO) **async object-storage client**
> in corelib — used first by admin-service for **resume upload + serve** (Epic C, P1),
> and recordings later (P4). Built to `PRODUCTION_STANDARDS.md`. Approved 2026-06-17.
> Local-only project — no git commit.

## 1. Goal & scope

A minimal, production-grade object-storage client in `corelib/storage` providing
**put / get / presigned-GET / delete** with **structural per-tenant key isolation** and
**encryption at rest**. In scope: the client + its config + unit tests.
**Out of scope:** presigned PUT (uploads are server-proxied), virus scanning (a later
admin-service hook), Qdrant/vectors, and the admin `POST /profiles/resume` endpoint
(separate work that *consumes* this client).

## 2. Locked decisions

- **Hybrid flow:** server-proxied upload (admin-service validates content-type + size,
  then calls `put`); **presigned, time-limited GET** for download. No presigned PUT.
- **Tenant-aware:** every method takes `comp_id`; keys are `{comp_id}/{category}/{key}`.
- **Encryption:** SSE-S3 (`AES256`) on every put; bucket stays private; presigned GET is
  the only outbound read path.
- **Presign TTL:** default 900 s (15 min), overridable per call and via settings.
- **API names:** `put` / `get` / `presigned_get_url` / `delete`.

## 3. Components

- `corelib/storage/client.py` → `ObjectStorage`.
- `corelib/storage/__init__.py` → exports `ObjectStorage`.
- `corelib/config.py` `BaseServiceSettings` → gains S3 settings (§4).
- New dependency: `aioboto3>=13` (pulls aiobotocore/botocore — scanned by pip-audit).

## 4. Config additions (`BaseServiceSettings`)

| Setting | Default | Notes |
|---|---|---|
| `s3_endpoint_url` | `None` | R2/MinIO endpoint; `None` = AWS default |
| `s3_region` | `"auto"` | R2 uses `"auto"`; MinIO any |
| `s3_access_key_id` | `""` | from env / secret-manager |
| `s3_secret_access_key` | `""` | from env / secret-manager |
| `s3_bucket` | `"interview-platform"` | single bucket, tenant-prefixed keys |
| `storage_presign_ttl_seconds` | `900` | default GET-URL TTL |

## 5. API — `ObjectStorage`

**Lifecycle** (mirrors `MongoManager` / `Publisher`; aioboto3 needs an async context, so
the client opens in `connect`, not `__init__`):

- `__init__(endpoint_url, region, access_key_id, secret_access_key, bucket, presign_ttl_seconds=900)`
  — store config; build an `aioboto3.Session` + a botocore `Config` (timeouts + retries).
  No I/O.
- `async connect()` — open a long-lived S3 client (enter the aioboto3 client context).
- `async close()` — close it.

**Operations** (each takes `comp_id` first; raise `ValueError` on an empty key part):

| Method | Behavior |
|---|---|
| `async put(comp_id, category, key, data: bytes, content_type) -> str` | PutObject at `_key(...)`, `ServerSideEncryption="AES256"`, `ContentType`. Returns the full object key (to persist on the profile). |
| `async get(comp_id, category, key) -> bytes` | GetObject → body bytes (for the parse path). |
| `async presigned_get_url(comp_id, category, key, ttl=None) -> str` | Presigned GET URL; `ExpiresIn = ttl or default`. |
| `async delete(comp_id, category, key) -> None` | DeleteObject (retention / GDPR). |
| `_key(comp_id, category, key) -> str` | Validate non-empty parts; return `{comp_id}/{category}/{key}`. |

`category` is a caller-set label (`"resumes"` in P1, `"recordings"` in P4); `key` is
caller-provided (e.g. `{candidate_id}/{uuid}.pdf`) so the client stays deterministic.
`comp_id` is token-derived (an ObjectId hex string — no separators).

## 6. Data flow — resume upload/serve (P1)

1. Candidate uploads → admin `POST /profiles/resume` validates **content-type + size at the boundary**.
2. admin calls `put(comp_id, "resumes", key, bytes, content_type)`; persists the returned object key on the candidate profile.
3. admin emits `profile.parse` → Profile agent reads bytes via mcp-capability `parse_document`.
4. Serve/download: admin issues `presigned_get_url(comp_id, "resumes", key)` → short-lived URL to the browser.
5. Retention/GDPR: `delete(comp_id, "resumes", key)`.

## 7. Error handling & robustness

- botocore `Config(connect_timeout, read_timeout, retries={"max_attempts": 3, "mode": "standard"})`
  — timeouts + bounded retries configured **once on the client**, not per call.
- botocore `ClientError` **propagates** to the admin-service boundary (which maps it to an
  HTTP response); the client does **not** wrap every call in `try/except` (no defensive bloat).
- `_key` raises `ValueError` on an empty `comp_id`/`category`/`key` — the boundary check
  that guarantees nothing lands outside a tenant prefix.
- Access key/secret come from settings (env); never logged.

## 8. Testing (TDD)

**Unit** (no real S3 — inject a `FakeS3Client`, mirroring `FakeCollection`/`FakeRedis`/`FakeMessage`):

- `_key`: prefix is `{comp_id}/{category}/{key}`; empty `comp_id`/`category`/`key` → `ValueError`.
- `put`: Key is tenant-prefixed; `ServerSideEncryption="AES256"`; `ContentType` forwarded; returns the full key.
- `get`: round-trips bytes for a stored key.
- `presigned_get_url`: URL is scoped to the tenant key; `ExpiresIn` honors default and per-call override.
- `delete`: removes the tenant key.

**Integration** (later, docker-compose MinIO): `connect`/`close` + real put→get→presign→delete
round-trip; SSE honored. Consistent with the other infra modules having no unit test for `connect`.

## 9. Acceptance criteria

- All unit tests green; the gate (`ruff` S/ASYNC + `pip-audit` + `pytest`) passes.
- A caller **cannot** produce an empty or un-prefixed key (every op is tenant-scoped).
- No presigned PUT exists; uploads flow only through server-proxied `put`.
- Every put is encrypted (`AES256`); secrets are never logged.

## 10. References

`PRODUCTION_STANDARDS.md` · `ADMIN_SERVICE.md` §1 (object-storage row) · `HANDOFF.md` §4 ·
`ARCHITECTURE.md` §5 · security memory (tenant isolation everywhere).
