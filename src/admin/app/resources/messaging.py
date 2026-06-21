"""Application-anchored messaging (candidate <-> recruiter).

The thread is 1:1 with the application, so authz reuses the existing primitives —
candidate via `aptitude._owned`, recruiter via `decision._require_manager` + `_scoped`
— no new primitive. sender_role/sender_user_id come from the token, never the client.
The recipient's unread counter is the badge truth (read_at is advisory). A best-effort
`new_message` notification fires after the durable write. body is validated at the
boundary (trimmed, non-empty, <= MAX_BODY). The funnel is untouched.
"""

from datetime import UTC, datetime

from lib.logging import bind_ids, get_logger, log_context
from lib.schemas import Role

from app.errors import ValidationError
from app.resources.aptitude import _owned
from app.resources.decision import _scoped
from app.resources.discovery import iso
from app.resources.notification import notify_event

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
):
    async with log_context(
        log,
        "resource.messaging.send_message",
        **bind_ids(user_id=identity["id"], application_id=application_id),
    ):
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
):
    async with log_context(
        log,
        "resource.messaging.mark_read",
        **bind_ids(user_id=identity["id"], application_id=application_id),
    ):
        _, caller_side = await _authorize(identity, application_id, applications)
        await threads.mark_read(application_id, caller_side)
        await messages.mark_other_side_read(application_id, caller_side)
        return {"application_id": application_id, "unread": 0}
