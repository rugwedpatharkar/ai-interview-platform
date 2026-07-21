import asyncio
import smtplib
from email.message import EmailMessage
from typing import Protocol

from lib.logging import get_logger

log = get_logger(component="admin.notifier")


class Notifier(Protocol):
    async def send_email(self, to: str, subject: str, body: str) -> None: ...


class LoggingNotifier:
    """Dev/test notifier — records messages instead of sending. NEVER use in prod:
    verification / password-reset flows silently break because the link never leaves
    the process. ``make_notifier`` refuses to hand this back when environment == prod.
    """

    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str]] = []

    async def send_email(self, to: str, subject: str, body: str) -> None:
        self.sent.append((to, subject, body))
        log.info("LoggingNotifier: {} -> {!r}", to, subject)


class SmtpNotifier:
    """Stdlib SMTP notifier (STARTTLS). ``send_email`` runs the blocking `smtplib`
    call in a worker thread so the event loop stays responsive.
    """

    def __init__(
        self,
        *,
        host: str,
        port: int,
        user: str,
        password: str,
        sender: str,
    ) -> None:
        self._host = host
        self._port = port
        self._user = user
        self._password = password
        self._sender = sender

    def _send_blocking(self, to: str, subject: str, body: str) -> None:
        msg = EmailMessage()
        msg["From"] = self._sender
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)
        with smtplib.SMTP(self._host, self._port, timeout=15) as smtp:
            smtp.starttls()
            smtp.login(self._user, self._password)
            smtp.send_message(msg)

    async def send_email(self, to: str, subject: str, body: str) -> None:
        try:
            await asyncio.to_thread(self._send_blocking, to, subject, body)
        except Exception:
            # Downstream retry (funnel consumer + DLX) is the safety net; log here so
            # a persistent SMTP outage shows up in the log stream, not just as a stuck
            # notification.requested backlog.
            log.exception("SmtpNotifier: send to {} failed subject={!r}", to, subject)
            raise


def make_notifier(settings) -> Notifier:
    """Pick the notifier per environment.

    Prod: require SMTP fully configured; otherwise ValueError at startup so a
    misconfigured deploy never ships a "silently disabled verification" flow.
    Dev: fall back to LoggingNotifier with a warning if SMTP fields are missing.
    """
    fields = {
        "SMTP_HOST": settings.smtp_host,
        "SMTP_PORT": settings.smtp_port,
        "SMTP_USER": settings.smtp_user,
        "SMTP_PASS": settings.smtp_pass,
        "SMTP_FROM": settings.smtp_from,
    }
    missing = [k for k, v in fields.items() if not v]
    if not missing:
        return SmtpNotifier(
            host=settings.smtp_host,
            port=settings.smtp_port,
            user=settings.smtp_user,
            password=settings.smtp_pass,
            sender=settings.smtp_from,
        )
    if settings.environment == "prod":
        raise ValueError(
            f"SMTP not configured (missing: {missing}) — verification / password-reset "
            f"would silently fail; refuse to boot in production"
        )
    log.warning(
        "SMTP missing ({}): falling back to LoggingNotifier (dev only)", missing
    )
    return LoggingNotifier()


class NotificationRequestPublisher:
    """A `notify`-compatible notifier that QUEUES the candidate notification as a
    `notification.requested` event instead of sending inline, so a transient send
    failure is retried by its own consumer (→ DLX) rather than dropped. BE-#10.
    """

    def __init__(self, publisher) -> None:
        self._publisher = publisher

    async def notify(self, application, to_state, event) -> None:
        await self._publisher.publish(
            "notification.requested",
            {
                "candidate_user_id": application.get("candidate_user_id"),
                "comp_id": application.get("comp_id"),
                "to_state": to_state,
                "event": event,
            },
        )
