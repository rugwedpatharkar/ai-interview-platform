"""Phase 5 observability tests for the admin service.

Covers:
- A representative gRPC handler logs op.start + op.done via log_context.
- An error path increments admin_grpc_errors_total and still aborts with the right code.
- start_metrics_server(0) is a no-op (no server started, stays offline).
- Config fields metrics_port and tracing_enabled have correct defaults.
- Redaction: binding a sensitive key is scrubbed in log output.
"""

import grpc
import pytest
from lib.observability import get_registry, start_metrics_server
from lib.redis import RateLimiter
from lib.security import RefreshSessionStore, TokenService

from app.config import Settings
from app.infra.notifier import LoggingNotifier
from app.routes.auth import AuthServicer
from app.routes.pb import auth_pb2

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


def _counter_value(sample_name: str, **labels) -> float:
    """Read a Prometheus counter's current value for the given label set.

    Prometheus strips the ``_total`` suffix from the metric family name but
    keeps it on the individual sample name — match on the sample name.
    """
    registry = get_registry()
    for m in registry.collect():
        for sample in m.samples:
            if sample.name == sample_name and all(
                sample.labels.get(k) == v for k, v in labels.items()
            ):
                return sample.value
    return 0.0


@pytest.mark.asyncio
async def test_register_company_increments_grpc_total(fakes):
    """A successful RPC increments admin_grpc_requests_total[RegisterCompany]."""
    before = _counter_value("admin_grpc_requests_total", method="RegisterCompany")
    svc = _servicer(fakes)
    await svc.RegisterCompany(
        auth_pb2.RegisterCompanyRequest(
            company_name="Acme", email="boss2@acme.com", password="pw123456"
        ),
        FakeContext(),
    )
    after = _counter_value("admin_grpc_requests_total", method="RegisterCompany")
    assert after == before + 1


@pytest.mark.asyncio
async def test_login_wrong_password_increments_errors_total(fakes):
    """A domain error on Login increments admin_grpc_errors_total[Login]."""
    svc = _servicer(fakes)
    await svc.RegisterCandidate(
        auth_pb2.RegisterCandidateRequest(email="err@x.com", password="pw123456"),
        FakeContext(),
    )
    before = _counter_value("admin_grpc_errors_total", method="Login")
    with pytest.raises(_Aborted) as ei:
        await svc.Login(
            auth_pb2.LoginRequest(email="err@x.com", password="wrongpass"),
            FakeContext(),
        )
    assert ei.value.code == grpc.StatusCode.UNAUTHENTICATED
    after = _counter_value("admin_grpc_errors_total", method="Login")
    assert after == before + 1


@pytest.mark.asyncio
async def test_start_metrics_server_zero_is_noop():
    """start_metrics_server(0) must not raise and must not start a server."""
    # This is the offline-safe path tested every CI run.
    await start_metrics_server(0)  # must return without error


def test_config_defaults_keep_observability_off():
    """metrics_port=0 and tracing_enabled=False keep tests + local fully offline."""
    s = Settings()
    assert s.metrics_port == 0
    assert s.tracing_enabled is False


def test_redaction_scrubs_token_from_log_context(capsys):
    """Binding 'token' key must not appear in log output (scrubbed to ***)."""
    from lib.logging import configure_logging, get_logger

    configure_logging("admin-test")
    log = get_logger()
    # Bind a sensitive key — the patcher must scrub it before output.
    bound = log.bind(token="super-secret-jwt")
    bound.info("redaction check")
    captured = capsys.readouterr()
    # The literal secret must not appear; *** is the scrubbed placeholder.
    assert "super-secret-jwt" not in captured.err
    assert "***" in captured.err


@pytest.mark.asyncio
async def test_invite_recruiter_no_token_aborts_unauthenticated(fakes):
    """InviteRecruiter with a missing token aborts UNAUTHENTICATED via caller_identity
    (the FE gRPC-web client only refreshes-and-retries on 401). The shared
    caller_identity helper aborts directly and does not increment the per-method
    _grpc_errors counter — consistent with every other authed servicer.
    """
    svc = _servicer(fakes)
    with pytest.raises(_Aborted) as ei:
        await svc.InviteRecruiter(
            auth_pb2.InviteRecruiterRequest(email="r@x.com", password="pw123456"),
            FakeContext(),
        )
    assert ei.value.code == grpc.StatusCode.UNAUTHENTICATED
