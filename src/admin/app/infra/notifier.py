from typing import Protocol


class Notifier(Protocol):
    async def send_email(self, to: str, subject: str, body: str) -> None: ...


class LoggingNotifier:
    """Dev/test notifier — records messages instead of sending."""

    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str]] = []

    async def send_email(self, to: str, subject: str, body: str) -> None:
        self.sent.append((to, subject, body))


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
