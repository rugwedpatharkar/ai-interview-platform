import json
from collections.abc import Awaitable, Callable

import aio_pika

from lib.logging import get_logger, reset_correlation_id, set_correlation_id

Handler = Callable[[str, dict], Awaitable[None]]


class Consumer:
    """Subscribes a handler to topic routing keys on a durable quorum queue.

    The handler receives `(routing_key, payload)`. On success the message is
    acked. On failure it is retried up to `max_retries` times — the quorum queue
    tracks redeliveries via the `x-delivery-count` header — and once the cap is
    reached the message is dead-lettered to `"{exchange}.dlx"` instead of being
    requeued forever (which a poison message would otherwise trigger). `prefetch`
    bounds in-flight messages for backpressure.
    """

    def __init__(
        self,
        url: str,
        exchange: str = "interview",
        prefetch: int = 16,
        max_retries: int = 3,
    ) -> None:
        self._url = url
        self._exchange_name = exchange
        self._prefetch = prefetch
        self._max_retries = max_retries
        self._conn: aio_pika.abc.AbstractRobustConnection | None = None
        self._queue: aio_pika.abc.AbstractQueue | None = None
        self._log = get_logger(component="rabbitmq.consumer")

    async def connect(self) -> None:
        self._conn = await aio_pika.connect_robust(self._url)
        # RobustConnection/RobustChannel auto-restore the bindings + consumer after a
        # broker blip; log reconnects so a silent stall is at least observable.
        self._conn.reconnect_callbacks.add(self._on_reconnect)

    def _on_reconnect(self, *args) -> None:
        self._log.warning("rabbitmq consumer reconnected; consumers restored")

    async def declare(
        self, queue_name: str, routing_keys: list[str]
    ) -> aio_pika.abc.AbstractQueue:
        """Declare the durable queue + DLX + bindings WITHOUT consuming yet.

        Call this as early as possible (before any slow startup like MCP/LLM init): once
        the durable queue + bindings exist, the broker HOLDS every matching event, so a
        message published while this consumer is starting up is never dropped by the
        topic exchange. Idempotent — `subscribe()` re-declares the same topology.
        """
        if self._conn is None:
            raise RuntimeError("Consumer.connect() must be called first")
        channel = await self._conn.channel()
        await channel.set_qos(prefetch_count=self._prefetch)
        exchange = await channel.declare_exchange(
            self._exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
        )
        dlx_name = f"{self._exchange_name}.dlx"
        dlx = await channel.declare_exchange(
            dlx_name, aio_pika.ExchangeType.FANOUT, durable=True
        )
        dead_queue = await channel.declare_queue(f"{queue_name}.dead", durable=True)
        await dead_queue.bind(dlx)
        queue = await channel.declare_queue(
            queue_name,
            durable=True,
            arguments={"x-queue-type": "quorum", "x-dead-letter-exchange": dlx_name},
        )
        for key in routing_keys:
            await queue.bind(exchange, routing_key=key)
        self._queue = queue
        return queue

    async def subscribe(
        self, queue_name: str, routing_keys: list[str], handler: Handler
    ) -> None:
        queue = await self.declare(queue_name, routing_keys)
        await queue.consume(lambda message: self._process_message(message, handler))

    async def _process_message(
        self, message: aio_pika.abc.AbstractIncomingMessage, handler: Handler
    ) -> None:
        headers = message.headers or {}
        # x-delivery-count is set by quorum queues. If a legacy classic queue slips
        # in (mixed-broker migration, or someone redeclared without x-queue-type),
        # the header is absent and delivery_count stays 0 forever — a process-
        # crashing payload would hot-loop. Fall back to message.redelivered (the
        # broker-set flag on 2nd+ delivery) so a poison message dead-letters on
        # its very next delivery even without the quorum-queue header.
        raw_count = headers.get("x-delivery-count")
        if raw_count is None:
            delivery_count = 1 if message.redelivered else 0
        else:
            delivery_count = raw_count
        # Absolute ceiling, checked BEFORE the handler: x-delivery-count bumps on
        # every (re)delivery, including a requeue after a crash that closed the
        # channel pre-ack. Checking here (not just in except) stops a process-
        # crashing payload from hot-looping; it's dead-lettered next delivery. BE-#7.
        if delivery_count >= self._max_retries:
            self._log.error(
                "dead-lettering poison message {} pre-handler after {} deliveries",
                message.routing_key,
                delivery_count,
            )
            await message.nack(requeue=False)
            return
        token = None
        try:
            payload = json.loads(message.body)
            # Bind the event's correlation_id so the handler's logs + any events it
            # re-publishes carry the same id (cross-service tracing). Phase-1 helper.
            cid = payload.get("correlation_id")
            if cid:
                token = set_correlation_id(cid)
            await handler(message.routing_key or "", payload)
            await message.ack()
        except Exception:
            # delivery_count < max_retries here (pre-check), so requeue; once
            # the broker's count reaches the cap, the pre-check dead-letters.
            self._log.exception(
                "handler failed for {} (delivery {}); requeueing",
                message.routing_key,
                delivery_count,
            )
            await message.nack(requeue=True)
        finally:
            if token is not None:
                reset_correlation_id(token)

    async def close(self) -> None:
        if self._conn is not None:
            await self._conn.close()
