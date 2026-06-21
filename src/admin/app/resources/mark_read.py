"""Shared monotonic-seq read-state resource.

Both messaging.mark_read and notification.mark_read delegate here so concurrent
mutations on the same (user_id, kind, thread_id) can't desync the stored seq_no. The
server enforces: if the request's seq_no is less than the stored one, the call is a
no-op and returns the existing higher value; otherwise update + return the new value.
seq_no=0 means "server picks current+1".
"""

from lib.logging import bind_ids, get_logger, log_context

from app.errors import ValidationError

log = get_logger(component="mark_read.resources")


async def mark_thread_read(
    comp_id: str,
    user_id: str,
    kind: str,
    thread_id: str,
    seq_no: int,
    *,
    store,
) -> int:
    async with log_context(
        log,
        "resource.mark_read.mark_thread_read",
        **bind_ids(comp_id=comp_id, user_id=user_id),
    ):
        if seq_no < 0:
            raise ValidationError("seq_no must be >= 0")
        if not kind or not thread_id:
            raise ValidationError("kind and thread_id are required")
        return await store.set_seq_no_if_greater(
            comp_id, user_id, kind, thread_id, seq_no
        )
