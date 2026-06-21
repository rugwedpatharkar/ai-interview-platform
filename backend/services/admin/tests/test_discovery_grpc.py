"""DiscoveryService.SearchJobs over the gRPC-web translator: auth + response shaping."""

import struct
from datetime import UTC, datetime

import httpx
import pytest
from lib.grpcweb import GrpcWebASGI
from lib.security import TokenService

from app.routes.discovery import DiscoveryServicer
from app.routes.pb import discovery_pb2, discovery_pb2_grpc

_SECRET = "test-secret-" + "x" * 32
_SVC = "/admin.discovery.v1.DiscoveryService"


class _FakeJobs:
    def __init__(self, results=None, total=0):
        self._results = results or []
        self._total = total

    async def search_published(self, **kwargs):
        return {
            "results": self._results,
            "total": [{"n": self._total}] if self._total else [],
            "remote_mode": [],
            "employment_type": [],
            "experience_level": [],
        }


class _FakeCompanies:
    def __init__(self, names=None):
        self._names = names or {}

    async def names_by_ids(self, comp_ids):
        return {c: self._names[c] for c in comp_ids if c in self._names}


def _app(jobs, companies):
    app = GrpcWebASGI()
    discovery_pb2_grpc.add_DiscoveryServiceServicer_to_server(
        DiscoveryServicer(jobs=jobs, companies=companies, tokens=TokenService(_SECRET)),
        app,
    )
    return app


def _frame(b):
    return b"\x00" + struct.pack(">I", len(b)) + b


def _data_and_status(body):
    data, status, i = None, None, 0
    while i + 5 <= len(body):
        flag = body[i]
        (n,) = struct.unpack(">I", body[i + 1 : i + 5])
        payload = body[i + 5 : i + 5 + n]
        if flag & 0x80:
            for line in payload.decode().replace("\r\n", "\n").splitlines():
                if line.startswith("grpc-status:"):
                    status = int(line.split(":", 1)[1])
        else:
            data = payload
        i += 5 + n
    return data, status


async def _call(app, req, *, metadata=None):
    transport = httpx.ASGITransport(app=app)
    headers = {"content-type": "application/grpc-web+proto", **(metadata or {})}
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        return await client.post(
            f"{_SVC}/SearchJobs",
            content=_frame(req.SerializeToString()),
            headers=headers,
        )


def _auth(uid="u1"):
    token = TokenService(_SECRET).access_token(uid, "candidate", None, "j1")
    return {"authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_search_requires_auth():
    app = _app(_FakeJobs(), _FakeCompanies())
    resp = await _call(app, discovery_pb2.SearchJobsRequest(q="python"))
    _, status = _data_and_status(resp.content)
    assert status == 16  # UNAUTHENTICATED (anonymous search = the public REST surface)


@pytest.mark.asyncio
async def test_search_returns_cards():
    raw = {
        "_id": "job1",
        "comp_id": "c1",
        "title": "Py Eng",
        "jd_text": "build things",
        "location": "Remote",
        "experience_level": "senior",
        "created_at": datetime(2026, 6, 1, tzinfo=UTC),
        "aptitude_config": {"x": 1},
        "required_topics": ["a"],
    }
    app = _app(_FakeJobs(results=[raw], total=1), _FakeCompanies(names={"c1": "Acme"}))
    resp = await _call(
        app,
        discovery_pb2.SearchJobsRequest(q="py", page=1, page_size=10),
        metadata=_auth(),
    )
    data, status = _data_and_status(resp.content)
    assert status == 0
    out = discovery_pb2.SearchJobsResponse.FromString(data)
    assert out.total == 1 and out.page == 1
    card = out.jobs[0]
    assert card.job_id == "job1" and card.title == "Py Eng"
    assert card.company_id == "c1" and card.company_name == "Acme"
    assert card.snippet == "build things"
