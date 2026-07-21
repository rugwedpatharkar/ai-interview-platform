from types import SimpleNamespace

import pytest

from app.infra.notifier import LoggingNotifier, SmtpNotifier, make_notifier


@pytest.mark.asyncio
async def test_logging_notifier_records_sent():
    n = LoggingNotifier()
    await n.send_email("a@x.com", "Verify", "link")
    assert n.sent == [("a@x.com", "Verify", "link")]


def _settings(**over) -> SimpleNamespace:
    base = {
        "environment": "dev",
        "smtp_host": "",
        "smtp_port": 587,
        "smtp_user": "",
        "smtp_pass": "",
        "smtp_from": "",
    }
    base.update(over)
    return SimpleNamespace(**base)


def test_make_notifier_returns_smtp_when_configured():
    s = _settings(
        smtp_host="smtp.example.com",
        smtp_user="u",
        smtp_pass="p",
        smtp_from="noreply@example.com",
    )
    assert isinstance(make_notifier(s), SmtpNotifier)


def test_make_notifier_dev_fallback_to_logging():
    # Any SMTP field missing → warning + LoggingNotifier in dev.
    assert isinstance(make_notifier(_settings()), LoggingNotifier)


def test_make_notifier_prod_refuses_partial_smtp():
    s = _settings(environment="prod", smtp_host="smtp.example.com")  # rest empty
    with pytest.raises(ValueError):
        make_notifier(s)


def test_make_notifier_prod_refuses_completely_unset():
    with pytest.raises(ValueError):
        make_notifier(_settings(environment="prod"))


@pytest.mark.asyncio
async def test_smtp_notifier_starttls_before_login(monkeypatch):
    # Solid-area pin (H8 sibling): STARTTLS must run BEFORE login so credentials
    # never cross the wire in cleartext. A regression that reordered these two
    # calls would leak SMTP_PASS on every send.
    calls: list[str] = []

    class _FakeSmtp:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def starttls(self):
            calls.append("starttls")

        def login(self, u, p):
            calls.append("login")

        def send_message(self, msg):
            calls.append("send")

    import app.infra.notifier as notifier_mod

    monkeypatch.setattr(notifier_mod.smtplib, "SMTP", _FakeSmtp)
    n = SmtpNotifier(
        host="smtp.example.com",
        port=587,
        user="u",
        password="p",
        sender="from@x.com",
    )
    await n.send_email("to@x.com", "s", "b")
    assert calls == ["starttls", "login", "send"], (
        f"expected starttls before login before send, got {calls}"
    )
