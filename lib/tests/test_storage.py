import pytest
from botocore.exceptions import ClientError
from lib.storage import ObjectStorage
from lib.storage.client import StorageError


def test_key_builds_tenant_prefix():
    assert ObjectStorage._key("c1", "resumes", "u1.pdf") == "c1/resumes/u1.pdf"


def test_key_rejects_empty_parts():
    with pytest.raises(ValueError):
        ObjectStorage._key("", "resumes", "u1.pdf")
    with pytest.raises(ValueError):
        ObjectStorage._key("c1", "", "u1.pdf")
    with pytest.raises(ValueError):
        ObjectStorage._key("c1", "resumes", "")


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

    def __init__(self, presign_fail: bool = False):
        self.objects: dict[str, dict] = {}
        self.deleted: list[str] = []
        self._presign_fail = presign_fail

    async def put_object(self, **kw):
        self.objects[kw["Key"]] = kw
        return {}

    async def get_object(self, *, Bucket, Key):
        return {"Body": _FakeBody(self.objects[Key]["Body"])}

    async def delete_object(self, *, Bucket, Key):
        self.deleted.append(Key)
        return {}

    async def generate_presigned_url(self, client_method, *, Params, ExpiresIn):
        if self._presign_fail:
            raise ClientError(
                {"Error": {"Code": "NoSuchKey", "Message": "Not found"}},
                "GeneratePresignedUrl",
            )
        return f"https://example/{Params['Key']}?exp={ExpiresIn}"


def _storage_with_fake(presign_fail: bool = False) -> ObjectStorage:
    s = ObjectStorage(None, "auto", "ak", "sk", "bucket")
    s._client = FakeS3Client(presign_fail=presign_fail)
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


@pytest.mark.asyncio
async def test_get_raw_fetches_by_exact_object_key():
    s = _storage_with_fake()
    object_key = await s.put("c1", "resumes", "u1.pdf", b"RAWPDF", "application/pdf")
    assert await s.get_raw(object_key) == b"RAWPDF"


@pytest.mark.asyncio
async def test_presigned_get_url_scoped_with_ttl():
    s = _storage_with_fake()
    url = await s.presigned_get_url("c1", "resumes", "u1.pdf")
    assert "c1/resumes/u1.pdf" in url
    assert "exp=900" in url  # default TTL
    url2 = await s.presigned_get_url("c1", "resumes", "u1.pdf", ttl=60)
    assert "exp=60" in url2  # per-call override


@pytest.mark.asyncio
async def test_presigned_get_url_clamps_excessive_ttl():
    s = _storage_with_fake()
    url = await s.presigned_get_url("c1", "resumes", "u1.pdf", ttl=999_999)
    assert "exp=3600" in url  # clamped to the max lifetime


@pytest.mark.asyncio
async def test_delete_removes_tenant_key():
    s = _storage_with_fake()
    await s.put("c1", "resumes", "u1.pdf", b"X", "application/pdf")
    await s.delete("c1", "resumes", "u1.pdf")
    assert "c1/resumes/u1.pdf" in s._client.deleted


@pytest.mark.asyncio
async def test_delete_raw_removes_exact_object_key():
    s = _storage_with_fake()
    object_key = await s.put("c1", "resumes", "u1.pdf", b"X", "application/pdf")
    await s.delete_raw(object_key)
    assert object_key in s._client.deleted


@pytest.mark.asyncio
async def test_presigned_get_url_raises_storage_error_on_s3_failure():
    """S3 errors in presigned_get_url surface as StorageError, not raw boto."""
    s = _storage_with_fake(presign_fail=True)
    # Ensure object key is valid (key must exist for _key to not raise)
    with pytest.raises(StorageError) as exc_info:
        await s.presigned_get_url("c1", "resumes", "u1.pdf")
    assert exc_info.value.op == "presigned_get_url"
    assert "c1/resumes/u1.pdf" in str(exc_info.value)
