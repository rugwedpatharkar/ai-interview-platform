"""Idempotent seed: one coding task per job, into the coding_tasks collection.

A6 ships execution + grading against deterministic, HUMAN-VERIFIED test cases; this
seeds a known problem so GetCodingTask returns a real task in a running environment.
LLM authoring is a gated follow-up (see the A6 plan). The seed's hidden cases are the
server-only answer key — they never reach the candidate.

Run from src/admin:  ../../.venv/bin/python -m scripts.seed_coding_task <job_id>
"""

import asyncio
import sys

from lib.mongodb import MongoManager

from app.config import get_settings
from app.model.coding import CodingTask, TestCase, TypedQuestion


def build_seed_task(job_id: str) -> dict:
    """A known, human-verified 'sum of two integers' task (sample + hidden cases)."""
    return CodingTask(
        job_id=job_id,
        title="Sum of Two Integers",
        prompt=(
            "Read a single line with two space-separated integers and print their sum."
        ),
        languages=["python"],
        starter_code="a, b = map(int, input().split())\n# print their sum\n",
        sample_cases=[TestCase(stdin="1 2", expected_stdout="3")],
        hidden_cases=[
            TestCase(stdin="4 5", expected_stdout="9"),
            TestCase(stdin="-3 8", expected_stdout="5"),
            TestCase(stdin="0 0", expected_stdout="0"),
        ],
        typed_questions=[
            TypedQuestion(
                id="t1",
                prompt="What is the time complexity of your solution?",
                accepted=["O(1)", "constant"],
            )
        ],
        cpu_seconds=2,
        wall_seconds=5,
    ).model_dump()


async def _seed(job_id: str) -> None:
    s = get_settings()
    mongo = MongoManager(
        s.mongo_uri, s.mongo_db_name, s.mongo_max_pool_size, s.mongo_min_pool_size
    )
    await mongo.db["coding_tasks"].update_one(
        {"job_id": job_id}, {"$set": build_seed_task(job_id)}, upsert=True
    )
    await mongo.close()


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python -m scripts.seed_coding_task <job_id>")
    asyncio.run(_seed(sys.argv[1]))


if __name__ == "__main__":
    main()
