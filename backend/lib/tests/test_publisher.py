import json

import pytest
from lib.rabbitmq import Publisher


class _FakeExchange:
    def __init__(self, fail_once: bool = False):
        self.calls = []
        self.messages = []
        self._fail_once = fail_once
        self._failed = False

    async def publish(self, message, routing_key, **kwargs):
        if self._fail_once and not self._failed:
            self._failed = True
            raise RuntimeError("simulated channel error")
        self.calls.append((routing_key, kwargs))
        self.messages.append(message)


class _FakeConn:
    def __init__(self, exchange):
        self._exchange = exchange

    async def channel(self, **kwargs):
        return _FakeChannel(self._exchange)

    async def close(self):
        pass


class _FakeChannel:
    def __init__(self, exchange):
        self._exchange = exchange

    async def declare_exchange(self, name, type_, **kwargs):
        return self._exchange


@pytest.mark.asyncio
async def test_publish_is_mandatory_to_surface_lost_events():
    fake_exchange = _FakeExchange()
    pub = Publisher("amqp://unused")
    pub._conn = _FakeConn(fake_exchange)  # satisfy the connect-guard
    pub._exchange = fake_exchange
    await pub.publish("application.created", {"application_id": "a1"})
    routing_key, kwargs = pub._exchange.calls[0]
    assert routing_key == "application.created"
    # mandatory=True makes an unroutable publish raise instead of silently dropping.
    assert kwargs.get("mandatory") is True


@pytest.mark.asyncio
async def test_publisher_reacquires_exchange_after_publish_error():
    """BE-#12: publish failure clears the exchange; next call re-acquires it."""
    fresh_exchange = _FakeExchange()
    pub = Publisher("amqp://unused")
    # First exchange will fail once, then succeed
    failing_exchange = _FakeExchange(fail_once=True)
    pub._conn = _FakeConn(fresh_exchange)
    pub._exchange = failing_exchange

    # First publish: fails, clears _exchange
    with pytest.raises(RuntimeError, match="simulated channel error"):
        await pub.publish("test.event", {"x": 1})

    # _exchange must be cleared after the error
    assert pub._exchange is None

    # Second publish: re-acquires exchange (fresh_exchange via _conn) and succeeds
    await pub.publish("test.event", {"x": 2})
    assert pub._exchange is not None
    assert len(fresh_exchange.calls) == 1
    assert fresh_exchange.calls[0][0] == "test.event"


@pytest.mark.asyncio
async def test_publisher_raises_when_connect_not_called():
    """Publish without connect raises RuntimeError, not an obscure AttributeError."""
    pub = Publisher("amqp://unused")
    with pytest.raises(RuntimeError, match="connect"):
        await pub.publish("x.y", {})


@pytest.mark.asyncio
async def test_publisher_logs_on_send():
    """Smoke test: publish with a working fake exchange does not raise."""
    fake_exchange = _FakeExchange()
    pub = Publisher("amqp://unused")
    pub._conn = _FakeConn(fake_exchange)
    pub._exchange = fake_exchange
    await pub.publish("interview.started", {"session_id": "s1"})
    assert len(pub._exchange.calls) == 1


@pytest.mark.asyncio
async def test_publish_injects_correlation_id_when_none_set():
    """Every event gets a correlation_id; one is generated when none is set."""
    fake_exchange = _FakeExchange()
    pub = Publisher("amqp://unused")
    pub._conn = _FakeConn(fake_exchange)
    pub._exchange = fake_exchange
    await pub.publish("application.created", {"application_id": "a1"})
    body = json.loads(fake_exchange.messages[0].body)
    assert body["application_id"] == "a1"
    assert body["correlation_id"]  # present + non-empty


@pytest.mark.asyncio
async def test_publish_preserves_existing_correlation_id():
    """A correlation_id already on the payload is preserved (not regenerated)."""
    fake_exchange = _FakeExchange()
    pub = Publisher("amqp://unused")
    pub._conn = _FakeConn(fake_exchange)
    pub._exchange = fake_exchange
    await pub.publish("x.y", {"correlation_id": "fixed-123"})
    body = json.loads(fake_exchange.messages[0].body)
    assert body["correlation_id"] == "fixed-123"
