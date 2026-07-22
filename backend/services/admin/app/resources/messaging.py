"""Application-anchored messaging (candidate <-> recruiter).

The thread is 1:1 with the application, so authz reuses the existing primitives —
candidate via `aptitude._owned`, recruiter via `decision._require_manager` + `_scoped`
— no new primitive. sender_role/sender_user_id come from the token, never the client.
The recipient's unread counter is the badge truth (read_at is advisory). A best-effort
`new_message` notification fires after the durable write. body is validated at the
boundary (trimmed, non-empty, <= MAX_BODY). The funnel is untouched.
"""

import asyncio
from datetime import UTC, datetime

from lib.logging import bind_ids, get_logger, log_context
from lib.resilience import with_timeout
from lib.schemas import Role

from app.errors import ConflictError, RateLimitedError, ValidationError
from app.resources.aptitude import _owned
from app.resources.decision import _scoped
from app.resources.discovery import iso
from app.resources.mark_read import mark_thread_read
from app.resources.notification import notify_event
from lib import timeouts

log = get_logger(component="messaging.resources")

MAX_BODY = 4096
_MANAGER_ROLES = {Role.company_admin.value, Role.recruiter.value}
_MAX_PAGE_SIZE = 50
_SNIPPET = 120


def _clamp_page(value) -> int:
    return value if isinstance(value, int) and value >= 1 else 1


def _clamp_page_size(value) -> int:
    if not isinstance(value, int) or value < 1:
        return _MAX_PAGE_SIZE
    return min(value, _MAX_PAGE_SIZE)


async def _authorize(identity, application_id, applications):
    """Return (application, caller_side). Candidate -> _owned; manager -> _scoped."""
    if identity["role"] in _MANAGER_ROLES:
        return await _scoped(identity, application_id, applications), "recruiter"
    return await _owned(identity, application_id, applications), "candidate"


def _message_dto(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "application_id": doc.get("application_id", ""),
        "sender_role": doc.get("sender_role", ""),
        "sender_user_id": doc.get("sender_user_id", ""),
        "body": doc.get("body", ""),
        "created_at": iso(doc.get("created_at")),
        "read_at": iso(doc.get("read_at")),
    }


def _thread_dto(doc: dict, caller_side: str) -> dict:
    unread = doc.get(
        "unread_candidate" if caller_side == "candidate" else "unread_recruiter", 0
    )
    return {
        "application_id": doc.get("application_id", ""),
        "candidate_user_id": doc.get("candidate_user_id", ""),
        "recruiter_user_id": doc.get("recruiter_user_id", ""),
        "job_title": doc.get("job_title", ""),
        "company_name": doc.get("company_name", ""),
        "last_message_at": iso(doc.get("last_message_at")),
        "last_snippet": doc.get("last_snippet", ""),
        "unread": unread,
    }


def _stream_channel(application_id: str) -> str:
    return f"msg:app:{application_id}"


