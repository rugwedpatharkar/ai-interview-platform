"""Real-Mongo concurrency test for `UserRepository.consume_recovery_code`.

The unit-level `test_recovery_code_consume.py` only covers the sequential
"call twice" case. A read-modify-write regression would pass that test but
double-consume under load. This test proves the actual invariant — under N
concurrent calls with the same code hash, exactly ONE call returns True —
against a live Mongo (matching the platform's runtime, where the atomicity
comes from `update_one` with the array-element filter).

Gated on `INTEGRATION_MONGO_URI` so the standard gate stays green when Mongo
isn't reachable. To run locally:

    docker compose up -d mongo
    INTEGRATION_MONGO_URI=mongodb://localhost:27017 \\
      backend/.venv/bin/python -m pytest \\
      services/admin/tests/test_recovery_code_concurrency.py
"""

import asyncio
import os
import uuid

import pytest
from lib.schemas import Role
from pymongo import AsyncMongoClient

from app.infra.repositories.users import UserRepository
from app.model.auth import User

_URI = os.getenv("INTEGRATION_MONGO_URI")
integration_only = pytest.mark.skipif(
    not _URI,
    reason="INTEGRATION_MONGO_URI unset — bring up docker compose mongo first.",
)


async def _seed_user(users: UserRepository, hashes: list[str]) -> str:
    uid = await users.insert(
        User(
            email=f"rc-{uuid.uuid4().hex}@x.co", password_hash="h", role=Role.candidate
        )
    )
    await users.update_fields(uid, {"recovery_codes": hashes})
    return uid


@integration_only
@pytest.mark.asyncio
async def test_single_winner_under_50_concurrent_consumers():
    # Fifty concurrent consumers race for the same code hash; the atomic $pull
    # matches only once, so exactly one must win. A read-modify-write regression
    # would let multiple concurrent callers pass the "in codes?" check and each
    # write a still-present-but-updated array — every caller would return True.
    client = AsyncMongoClient(_URI)
    db_name = f"ip_test_rc_{uuid.uuid4().hex}"
    db = client[db_name]
    try:
        users = UserRepository(db)
        uid = await _seed_user(users, ["shared-hash"])
        results = await asyncio.gather(
            *(users.consume_recovery_code(uid, "shared-hash") for _ in range(50))
        )
        assert sum(1 for r in results if r) == 1, (
            f"expected exactly 1 winner under concurrency, got {sum(results)}"
        )
        remaining = (await users.get(uid))["recovery_codes"]
        assert remaining == [], f"hash should be fully consumed; got {remaining}"
    finally:
        await client.drop_database(db_name)
        await client.close()


@integration_only
@pytest.mark.asyncio
async def test_concurrent_distinct_hashes_all_consume_once():
    # A different guarantee: N concurrent consumers, each for a distinct code
    # hash, all succeed and each hash is pulled exactly once. Catches an
    # over-broad match (e.g. a `$pull: {recovery_codes: {"$in": [...]}}` sweep
    # that would remove more than intended per call).
    client = AsyncMongoClient(_URI)
    db_name = f"ip_test_rc_{uuid.uuid4().hex}"
    db = client[db_name]
    try:
        users = UserRepository(db)
        hashes = [f"h{i}" for i in range(20)]
        uid = await _seed_user(users, hashes)
        results = await asyncio.gather(
            *(users.consume_recovery_code(uid, h) for h in hashes)
        )
        assert all(results), "every distinct-hash consumer must succeed"
        remaining = (await users.get(uid))["recovery_codes"]
        assert remaining == [], f"all hashes should be consumed; got {remaining}"
    finally:
        await client.drop_database(db_name)
        await client.close()
