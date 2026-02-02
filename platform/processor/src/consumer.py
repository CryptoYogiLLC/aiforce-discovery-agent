"""RabbitMQ consumer for the unified processor."""

import asyncio
import json
import structlog
from typing import Any, Callable

import aio_pika
from aio_pika import IncomingMessage
from aio_pika.abc import AbstractChannel, AbstractConnection, AbstractQueue

from .config import settings

logger = structlog.get_logger()


class EventConsumer:
    """Consumes CloudEvents from RabbitMQ queues."""

    # Queue bindings for discovered events
    QUEUE_BINDINGS = [
        ("enrichment.server.queue", "discovered.server"),
        ("enrichment.repository.queue", "discovered.repository"),
        ("enrichment.database.queue", "discovered.database"),
    ]

    def __init__(self):
        """Initialize the consumer."""
        self._connection: AbstractConnection | None = None
        self._channel: AbstractChannel | None = None
        self._queues: list[AbstractQueue] = []
        self._message_handler: Callable[[dict[str, Any]], Any] | None = None
        self._running = False

    async def connect(self) -> None:
        """Establish connection to RabbitMQ."""
        logger.info("connecting_to_rabbitmq", url=settings.rabbitmq_host)

        self._connection = await aio_pika.connect_robust(
            settings.rabbitmq_url,
            client_properties={"connection_name": "processor-consumer"},
        )

        self._channel = await self._connection.channel()
        await self._channel.set_qos(prefetch_count=settings.prefetch_count)

        logger.info("rabbitmq_connected")

    async def setup_queues(self) -> None:
        """Declare and bind to queues."""
        if not self._channel:
            raise RuntimeError("Not connected to RabbitMQ")

        for queue_name, _ in self.QUEUE_BINDINGS:
            queue = await self._channel.get_queue(queue_name, ensure=False)
            self._queues.append(queue)
            logger.info("queue_bound", queue=queue_name)

    def set_handler(
        self, handler: Callable[[dict[str, Any]], Any]
    ) -> None:
        """Set the message handler function.

        Args:
            handler: Async function that processes CloudEvent data
        """
        self._message_handler = handler

    async def start(self) -> None:
        """Start consuming messages."""
        if not self._message_handler:
            raise RuntimeError("No message handler set")

        self._running = True

        for queue in self._queues:
            await queue.consume(
                self._on_message,
                consumer_tag=f"{settings.consumer_tag}-{queue.name}",
            )
            logger.info("consuming_started", queue=queue.name)

    async def stop(self) -> None:
        """Stop consuming and close connection."""
        self._running = False

        if self._channel:
            await self._channel.close()

        if self._connection:
            await self._connection.close()

        logger.info("consumer_stopped")

    async def _on_message(self, message: IncomingMessage) -> None:
        """Handle incoming message.

        Args:
            message: The incoming RabbitMQ message
        """
        async with message.process(requeue=True):
            try:
                # Parse CloudEvent
                body = message.body.decode("utf-8")
                event = json.loads(body)

                logger.info(
                    "message_received",
                    event_type=event.get("type"),
                    event_id=event.get("id"),
                    routing_key=message.routing_key,
                )

                # Extract data from CloudEvent
                data = event.get("data", {})

                # Add event metadata to data for processing
                data["_event_metadata"] = {
                    "id": event.get("id"),
                    "type": event.get("type"),
                    "source": event.get("source"),
                    "time": event.get("time"),
                }

                # Process through handler
                if self._message_handler:
                    await self._message_handler(data)

                logger.info(
                    "message_processed",
                    event_id=event.get("id"),
                )

            except json.JSONDecodeError as e:
                logger.error(
                    "invalid_json",
                    error=str(e),
                    body_preview=message.body[:100].decode("utf-8", errors="replace"),
                )
                # Don't requeue invalid messages
                await message.reject(requeue=False)

            except Exception as e:
                logger.error(
                    "processing_error",
                    error=str(e),
                    error_type=type(e).__name__,
                )
                # Will be requeued due to context manager

    async def wait_for_messages(self) -> None:
        """Wait while processing messages."""
        while self._running:
            await asyncio.sleep(1)
