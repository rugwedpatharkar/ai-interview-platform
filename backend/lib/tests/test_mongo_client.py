import pytest
from lib.mongodb import MongoManager


class _FailingAdmin:
    async def command(self, _name):
        raise RuntimeError("server selection timeout")


class _FailingClient:
    admin = _FailingAdmin()


@pytest.mark.asyncio
async def test_ping_wraps_driver_failure_as_clear_error():
    # AsyncMongoClient construction is lazy (no connect), so swap in a failing stub.
    mgr = MongoManager("mongodb://localhost:1", "db")
    mgr._client = _FailingClient()
    with pytest.raises(RuntimeError) as exc_info:
        await mgr.ping()
    assert "unavailable" in str(exc_info.value).lower()
