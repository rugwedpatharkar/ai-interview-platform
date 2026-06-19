"""Candidate notifications on funnel transitions.

`advance_application` (the transition authority) calls `TransitionNotifier.notify`
best-effort after every state change, so a candidate is emailed when their application
advances. Sending is delegated to the injected email Notifier (infra); message content
and recipient resolution live here. States with no candidate-facing message are skipped.
"""

from lib.logging import get_logger

log = get_logger(component="notification.resources")

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
