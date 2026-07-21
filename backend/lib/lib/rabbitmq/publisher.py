import asyncio
import json

import aio_pika

from lib.logging import current_correlation_id, get_logger, new_correlation_id

log = get_logger(component="rabbitmq.publisher")


class Publisher:
    """Publishes JSON events to a durable topic exchange.

    Routing keys follow `"{domain}.{action}"`. Uses a robust connection that
    transparently reconnects. One Publisher per service process; call `connect()`
    on startup and `close()` on shutdown.

    BE-#12: If a publish fails (channel closed, broker restart, etc.), the
    exchange handle is cleared. The next publish re-acquires a channel and
    redeclares the exchange before sending, so the publisher self-heals without
    a service restart.
    """

    def __init__(self, url: str, exchange: str = "interview") -> None:
        self._url = url
        self._exchange_name = exchange
        self._conn: aio_pika.abc.AbstractRobustConnection | None = None
        self._exchange: aio_pika.abc.AbstractExchange | None = None
        self._exchange_lock = asyncio.Lock()

    async def connect(self) -> None:
        self._conn = await aio_pika.connect_robust(self._url)
        self._exchange = await self._acquire_exchange()
        log.info("publisher.connected exchange={}", self._exchange_name)

    async def _acquire_exchange(self) -> aio_pika.abc.AbstractExchange:
        """Open a new channel and (re)declare the exchange."""
        channel = await self._conn.channel(publisher_confirms=True)
        return await channel.declare_exchange(
            self._exchange_name, aio_pika.ExchangeType.TOPIC, durable=True
        )

    async def publish(self, routing_key: str, payload: dict) -> None:
        if self._conn is None:
            raise RuntimeError("Publisher.connect() must be called first")
        # Re-acquire a fresh exchange handle if the previous one was invalidated by a
        # publish error (BE-#12). The lock + double-check means concurrent publishes
        # re-acquire ONCE instead of each opening (and orphaning) a channel.
        if self._exchange is None:
            async with self._exchange_lock:
                if self._exchange is None:
                    log.info("publisher.reacquire exchange={}", self._exchange_name)
                    self._exchange = await self._acquire_exchange()

        # Stamp a correlation_id onto every event (existing > current context > new) so
        # the consumer binds it and one interview/request is traceable across services.
        cid = (
            payload.get("correlation_id")
            or current_correlation_id()
            or new_correlation_id()
        )
        payload = {**payload, "correlation_id": cid}

        # default=str keeps datetime/ObjectId/Decimal from raising TypeError and
        # invalidating the exchange handle mid-publish (a payload with any of those
        # would previously crash the publisher until the next self-heal). Downstream
        # consumers already parse as strings.
        message = aio_pika.Message(
            body=json.dumps(payload, default=str).encode(),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        )
        # One-shot in-place retry on a dropped channel: the first attempt invalidates
        # the exchange handle; the second attempt re-acquires and publishes. Prevents
        # a routine broker restart from silently dropping every in-flight publish
        # onto the caller (who then either logs+swallows or fails their whole op).
        for attempt in (1, 2):
            try:
                # publisher_confirms + mandatory: an unroutable or unacked publish
                # raises instead of vanishing, so a lost funnel event surfaces.
                await self._exchange.publish(
                    message, routing_key=routing_key, mandatory=True
                )
                log.debug(
                    "publisher.sent routing_key={} attempt={}", routing_key, attempt
                )
                return
            except Exception:
                # Invalidate the exchange handle so the next call re-acquires it.
                self._exchange = None
                if attempt == 2:
                    log.exception(
                        "publisher.error routing_key={} attempts={}",
                        routing_key,
                        attempt,
                    )
                    raise
                log.warning(
                    "publisher.retry routing_key={} attempt={}", routing_key, attempt
                )
                async with self._exchange_lock:
                    if self._exchange is None:
                        self._exchange = await self._acquire_exchange()

    async def close(self) -> None:
        if self._conn is not None:
            await self._conn.close()
            log.info("publisher.closed exchange={}", self._exchange_name)
