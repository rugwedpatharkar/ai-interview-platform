import grpc
import pytest
from lib.security import TokenService

from app.routes.pb import sourcing_pb2
from app.routes.sourcing import SourcingServicer

SECRET = "test-secret-" + "x" * 32


class _Aborted(Exception):
    def __init__(self, code, details):
        super().__init__(details)
        self.code = code


class FakeContext:
    def __init__(self, metadata=None):
        self._md = metadata or []

    def invocation_metadata(self):
        return self._md

    async def abort(self, code, details):
        raise _Aborted(code, details)


class _Apps:
    async def list_by_comp(self, comp_id):
        return [{"comp_id": comp_id, "candidate_user_id": "u1", "state": "interviewed"}]


class _Profiles:
    async def find_by_user_ids(self, user_ids):
        return [{"user_id": "u1", "skills": ["React"], "full_name": "Ann"}]


def _servicer():
    return SourcingServicer(
        applications=_Apps(), profiles=_Profiles(), tokens=TokenService(SECRET)
    )


def _md(role="company_admin", comp_id="c1"):
    token = TokenService(SECRET).access_token(
        sub="m1", role=role, comp_id=comp_id, jti="j1"
    )
    return FakeContext(metadata=[("authorization", f"Bearer {token}")])


@pytest.mark.asyncio
async def test_search_returns_hits():
    out = await _servicer().SearchCandidates(
        sourcing_pb2.SearchCandidatesRequest(query="react", page=1, page_size=10), _md()
    )
    assert out.total == 1
    hit = out.hits[0]
    assert hit.candidate_user_id == "u1"
    assert hit.top_stage == "interviewed"
    assert list(hit.matched_skills) == ["React"]
    assert hit.fit_score == 1.0


@pytest.mark.asyncio
async def test_search_is_manager_only():
    with pytest.raises(_Aborted) as ei:
        await _servicer().SearchCandidates(
            sourcing_pb2.SearchCandidatesRequest(query="react"),
            _md(role="candidate", comp_id=""),
        )
    assert ei.value.code == grpc.StatusCode.PERMISSION_DENIED
