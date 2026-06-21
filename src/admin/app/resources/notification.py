"""Candidate notifications on funnel transitions.

`advance_application` (the transition authority) calls `TransitionNotifier.notify`
best-effort after every state change, so a candidate is emailed when their application
advances. Sending is delegated to the injected email Notifier (infra); message content
and recipient resolution live here. States with no candidate-facing message are skipped.
"""

from lib.logging import bind_ids, get_logger, log_context

from app.errors import NotFoundError
from app.model.notification import Notification
from app.resources.discovery import iso
from app.resources.mark_read import mark_thread_read

log = get_logger(component="notification.resources")

_MAX_PAGE_SIZE = 50


def _clamp_page(value) -> int:
    return value if isinstance(value, int) and value >= 1 else 1


def _clamp_page_size(value) -> int:
    if not isinstance(value, int) or value < 1:
        return _MAX_PAGE_SIZE
    return min(value, _MAX_PAGE_SIZE)


def _dto(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "kind": doc.get("kind", ""),
        "subject": doc.get("subject", ""),
        "body": doc.get("body", ""),
        "link": doc.get("link") or "",
        "created_at": iso(doc.get("created_at")),
        "read_at": iso(doc.get("read_at")),
    }


async def list_notifications(
    user_id, *, notifications, page=1, page_size=50, unread_only=False
):
    async with log_context(
        log,
        "resource.notification.list_notifications",
        **bind_ids(user_id=user_id),
    ):
        # A recipient's notifications (recency desc). unread_count is ALWAYS fresh.
        page = _clamp_page(page)
        page_size = _clamp_page_size(page_size)
        rows = await notifications.list_by_user(
            user_id,
            unread_only=unread_only,
            limit=page_size,
            skip=(page - 1) * page_size,
        )
        return {
            "notifications": [_dto(r) for r in rows],
            "unread_count": await notifications.unread_count(user_id),
            "page": page,
            "page_size": page_size,
            "total": await notifications.count_for(user_id, unread_only),
        }


async def mark_read(
    user_id,
    notification_id,
    *,
    notifications,
    read_state=None,
    seq_no: int = 0,
    comp_id: str = "",
):
    async with log_context(
        log,
        "resource.notification.mark_read",
        **bind_ids(user_id=user_id),
    ):
        if not await notifications.mark_read(user_id, notification_id):
            raise NotFoundError("notification not found")
        if read_state is not None:
            await mark_thread_read(
                comp_id,
                user_id,
                "notification",
                notification_id,
                seq_no,
                store=read_state,
            )
        return await notifications.unread_count(user_id)


async def mark_all_read(user_id, *, notifications):
    async with log_context(
        log,
        "resource.notification.mark_all_read",
        **bind_ids(user_id=user_id),
    ):
        await notifications.mark_all_read(user_id)
        return await notifications.unread_count(user_id)


async def notify_event(
    user_id,
    comp_id,
    kind,
    *,
    notifications,
    subject="",
    body="",
    link=None,
    dedup_key=None,
):
    async with log_context(
        log,
        "resource.notification.notify_event",
        **bind_ids(user_id=user_id, comp_id=comp_id),
    ):
        # Non-funnel notification entry (messaging / practice / alert sweep).
        # Best-effort + idempotent via the sparse (user_id, dedup_key) index.
        # Returns True on insert.
        return await notifications.insert_dedup(
            Notification(
                user_id=user_id,
                comp_id=comp_id,
                kind=kind,
                subject=subject,
                body=body,
                link=link,
                dedup_key=dedup_key,
            )
        )


# to_state -> (subject, body). States absent here (applied, interviewed, scored,
# interview_in_progress) have no candidate-facing message.
_MESSAGES = {
    "aptitude_pending": (
        "Your aptitude test is ready",
        "Your application has advanced — please complete your aptitude test.",
    ),
    "interview_pending": (
        "You're invited to interview",
        "Congratulations — you've advanced to the interview round.",
    ),
    "gated_out": (
        "Update on your application",
        "Thank you for your interest; your application did not advance past the "
        "aptitude stage.",
    ),
    "shortlisted": (
        "Good news about your application",
        "You've been shortlisted — the hiring team will be in touch.",
    ),
    "hired": (
        "Congratulations!",
        "We're delighted to offer you the role. Welcome aboard!",
    ),
    "rejected": (
        "Update on your application",
        "Thank you for interviewing; we've decided not to move forward at this time.",
    ),
}


class TransitionNotifier:
    """Emails the candidate when their application reaches a notifiable state."""

    def __init__(self, *, users, notifier):
        self._users = users
        self._notifier = notifier

    async def notify(self, application, to_state, event):
        async with log_context(
            log,
            "resource.notification.notify",
        ):
            message = _MESSAGES.get(to_state)
            if message is None:
                return
            candidate_user_id = application["candidate_user_id"]
            user = await self._users.get(candidate_user_id)
            if user is None:
                log.warning("notify: candidate {} not found", candidate_user_id)
                return
            subject, body = message
            await self._notifier.send_email(user["email"], subject, body)
            log.info("notified {} of state {}", user["email"], to_state)
