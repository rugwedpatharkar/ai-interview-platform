import pytest
from lib.errors import DependencyError

from app.resources import company_profile


class _FailingStorage:
    async def presigned_get_url(self, *args, **kwargs):
        raise RuntimeError("S3 down")


@pytest.mark.asyncio
async def test_logo_url_surfaces_dependency_error_on_storage_failure():
    with pytest.raises(DependencyError):
        await company_profile._logo_url("c1", "logo.png", _FailingStorage())


@pytest.mark.asyncio
async def test_logo_url_returns_empty_when_no_key():
    result = await company_profile._logo_url("c1", "", _FailingStorage())
    assert result == ""


@pytest.mark.asyncio
async def test_logo_url_returns_empty_when_no_storage():
    result = await company_profile._logo_url("c1", "logo.png", None)
    assert result == ""
