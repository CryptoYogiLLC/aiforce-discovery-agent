"""RabbitMQ consumer for approved events."""

import json
import logging

import aio_pika

logger = logging.getLogger(__name__)


class EventConsumer:
    """Consumes approved discovery events from RabbitMQ."""

    def __init__(
        self,
        rabbitmq_url: str,
        exchange: str,
        queue: str,
        batch_processor: "BatchProcessor",
    ):
        self.rabbitmq_url = rabbitmq_url
        self.exchange = exchange
        self.queue = queue
        self.batch_processor = batch_processor
        self.connection: aio_pika.RobustConnection | None = None
        self.channel: aio_pika.Channel | None = None
        self._connected = False

    @property
    def is_connected(self) -> bool:
        """Check if connected to RabbitMQ."""
        return self._connected

    async def start(self) -> None:
        """Start consuming events."""
        try:
            self.connection = await aio_pika.connect_robust(self.rabbitmq_url)
            self.channel = await self.connection.channel()

            # Declare queue
            queue = await self.channel.declare_queue(
                self.queue,
                durable=True,
            )

            # Bind to approved.* events
            exchange = await self.channel.get_exchange(self.exchange)
            await queue.bind(exchange, routing_key="approved.*")

            # Start consuming
            await queue.consume(self._handle_message)

            self._connected = True
            logger.info("RabbitMQ consumer started, listening for approved.* events")

            # Handle connection close
            self.connection.close_callbacks.add(self._on_connection_close)

        except Exception as e:
            logger.error(f"Failed to connect to RabbitMQ: {e}")
            raise

    async def stop(self) -> None:
        """Stop consuming events."""
        if self.channel:
            await self.channel.close()
        if self.connection:
            await self.connection.close()
        self._connected = False
        logger.info("RabbitMQ consumer stopped")

    def _on_connection_close(self, *args):
        """Handle connection close."""
        self._connected = False
        logger.warning("RabbitMQ connection closed")

    async def _handle_message(
        self, message: aio_pika.abc.AbstractIncomingMessage
    ) -> None:
        """Handle incoming message."""
        async with message.process():
            try:
                event = json.loads(message.body.decode())
                logger.debug(f"Received event: {event.get('type')}")

                # Add to batch processor
                self.batch_processor.add_item(event)

            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse message: {e}")
            except Exception as e:
                logger.error(f"Error processing message: {e}")
                # Requeue on error
                raise


# Forward reference for type hint
from .batch import BatchProcessor  # noqa: E402
