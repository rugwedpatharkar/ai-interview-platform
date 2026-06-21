"""Audit-write helpers — durable path + retryable replay queue.

Audit data is compliance-critical (every automated decision, override, sensitive access
must leave a row). The single-call path: ``await write_audit(repo, doc)``. When the
caller has already done the durable mutation and the audit-write fails (e.g. transient
Mongo blip), the caller calls ``enqueue_replay(redis, doc)`` to durably stash the row
on a Redis list, and a background drainer (``drain_replay``) flushes it later.
"""

import json
from typing import Any

from lib.errors import DependencyError

_REPLAY_LIST_KEY = "audit:replay"
_REPLAY_DEDUP_KEY = "audit:replay:seen"
_REPLAY_DEDUP_TTL_SECONDS = 24 * 3600


async def write_audit(repo, doc: dict[str, Any]) -> None:
    """Insert one audit row. Translates infra errors to ``DependencyError`` so the
    caller can decide whether to enqueue a replay.
    """
    try:
        await repo.insert(doc)
    except Exception as exc:
        raise DependencyError(
            "audit write failed",
            context={"event_id": doc.get("event_id")},
        ) from exc


async def enqueue_replay(redis, doc: dict[str, Any]) -> None:
    """Stash an audit doc on the replay queue. Idempotent on ``doc['event_id']``."""
    event_id = doc.get("event_id")
    if not event_id:
        raise ValueError("enqueue_replay: doc must carry event_id")
    added = await redis.sadd(_REPLAY_DEDUP_KEY, event_id)
    if not added:
        return
    await redis.expire(_REPLAY_DEDUP_KEY, _REPLAY_DEDUP_TTL_SECONDS)
    await redis.rpush(_REPLAY_LIST_KEY, json.dumps(doc).encode("utf-8"))


async def drain_replay(repo, redis, *, batch: int = 50) -> int:
    """Pop up to ``batch`` items and try to ``write_audit`` each. On failure, the item
    is pushed back at the head so order is preserved. Returns count drained.
    """
    drained = 0
    for _ in range(batch):
        raw = await redis.lpop(_REPLAY_LIST_KEY)
        if raw is None:
            break
        doc = json.loads(raw)
        try:
            await write_audit(repo, doc)
            drained += 1
        except DependencyError:
            await redis.lpush(_REPLAY_LIST_KEY, raw)
            break
    return drained
