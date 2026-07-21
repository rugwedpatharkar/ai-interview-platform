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
