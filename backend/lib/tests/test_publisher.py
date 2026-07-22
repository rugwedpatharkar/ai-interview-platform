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
async def test_publisher_retries_in_place_after_publish_error():
    """A dropped channel now retries in-place: the first publish raises internally,
    the exchange handle is invalidated + re-acquired, and the retry succeeds — the
    caller sees a single successful publish instead of a failure they must handle."""
    fresh_exchange = _FakeExchange()
    pub = Publisher("amqp://unused")
    # First exchange fails once then succeeds; second attempt hits fresh_exchange.
    failing_exchange = _FakeExchange(fail_once=True)
    pub._conn = _FakeConn(fresh_exchange)
    pub._exchange = failing_exchange

    # Single call — the internal retry acquires fresh_exchange and publishes there.
    await pub.publish("test.event", {"x": 1})

    assert pub._exchange is fresh_exchange
    assert len(fresh_exchange.calls) == 1
    assert fresh_exchange.calls[0][0] == "test.event"


@pytest.mark.asyncio
async def test_publisher_raises_after_two_consecutive_failures():
    """If BOTH attempts fail (broker truly down), the exception surfaces so the
    caller can decide (enqueue_replay for audit rows, DLX for events, etc.)."""
    pub = Publisher("amqp://unused")
    broken = _FakeExchange(fail_once=False)  # never succeeds

    async def _always_fail(message, routing_key, **kwargs):
        raise RuntimeError("simulated channel error")

    broken.publish = _always_fail  # type: ignore[method-assign]
    pub._conn = _FakeConn(broken)
    pub._exchange = broken
    with pytest.raises(RuntimeError, match="simulated channel error"):
        await pub.publish("test.event", {"x": 2})


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
