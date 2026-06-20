import grpc
import pytest

from app.routes.company_profile import CompanyProfileServicer
from app.routes.pb import company_profile_pb2


class _Aborted(Exception):
    def __init__(self, code, details):
        super().__init__(details)
        self.code = code


class FakeContext:
    def invocation_metadata(self):
        return []

    async def abort(self, code, details):
        raise _Aborted(code, details)


class _Jobs:
    def __init__(self, n):
        self._n = n

    async def count_published_by_comp(self, comp_id):
        return self._n


class _Profiles:
    async def get_by_comp(self, comp_id):
        return None


class _Companies:
    async def names_by_ids(self, comp_ids):
        return {"c1": "Acme"}


class _Apps:
    async def list_by_comp(self, comp_id):
        return []


def _servicer(jobs_n=1):
    return CompanyProfileServicer(
        companies=_Companies(),
        profiles=_Profiles(),
        jobs=_Jobs(jobs_n),
        applications=_Apps(),
    )


@pytest.mark.asyncio
async def test_get_company_profile_public():
    out = await _servicer(jobs_n=2).GetCompanyProfile(
        company_profile_pb2.GetCompanyProfileRequest(comp_id="c1"), FakeContext()
    )
    assert out.id == "c1" and out.name == "Acme"
    assert out.trust.open_jobs == 2


@pytest.mark.asyncio
async def test_get_company_profile_unknown_not_found():
    with pytest.raises(_Aborted) as ei:
        await _servicer(jobs_n=0).GetCompanyProfile(
            company_profile_pb2.GetCompanyProfileRequest(comp_id="c1"), FakeContext()
        )
    assert ei.value.code == grpc.StatusCode.NOT_FOUND
