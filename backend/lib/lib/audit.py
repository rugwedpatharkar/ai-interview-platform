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
# In-flight list: LMOVE from the main list to here before attempting the audit write,
# LREM on success. On a process crash between LPOP and the write, the row used to
# live only in Python memory and disappeared — now it's still on the processing list
# and the next drainer sees it.
_REPLAY_PROCESSING_KEY = "audit:replay:processing"
_REPLAY_DEDUP_KEY_PREFIX = "audit:replay:seen:"
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
    """Stash an audit doc on the replay queue. Idempotent on ``doc['event_id']``
    for a 24-hour window via a per-event_id key with ``SET NX EX`` semantics —
    a shared dedup SET would either grow unbounded or expire entries together,
    neither of which gives a true per-event window.
    """
    event_id = doc.get("event_id")
    if not event_id:
        raise ValueError("enqueue_replay: doc must carry event_id")
    key = f"{_REPLAY_DEDUP_KEY_PREFIX}{event_id}"
    added = await redis.set(key, "1", ex=_REPLAY_DEDUP_TTL_SECONDS, nx=True)
    if not added:
        return
    await redis.rpush(_REPLAY_LIST_KEY, json.dumps(doc).encode("utf-8"))


async def drain_replay(repo, redis, *, batch: int = 50) -> int:
    """Pop up to ``batch`` items and try to ``write_audit`` each. Uses LMOVE so a
    process crash between "take from queue" and "write to Mongo" doesn't lose the
    row — it stays on the processing list and the next drainer sweeps it. On write
    failure the row is moved back to the head of the main list to preserve order.
    Returns count drained.
    """
    drained = 0
    for _ in range(batch):
        # LMOVE atomically takes from the tail-side of the source list and puts on
        # the tail of the processing list. If we crash after this, the row survives.
        raw = await redis.lmove(
            _REPLAY_LIST_KEY, _REPLAY_PROCESSING_KEY, "LEFT", "RIGHT"
        )
        if raw is None:
            break
        try:
            doc = json.loads(raw)
            await write_audit(repo, doc)
            # Success: remove exactly this row from the processing list.
            await redis.lrem(_REPLAY_PROCESSING_KEY, 1, raw)
            drained += 1
        except DependencyError:
            # Put back at the head of the main list to preserve order; also clear
            # from processing so it isn't double-drained on the next sweep.
            await redis.lrem(_REPLAY_PROCESSING_KEY, 1, raw)
            await redis.lpush(_REPLAY_LIST_KEY, raw)
            break
    return drained
