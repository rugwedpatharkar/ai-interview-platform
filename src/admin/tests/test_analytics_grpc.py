"""AnalyticsService over gRPC-web: GetNoGhostingKpis auth + scope + happy path."""

import struct
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from lib.grpcweb import GrpcWebASGI
from lib.security import TokenService

from app.routes.analytics import AnalyticsServicer
from app.routes.pb import analytics_pb2, analytics_pb2_grpc

_SECRET = "test-secret-" + "x" * 32
_SVC = "/admin.analytics.v1.AnalyticsService"


class _FakeApps:
    def __init__(self, rows):
        self._rows = rows

    async def list_by_comp(self, comp_id):
        return [r for r in self._rows if r.get("comp_id") == comp_id]


def _app(rows=None):
    grpc_app = GrpcWebASGI()
    analytics_pb2_grpc.add_AnalyticsServiceServicer_to_server(
        AnalyticsServicer(
            applications=_FakeApps(rows or []),
            reports=None,
            tokens=TokenService(_SECRET),
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


def _mgr():
    token = TokenService(_SECRET).access_token("r1", "recruiter", "c1", "j1")
    return {"authorization": f"Bearer {token}"}


def _cand():
    token = TokenService(_SECRET).access_token("u1", "candidate", None, "j1")
    return {"authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_no_ghosting_kpis_requires_auth():
    resp = await _call(
        _app(), "GetNoGhostingKpis", analytics_pb2.NoGhostingKpisRequest()
    )
    _, status = _ds(resp.content)
    assert status == 16  # UNAUTHENTICATED


@pytest.mark.asyncio
async def test_no_ghosting_kpis_candidate_denied():
    resp = await _call(
        _app(),
        "GetNoGhostingKpis",
        analytics_pb2.NoGhostingKpisRequest(),
        metadata=_cand(),
    )
    _, status = _ds(resp.content)
    assert status == 7  # PERMISSION_DENIED — managers only


@pytest.mark.asyncio
async def test_no_ghosting_kpis_manager_happy():
    now = datetime(2026, 6, 20, 12, 0, tzinfo=UTC)
    rows = [
        {"comp_id": "c1", "state": "applied", "created_at": now - timedelta(days=10)},
        {
            "comp_id": "c1",
            "state": "shortlisted",
            "created_at": now - timedelta(days=5),
            "transitions": [{"state": "shortlisted", "at": now - timedelta(days=1)}],
        },
    ]
    resp = await _call(
        _app(rows),
        "GetNoGhostingKpis",
        analytics_pb2.NoGhostingKpisRequest(),
        metadata=_mgr(),
    )
    data, status = _ds(resp.content)
    assert status == 0
    out = analytics_pb2.NoGhostingKpis.FromString(data)
    assert out.pending_review == 1  # the stale applied app
    assert out.response_rate == 0.5  # 1 of 2 moved
