from typing import Any

import aioboto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from lib.logging import get_logger
from lib.resilience import OperationTimeout, with_timeout

log = get_logger(component="storage")


class StorageError(Exception):
    """Raised when an S3-compatible storage operation fails.

    Wraps botocore exceptions so callers never catch raw SDK errors and so the
    error type is part of the lib public API.
    """

    def __init__(self, message: str, *, op: str) -> None:
        super().__init__(message)
        self.op = op


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
        presign_ttl_max_seconds: int = 3600,
        op_timeout_seconds: float = 35.0,
    ) -> None:
        self._endpoint_url = endpoint_url
        self._region = region
        self._access_key_id = access_key_id
        self._secret_access_key = secret_access_key
        self._bucket = bucket
        self._presign_ttl = presign_ttl_seconds
        self._presign_ttl_max = presign_ttl_max_seconds
        self._op_timeout_seconds = op_timeout_seconds
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
        try:
            self._client = await self._client_cm.__aenter__()
        except Exception:
            # __aenter__ failed (bad creds/endpoint): drop the half-open cm so a later
            # close() doesn't re-enter it and mask the original error.
            self._client_cm = None
            raise
        log.info("storage.connected bucket={}", self._bucket)

    async def close(self) -> None:
        if self._client_cm is not None:
            await self._client_cm.__aexit__(None, None, None)
            self._client = None
            self._client_cm = None

    async def __aenter__(self) -> "ObjectStorage":
        await self.connect()
        return self

    async def __aexit__(self, *exc) -> None:
        await self.close()

    @staticmethod
    def _key(comp_id: str, category: str, key: str) -> str:
        if not (comp_id and category and key):
            raise ValueError("comp_id, category, and key must all be non-empty")
        return f"{comp_id}/{category}/{key}"

    async def put(
        self, comp_id: str, category: str, key: str, data: bytes, content_type: str
    ) -> str:
        object_key = self._key(comp_id, category, key)
        try:
            await with_timeout(
                self._client.put_object(
                    Bucket=self._bucket,
                    Key=object_key,
                    Body=data,
                    ContentType=content_type,
                    ServerSideEncryption="AES256",
                ),
                seconds=self._op_timeout_seconds,
                op="storage.put",
            )
        except (ClientError, BotoCoreError, OperationTimeout) as exc:
            log.error("storage.put_error key={} error={}", object_key, exc)
            raise StorageError(f"Failed to put {object_key}: {exc}", op="put") from exc
        log.debug("storage.put key={}", object_key)
        return object_key

    async def get(self, comp_id: str, category: str, key: str) -> bytes:
        object_key = self._key(comp_id, category, key)
        try:
            resp = await with_timeout(
                self._client.get_object(Bucket=self._bucket, Key=object_key),
                seconds=self._op_timeout_seconds,
                op="storage.get",
            )
        except (ClientError, BotoCoreError, OperationTimeout) as exc:
            log.error("storage.get_error key={} error={}", object_key, exc)
            raise StorageError(f"Failed to get {object_key}: {exc}", op="get") from exc
        async with resp["Body"] as body:
            return await body.read()

    async def get_raw(self, object_key: str) -> bytes:
        """Fetch by the exact key `put()` returned (e.g. an emitted resume_key).

        The object_key already carries the tenant prefix, so it is used verbatim —
        a consumer holding the emitted reference need not re-derive (comp_id, category).
        """
        try:
            resp = await with_timeout(
                self._client.get_object(Bucket=self._bucket, Key=object_key),
                seconds=self._op_timeout_seconds,
                op="storage.get_raw",
            )
        except (ClientError, BotoCoreError, OperationTimeout) as exc:
            log.error("storage.get_raw_error key={} error={}", object_key, exc)
            raise StorageError(
                f"Failed to get_raw {object_key}: {exc}", op="get_raw"
            ) from exc
        async with resp["Body"] as body:
            return await body.read()

    async def presigned_get_url(
        self, comp_id: str, category: str, key: str, ttl: int | None = None
    ) -> str:
        # Clamp the lifetime so no caller can mint an excessively long-lived URL.
        expires_in = min(ttl or self._presign_ttl, self._presign_ttl_max)
        object_key = self._key(comp_id, category, key)
        try:
            return await with_timeout(
                self._client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": self._bucket, "Key": object_key},
                    ExpiresIn=expires_in,
                ),
                seconds=self._op_timeout_seconds,
                op="storage.presigned_get_url",
            )
        except (ClientError, BotoCoreError, OperationTimeout) as exc:
            log.error("storage.presign_error key={} error={}", object_key, exc)
            raise StorageError(
                f"Failed to generate presigned URL for {object_key}: {exc}",
                op="presigned_get_url",
            ) from exc

    async def presigned_get_url_raw(
        self, object_key: str, ttl: int | None = None
    ) -> str:
        """Presign a GET by the exact key `put()` returned (e.g. an interview
        recording_key). The key already carries the tenant prefix, so it is used
        verbatim — the caller is responsible for the tenant authorization."""
        expires_in = min(ttl or self._presign_ttl, self._presign_ttl_max)
        try:
            return await with_timeout(
                self._client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": self._bucket, "Key": object_key},
                    ExpiresIn=expires_in,
                ),
                seconds=self._op_timeout_seconds,
                op="storage.presigned_get_url_raw",
            )
        except (ClientError, BotoCoreError, OperationTimeout) as exc:
            log.error("storage.presign_raw_error key={} error={}", object_key, exc)
            raise StorageError(
                f"Failed to generate presigned URL for {object_key}: {exc}",
                op="presigned_get_url_raw",
            ) from exc

    async def presigned_put_url(
        self,
        comp_id: str,
        category: str,
        key: str,
        content_type: str,
        ttl: int | None = None,
    ) -> str:
        # Presigned PUT so the browser uploads directly (e.g. a company logo) without
        # proxying bytes through the service. The lifetime is clamped like the GET URL.
        expires_in = min(ttl or self._presign_ttl, self._presign_ttl_max)
        object_key = self._key(comp_id, category, key)
        try:
            return await with_timeout(
                self._client.generate_presigned_url(
                    "put_object",
                    Params={
                        "Bucket": self._bucket,
                        "Key": object_key,
                        "ContentType": content_type,
                    },
                    ExpiresIn=expires_in,
                ),
                seconds=self._op_timeout_seconds,
                op="storage.presigned_put_url",
            )
        except (ClientError, BotoCoreError, OperationTimeout) as exc:
            log.error("storage.presign_put_error key={} error={}", object_key, exc)
            raise StorageError(
                f"Failed to generate presigned PUT for {object_key}: {exc}",
                op="presigned_put_url",
            ) from exc

    async def delete(self, comp_id: str, category: str, key: str) -> None:
        object_key = self._key(comp_id, category, key)
        try:
            await with_timeout(
                self._client.delete_object(Bucket=self._bucket, Key=object_key),
                seconds=self._op_timeout_seconds,
                op="storage.delete",
            )
        except (ClientError, BotoCoreError, OperationTimeout) as exc:
            log.error("storage.delete_error key={} error={}", object_key, exc)
            raise StorageError(
                f"Failed to delete {object_key}: {exc}", op="delete"
            ) from exc

    async def delete_raw(self, object_key: str) -> None:
        """Delete by the exact key `put()` returned (e.g. an emitted resume_key)."""
        try:
            await with_timeout(
                self._client.delete_object(Bucket=self._bucket, Key=object_key),
                seconds=self._op_timeout_seconds,
                op="storage.delete_raw",
            )
        except (ClientError, BotoCoreError, OperationTimeout) as exc:
            log.error("storage.delete_raw_error key={} error={}", object_key, exc)
            raise StorageError(
                f"Failed to delete_raw {object_key}: {exc}", op="delete_raw"
            ) from exc