async def send_message(
    identity,
    application_id,
    body,
    *,
    applications,
    threads,
    messages,
    jobs,
    companies,
    notifications=None,
    redis=None,
    limiter=None,
    users=None,
):
    async with log_context(
        log,
        "resource.messaging.send_message",
        **bind_ids(user_id=identity["id"], application_id=application_id),
    ):
        # Per-user + per-application throttle: was unbounded; a candidate could
        # loop SendMessage at gRPC speed and flood the recruiter's inbox +
        # notification store + notifier.send_email fanout.
        if limiter is not None:
            from app.config import get_settings as _s

            settings = _s()
            hit = await limiter.hit(
                f"msg:user:{identity['id']}:{application_id}",
                settings.msg_send_limit,
                settings.msg_send_window_seconds,
            )
            if not hit.allowed:
                raise RateLimitedError(hit.retry_after)
        body = (body or "").strip()
        if not body:
            raise ValidationError("message body is required")
        if len(body) > MAX_BODY:
            raise ValidationError("message too long")
        application, sender_role = await _authorize(
            identity, application_id, applications
        )
        comp_id = application["comp_id"]
        candidate_user_id = application["candidate_user_id"]

        # When a recruiter sends, the recipient is the candidate (known now); when a
        # candidate sends, the recipient is the recruiter (known only after the thread
        # lookup below). Check for a deleted/disabled/erased counterparty at the
        # earliest point we know their id — used to accept forever, writing orphan
        # messages + notifications with no signal.
        async def _check_active(uid):
            if users is None or not uid:
                return
            other = await users.get(uid)
            if (
                not other
                or other.get("erased")
                or other.get("status") in ("revoked", "disabled")
            ):
                raise ConflictError("Recipient account is no longer active")

        if sender_role == "recruiter":
            await _check_active(candidate_user_id)

        job = await jobs.get_by_id(application.get("job_id", ""))
        names = await companies.names_by_ids([comp_id])
        thread = await threads.get_or_create(
            application_id,
            comp_id=comp_id,
            candidate_user_id=candidate_user_id,
            job_title=(job or {}).get("title", ""),
            company_name=names.get(comp_id, ""),
        )
        recruiter_user_id = (
            identity["id"]
            if sender_role == "recruiter"
            else thread.get("recruiter_user_id", "")
        )
        if sender_role == "candidate":
            # Now that we have the thread, check the recruiter too.
            await _check_active(recruiter_user_id)
        now = datetime.now(UTC)
        from app.model.message import Message

        msg_id = await messages.add(
            Message(
                thread_id=str(thread["_id"]),
                comp_id=comp_id,
                application_id=application_id,
                sender_role=sender_role,
                sender_user_id=identity["id"],
                body=body,
                created_at=now,
            )
        )
        recipient = "candidate" if sender_role == "recruiter" else "recruiter"
        await threads.record_send(
            application_id,
            last_message_at=now,
            last_snippet=body[:_SNIPPET],
            recipient=recipient,
            recruiter_user_id=recruiter_user_id,
        )
        if notifications is not None:
            other = (
                candidate_user_id if sender_role == "recruiter" else recruiter_user_id
            )
            if other:
                try:
                    await notify_event(
                        other,
                        comp_id,
                        "new_message",
                        notifications=notifications,
                        link=f"/messages/{application_id}",
                        dedup_key=msg_id,
                    )
                except Exception:
                    log.exception("messaging: notify failed for {}", application_id)
        # Notify open streams (StreamMessages subscribers). Best-effort; failure just
        # means the recipient's stream waits for its fallback poll instead.
        if redis is not None:
            try:
                await with_timeout(
                    redis.publish(_stream_channel(application_id), "1"),
                    timeouts.redis(),
                    op="messaging.stream_publish",
                )
            except Exception:
                log.exception("messaging: stream publish failed for {}", application_id)
        return _message_dto(
            {
                "_id": msg_id,
                "application_id": application_id,
                "sender_role": sender_role,
                "sender_user_id": identity["id"],
                "body": body,
                "created_at": now,
                "read_at": None,
            }
        )


