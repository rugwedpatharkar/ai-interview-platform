import pytest

from app.infra.notifier import LoggingNotifier


@pytest.mark.asyncio
async def test_logging_notifier_records_sent():
    n = LoggingNotifier()
    await n.send_email("a@x.com", "Verify", "link")
    assert n.sent == [("a@x.com", "Verify", "link")]
