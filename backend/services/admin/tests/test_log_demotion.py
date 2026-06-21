"""TDD: verify that AuthDomainError catches in routes log at DEBUG with no traceback.

RED: before Part B wires log_domain_error into _abort, records are WARNING not DEBUG.
GREEN: after Part B, records are DEBUG and exception is None.
"""

import grpc
import pytest
from lib.redis import RateLimiter
from lib.security import RefreshSessionStore, TokenService
from loguru import logger as loguru_logger

from app.infra.notifier import LoggingNotifier
from app.routes.auth import AuthServicer
from app.routes.pb import auth_pb2


class _Sink:
    def __init__(self):
        self.records: list[dict] = []

    def __call__(self, message):
        self.records.append(message.record)


SECRET = "test-secret-" + "x" * 32


class _Aborted(Exception):
    def __init__(self, code, details):
        super().__init__(details)
        self.code = code


class FakeContext:
    def __init__(self, metadata=None, peer="ipv4:1.2.3.4:1"):
        self._md = metadata or []
        self._peer = peer

    def invocation_metadata(self):
        return self._md

    def peer(self):
        return self._peer

    async def abort(self, code, details):
        raise _Aborted(code, details)


def _servicer(fakes):
    return AuthServicer(
        users=fakes["users"],
        companies=fakes["companies"],
        tokens=TokenService(SECRET),
        sessions=RefreshSessionStore(fakes["redis"]),
        limiter=RateLimiter(fakes["redis"]),
        notifier=LoggingNotifier(),
        refresh_ttl_seconds=1209600,
    )


@pytest.mark.asyncio
async def test_invalid_token_in_refresh_logs_at_debug_no_traceback(fakes):
    """AuthDomainError caught at the route boundary must reach DEBUG, not WARNING/ERROR,
    and must carry no exception traceback (the whole point of log_domain_error)."""
    sink = _Sink()
    handler_id = loguru_logger.add(sink, level="DEBUG", format="{message}")
    try:
        svc = _servicer(fakes)
        with pytest.raises(_Aborted) as ei:
            await svc.Refresh(
                auth_pb2.RefreshRequest(refresh_token="not-a-real-token"),
                FakeContext(),
            )
        assert ei.value.code == grpc.StatusCode.INVALID_ARGUMENT

        domain_records = [r for r in sink.records if "domain_error" in r["message"]]
        assert domain_records, "expected at least one domain_error log record"
        assert all(r["level"].name == "DEBUG" for r in domain_records), (
            f"expected DEBUG level, got {[r['level'].name for r in domain_records]}"
        )
        assert all(r["exception"] is None for r in domain_records), (
            "domain_error log must not carry a traceback"
        )
    finally:
        loguru_logger.remove(handler_id)
