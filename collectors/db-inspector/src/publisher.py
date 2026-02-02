"""CloudEvents publisher for RabbitMQ."""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

import aio_pika
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)


class EventPublisher:
    """Publishes CloudEvents to RabbitMQ."""

    def __init__(self, rabbitmq_url: str, exchange_name: str):
        self.rabbitmq_url = rabbitmq_url
        self.exchange_name = exchange_name
        self.connection: aio_pika.RobustConnection | None = None
        self.channel: aio_pika.Channel | None = None
        self.exchange: aio_pika.Exchange | None = None

    @property
    def is_connected(self) -> bool:
        """Check if connected to RabbitMQ."""
        return (
            self.connection is not None
            and not self.connection.is_closed
            and self.channel is not None
            and not self.channel.is_closed
        )

    @retry(
        stop=stop_after_attempt(5),
        wait=wait_exponential(multiplier=1, min=1, max=30),
    )
    async def connect(self) -> None:
        """Establish connection to RabbitMQ with retry."""
        logger.info(f"Connecting to RabbitMQ at {self.rabbitmq_url}")
        self.connection = await aio_pika.connect_robust(self.rabbitmq_url)
        self.channel = await self.connection.channel()
        self.exchange = await self.channel.get_exchange(self.exchange_name)
        logger.info("Connected to RabbitMQ successfully")

    async def close(self) -> None:
        """Close RabbitMQ connection."""
        if self.channel:
            await self.channel.close()
        if self.connection:
            await self.connection.close()
        logger.info("RabbitMQ connection closed")

    def _create_cloud_event(
        self, event_type: str, data: dict[str, Any]
    ) -> dict[str, Any]:
        """Create a CloudEvents 1.0 compliant event."""
        return {
            "specversion": "1.0",
            "type": event_type,
            "source": "/collectors/db-inspector",
            "id": str(uuid.uuid4()),
            "time": datetime.now(timezone.utc).isoformat(),
            "datacontenttype": "application/json",
            "data": data,
        }

    async def _publish(self, event_type: str, routing_key: str, data: dict[str, Any]) -> None:
        """Publish a CloudEvent to RabbitMQ."""
        if not self.is_connected or not self.exchange:
            logger.warning("Not connected to RabbitMQ, skipping publish")
            return

        event = self._create_cloud_event(event_type, data)
        message = aio_pika.Message(
            body=json.dumps(event).encode(),
            content_type="application/cloudevents+json",
            message_id=event["id"],
            timestamp=datetime.now(timezone.utc),
        )

        await self.exchange.publish(message, routing_key=routing_key)
        logger.debug(f"Published event: {event_type} with routing key: {routing_key}")

    async def publish_database_discovered(
        self,
        host: str,
        port: int,
        db_type: str,
        database: str,
    ) -> None:
        """Publish a database discovered event."""
        data = {
            "database_id": str(uuid.uuid4()),
            "host": host,
            "port": port,
            "db_type": db_type,
            "database": database,
        }
        await self._publish(
            event_type="discovery.database.discovered",
            routing_key="discovered.database",
            data=data,
        )

    async def publish_schema_discovered(
        self,
        database: str,
        table: dict[str, Any],
    ) -> None:
        """Publish a schema discovered event."""
        data = {
            "schema_id": str(uuid.uuid4()),
            "database": database,
            "table_name": table.get("name"),
            "table_schema": table.get("schema"),
            "columns": table.get("columns", []),
            "indexes": table.get("indexes", []),
            "row_count_estimate": table.get("row_count_estimate", 0),
        }
        await self._publish(
            event_type="discovery.schema.discovered",
            routing_key="discovered.schema",
            data=data,
        )

    async def publish_relationship_discovered(
        self,
        database: str,
        relationship: dict[str, Any],
    ) -> None:
        """Publish a relationship discovered event."""
        data = {
            "relationship_id": str(uuid.uuid4()),
            "database": database,
            "constraint_name": relationship.get("name"),
            "source_table": relationship.get("source_table"),
            "source_column": relationship.get("source_column"),
            "target_table": relationship.get("target_table"),
            "target_column": relationship.get("target_column"),
        }
        await self._publish(
            event_type="discovery.relationship.discovered",
            routing_key="discovered.relationship",
            data=data,
        )
