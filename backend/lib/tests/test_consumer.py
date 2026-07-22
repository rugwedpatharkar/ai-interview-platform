import pytest
from lib.rabbitmq import Consumer


class FakeMessage:
    """Async stand-in for aio_pika IncomingMessage (subset Consumer uses).

    Quorum queues expose redelivery count via the `x-delivery-count` header;
    we set it directly to drive the retry/dead-letter decision.
    """

    def __init__(
        self, body=b"{}", headers=None, routing_key="job.published", redelivered=False
    ):
        self.body = body
        self.headers = headers or {}
        self.routing_key = routing_key
        self.acked = False
        self.nack_requeue = "UNSET"
        self.redelivered = redelivered

    async def ack(self):
        self.acked = True

    async def nack(self, requeue=False):
        self.nack_requeue = requeue


@pytest.mark.asyncio
async def test_acks_and_passes_routing_key_and_payload():
    seen = []

    async def handler(routing_key, payload):
        seen.append((routing_key, payload))

    consumer = Consumer("amqp://test")
    msg = FakeMessage(body=b'{"id": 7}', routing_key="aptitude.graded")

    await consumer._process_message(msg, handler)

    assert seen == [("aptitude.graded", {"id": 7})]
    assert msg.acked is True
    assert msg.nack_requeue == "UNSET"  # success never nacks


@pytest.mark.asyncio
async def test_requeues_when_below_max_retries():
    async def failing(routing_key, payload):
        raise ValueError("boom")

    consumer = Consumer("amqp://test", max_retries=3)
    msg = FakeMessage(headers={"x-delivery-count": 0})

    await consumer._process_message(msg, failing)

    assert msg.nack_requeue is True  # retry
    assert msg.acked is False


@pytest.mark.asyncio
async def test_dead_letters_at_max_retries():
    async def failing(routing_key, payload):
        raise ValueError("boom")

    consumer = Consumer("amqp://test", max_retries=3)
    msg = FakeMessage(headers={"x-delivery-count": 3})

    await consumer._process_message(msg, failing)

    assert msg.nack_requeue is False  # give up → dead-letter via DLX, not requeue
    assert msg.acked is False


@pytest.mark.asyncio
async def test_max_retries_is_configurable():
    async def failing(routing_key, payload):
        raise ValueError("boom")

    consumer = Consumer("amqp://test", max_retries=1)
    msg = FakeMessage(headers={"x-delivery-count": 1})

    await consumer._process_message(msg, failing)

    assert msg.nack_requeue is False  # cap of 1 reached at delivery 1


@pytest.mark.asyncio
async def test_poison_message_dead_lettered_before_handler():
    """Past the ceiling, the message is dead-lettered WITHOUT running the handler
    — so a payload that crashes the process can't hot-loop forever (BE-#7)."""
    called = False

    async def handler(routing_key, payload):
        nonlocal called
        called = True

    consumer = Consumer("amqp://test", max_retries=3)
    msg = FakeMessage(headers={"x-delivery-count": 3})

    await consumer._process_message(msg, handler)

    assert called is False  # handler never ran — poison caught pre-execution
    assert msg.nack_requeue is False  # dead-lettered via DLX
    assert msg.acked is False


@pytest.mark.asyncio
async def test_correlation_id_bound_for_handler_then_reset():
    """The event's correlation_id is bound for the handler and reset afterwards."""
    from lib.logging import current_correlation_id

    seen = {}

    async def handler(routing_key, payload):
        seen["cid"] = current_correlation_id()

    consumer = Consumer("amqp://test")
    msg = FakeMessage(body=b'{"correlation_id": "abc-123"}')
    await consumer._process_message(msg, handler)

    assert seen["cid"] == "abc-123"  # bound during the handler
    assert msg.acked is True
    assert current_correlation_id() is None  # reset in finally
