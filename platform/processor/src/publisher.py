"""RabbitMQ publisher for the unified processor."""

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import aio_pika
import structlog
from aio_pika.abc import AbstractChannel, AbstractConnection, AbstractExchange

from .config import settings

logger = structlog.get_logger()


class EventPublisher:
    """Publishes CloudEvents to RabbitMQ exchanges."""

    def __init__(self):
        """Initialize the publisher."""
        self._connection: AbstractConnection | None = None
        self._channel: AbstractChannel | None = None
        self._exchange: AbstractExchange | None = None

    async def connect(self) -> None:
        """Establish connection to RabbitMQ."""
        logger.info("publisher_connecting", url=settings.rabbitmq_host)

        self._connection = await aio_pika.connect_robust(
            settings.rabbitmq_url,
            client_properties={"connection_name": "processor-publisher"},
        )

        self._channel = await self._connection.channel()

        # Get the processing.events exchange (topic exchange)
        self._exchange = await self._channel.get_exchange(
            "processing.events", ensure=False
        )

        logger.info("publisher_connected")

    async def close(self) -> None:
        """Close the connection."""
        if self._channel:
            await self._channel.close()

        if self._connection:
            await self._connection.close()

        logger.info("publisher_closed")

    async def publish_scored(
        self,
        data: dict[str, Any],
        entity_type: str,
    ) -> str:
        """Publish a scored event.

        Args:
            data: The scored data to publish
            entity_type: The entity type (server, database, repository)

        Returns:
            The event ID
        """
        if not self._exchange:
            raise RuntimeError("Publisher not connected")

        # Extract original event metadata
        event_metadata = data.pop("_event_metadata", {})

        # Create CloudEvent
        event_id = str(uuid.uuid4())
        event = {
            "specversion": "1.0",
            "type": f"discovery.{entity_type}.scored",
            "source": "/platform/processor",
            "id": event_id,
            "time": datetime.now(timezone.utc).isoformat(),
            "datacontenttype": "application/json",
            "data": data,
            # Preserve correlation with original event
            "correlationid": event_metadata.get("id"),
        }

        # Routing key for scored events
        routing_key = f"scored.{entity_type}"

        # Publish message
        message = aio_pika.Message(
            body=json.dumps(event).encode("utf-8"),
            content_type="application/cloudevents+json",
            message_id=event_id,
            timestamp=datetime.now(timezone.utc),
        )

        await self._exchange.publish(message, routing_key=routing_key)

        logger.info(
            "event_published",
            event_type=event["type"],
            event_id=event_id,
            routing_key=routing_key,
        )

        return event_id
