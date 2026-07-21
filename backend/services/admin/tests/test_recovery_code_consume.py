"""Regression test for the atomic $pull-based recovery-code consumer (H6).

The read-modify-write predecessor could reuse a code under concurrency. The new
consume_recovery_code returns True at most ONCE for a given hash — any read-modify
regression would let this test's second call return True and reuse a code."""

import pytest

from tests.conftest import FakeUserRepo


@pytest.mark.asyncio
async def test_consume_recovery_code_exactly_once():
    users = FakeUserRepo()
    uid = await users.insert(
        type(
            "U",
            (),
            {
                "model_dump": lambda self: {
                    "email": "u@x.co",
                    "password_hash": "hashed",
                    "role": "candidate",
                    "recovery_codes": ["h1", "h2", "h3"],
                }
            },
        )()
    )
    assert await users.consume_recovery_code(uid, "h1") is True
    assert await users.consume_recovery_code(uid, "h1") is False
    assert (await users.get(uid))["recovery_codes"] == ["h2", "h3"]


@pytest.mark.asyncio
async def test_consume_recovery_code_missing_hash_returns_false():
    users = FakeUserRepo()
    uid = await users.insert(
        type(
            "U",
            (),
            {
                "model_dump": lambda self: {
                    "email": "u@x.co",
                    "password_hash": "hashed",
                    "role": "candidate",
                    "recovery_codes": ["h1"],
                }
            },
        )()
    )
    assert await users.consume_recovery_code(uid, "not-present") is False
    assert (await users.get(uid))["recovery_codes"] == ["h1"]
