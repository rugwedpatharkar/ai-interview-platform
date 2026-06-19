import grpc
import pytest
from lib.security import TokenService

from app.routes.job import JobServicer
from app.routes.pb import job_pb2

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


def _servicer(fakes):
    return JobServicer(
        jobs=fakes["jobs"], publisher=fakes["publisher"], tokens=TokenService(SECRET)
    )


def _md(role="company_admin", comp_id="c1"):
    token = TokenService(SECRET).access_token(
        sub="u1", role=role, comp_id=comp_id, jti="j1"
    )
    return FakeContext(metadata=[("authorization", f"Bearer {token}")])


@pytest.mark.asyncio
async def test_create_publish_job_rpc(fakes):
    svc = _servicer(fakes)
    created = await svc.CreateJob(
        job_pb2.CreateJobRequest(title="Eng", jd_text="x"), _md()
    )
    assert created.status == "draft"
    pub = await svc.PublishJob(job_pb2.PublishJobRequest(job_id=created.job_id), _md())
    assert pub.status == "published"
    assert fakes["publisher"].published[0][0] == "job.published"


@pytest.mark.asyncio
async def test_list_jobs_rpc_is_company_scoped(fakes):
    svc = _servicer(fakes)
    await svc.CreateJob(
        job_pb2.CreateJobRequest(title="Eng", jd_text="x"), _md(comp_id="c1")
    )
    listed = await svc.ListJobs(job_pb2.ListJobsRequest(), _md(comp_id="c2"))
    assert len(listed.jobs) == 0


@pytest.mark.asyncio
async def test_candidate_create_forbidden(fakes):
    svc = _servicer(fakes)
    with pytest.raises(_Aborted) as ei:
        await svc.CreateJob(
            job_pb2.CreateJobRequest(title="Eng", jd_text="x"),
            _md(role="candidate", comp_id=""),
        )
    assert ei.value.code == grpc.StatusCode.PERMISSION_DENIED