async def list_threads(
    identity,
    *,
    applications,
    threads,
    messages,
    jobs,
    companies,
    notifications=None,
    page=1,
    page_size=50,
):
    async with log_context(
        log,
        "resource.messaging.list_threads",
        **bind_ids(user_id=identity["id"]),
    ):
        page = _clamp_page(page)
        page_size = _clamp_page_size(page_size)
        skip = (page - 1) * page_size
        if identity["role"] in _MANAGER_ROLES:
            rows = await threads.list_for_comp(
                identity["comp_id"], skip=skip, limit=page_size
            )
            total = await threads.count_for_comp(identity["comp_id"])
            side = "recruiter"
        else:
            rows = await threads.list_for_candidate(
                identity["id"], skip=skip, limit=page_size
            )
            total = await threads.count_for_candidate(identity["id"])
            side = "candidate"
        return {
            "threads": [_thread_dto(t, side) for t in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }


async def list_messages(
    identity,
    application_id,
    *,
    applications,
    threads,
    messages,
    jobs,
    companies,
    notifications=None,
    page=1,
    page_size=50,
):
    async with log_context(
        log,
        "resource.messaging.list_messages",
        **bind_ids(user_id=identity["id"], application_id=application_id),
    ):
        await _authorize(identity, application_id, applications)
        page = _clamp_page(page)
        page_size = _clamp_page_size(page_size)
        thread = await threads.get(application_id)
        if thread is None:
            return {"messages": [], "total": 0, "page": page, "page_size": page_size}
        thread_id = str(thread["_id"])
        rows = await messages.list_by_thread(
            thread_id, skip=(page - 1) * page_size, limit=page_size
        )
        return {
            "messages": [_message_dto(m) for m in rows],
            "total": await messages.count_by_thread(thread_id),
            "page": page,
            "page_size": page_size,
        }


async def mark_read(
    identity,
    application_id,
    *,
    applications,
    threads,
    messages,
    jobs,
    companies,
    notifications=None,
    read_state=None,
    seq_no: int = 0,
):
    async with log_context(
        log,
        "resource.messaging.mark_read",
        **bind_ids(user_id=identity["id"], application_id=application_id),
    ):
        application, caller_side = await _authorize(
            identity, application_id, applications
        )
        await threads.mark_read(application_id, caller_side)
        await messages.mark_other_side_read(application_id, caller_side)
        accepted_seq_no = 0
        if read_state is not None:
            accepted_seq_no = await mark_thread_read(
                application["comp_id"],
                identity["id"],
                "thread",
                application_id,
                seq_no,
                store=read_state,
            )
        return {
            "application_id": application_id,
            "unread": 0,
            "accepted_seq_no": accepted_seq_no,
        }


async def stream_messages(
    application_id, since_id, *, identity, applications, messages, redis=None
):
    """Yield new MessageDTOs as they arrive.

    Was a 1 s poll per open stream — 1000 concurrent threads = 1000 Mongo
    find/sec forever. Now: subscribe to a Redis pubsub channel that
    send_message publishes to; the loop wakes on the notification and only
    hits Mongo when there's actual news. A 10 s fallback poll runs if pubsub
    misses a publish (network blip, subscriber not yet attached). Redis
    unavailable → fall back to a 2 s poll to keep the feature working.
    """
    async with log_context(
        log,
        "resource.messaging.stream_messages",
        **bind_ids(application_id=application_id),
    ):
        await _authorize(identity, application_id, applications)
        last_id = since_id

        pubsub = None
        if redis is not None:
            try:
                pubsub = redis.pubsub()
                await pubsub.subscribe(_stream_channel(application_id))
            except Exception:
                log.exception(
                    "messaging.stream: pubsub subscribe failed for {}",
                    application_id,
                )
                pubsub = None

        try:
            while True:
                new_msgs = await messages.list_after(application_id, last_id, limit=100)
                for m in new_msgs:
                    yield _message_dto(m)
                    last_id = str(m["_id"])
                if pubsub is not None:
                    # Wait for a publish notification; the 10 s timeout is the
                    # fallback-poll interval, generous because pushes normally
                    # arrive within milliseconds.
                    try:
                        await pubsub.get_message(
                            ignore_subscribe_messages=True, timeout=10.0
                        )
                    except Exception:
                        # get_message hides most errors; a stray one means the
                        # pubsub is unhealthy — degrade to poll.
                        pubsub = None
                        await asyncio.sleep(2.0)
                else:
                    await asyncio.sleep(2.0)
        finally:
            if pubsub is not None:
                try:
                    await pubsub.unsubscribe(_stream_channel(application_id))
                    await pubsub.aclose()
                except Exception as exc:
                    log.warning(
                        "messaging.stream: pubsub teardown for {} failed: {}",
                        application_id,
                        exc,
                    )
