from typing import Protocol


class Notifier(Protocol):
    async def send_email(self, to: str, subject: str, body: str) -> None: ...


class LoggingNotifier:
    """Dev/test notifier — records messages instead of sending."""

    def __init__(self) -> None:
        self.sent: list[tuple[str, str, str]] = []

    async def send_email(self, to: str, subject: str, body: str) -> None:
        self.sent.append((to, subject, body))
