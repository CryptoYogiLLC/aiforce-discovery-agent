"""CloudEvents publisher for code analysis results."""

import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import aio_pika

logger = logging.getLogger(__name__)


class EventPublisher:
    """Publishes CloudEvents to RabbitMQ."""

    def __init__(
        self,
        channel: aio_pika.Channel,
        exchange_name: str,
        scan_id: str | None = None,  # ADR-007: scan_id for CloudEvent subject
    ):
        self.channel = channel
        self.exchange_name = exchange_name
        self._exchange: aio_pika.Exchange | None = None
        self._scan_id = scan_id  # ADR-007: Used as CloudEvent subject

    def set_scan_id(self, scan_id: str | None) -> None:
        """Set the scan_id for CloudEvent subject (ADR-007)."""
        self._scan_id = scan_id

    async def _get_exchange(self) -> aio_pika.Exchange:
        """Get or create the exchange."""
        if self._exchange is None:
            self._exchange = await self.channel.declare_exchange(
                self.exchange_name,
                aio_pika.ExchangeType.TOPIC,
                durable=True,
            )
        return self._exchange

    def _create_cloudevent(
        self,
        event_type: str,
        data: dict[str, Any],
        source: str = "code-analyzer",
    ) -> dict[str, Any]:
        """Create a CloudEvent envelope."""
        event = {
            "specversion": "1.0",
            "id": str(uuid4()),
            "source": f"/collectors/{source}",  # ADR-007: Standardized source
            "type": event_type,
            "time": datetime.now(timezone.utc).isoformat(),
            "datacontenttype": "application/json",
            "data": data,
        }

        # ADR-007: Set subject = scan_id for orchestration tracking
        if self._scan_id:
            event["subject"] = self._scan_id

        return event

    async def _publish(
        self,
        routing_key: str,
        event_type: str,
        data: dict[str, Any],
    ) -> None:
        """Publish a CloudEvent."""
        exchange = await self._get_exchange()
        event = self._create_cloudevent(event_type, data)

        message = aio_pika.Message(
            body=json.dumps(event).encode(),
            content_type="application/cloudevents+json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        )

        await exchange.publish(message, routing_key=routing_key)
        logger.info(f"Published {event_type} event to {routing_key}")

    async def publish_repository_discovered(
        self,
        analysis_id: str,
        repo_url: str,
        branch: str,
        languages: dict[str, Any],
        frameworks: list[dict[str, Any]],
    ) -> None:
        """
        Publish repository discovered event.

        CloudEvents type: discovery.repository.discovered
        Routing key: discovered.repository
        """
        data = {
            "analysis_id": analysis_id,
            "repository_url": repo_url,
            "branch": branch,
            "languages": languages,
            "frameworks": frameworks,
            "discovered_at": datetime.now(timezone.utc).isoformat(),
        }

        await self._publish(
            routing_key="discovered.repository",
            event_type="discovery.repository.discovered",
            data=data,
        )

    async def publish_codebase_discovered(
        self,
        analysis_id: str,
        repo_url: str,
        metrics: dict[str, Any],
    ) -> None:
        """
        Publish codebase metrics discovered event.

        CloudEvents type: discovery.codebase.discovered
        Routing key: discovered.codebase
        """
        data = {
            "analysis_id": analysis_id,
            "repository_url": repo_url,
            "metrics": metrics,
            "discovered_at": datetime.now(timezone.utc).isoformat(),
        }

        await self._publish(
            routing_key="discovered.codebase",
            event_type="discovery.codebase.discovered",
            data=data,
        )

    async def publish_dependency_discovered(
        self,
        analysis_id: str,
        repo_url: str,
        dependency: dict[str, Any],
    ) -> None:
        """
        Publish dependency discovered event.

        CloudEvents type: discovery.dependency.discovered
        Routing key: discovered.dependency
        """
        data = {
            "analysis_id": analysis_id,
            "repository_url": repo_url,
            "dependency": dependency,
            "discovered_at": datetime.now(timezone.utc).isoformat(),
        }

        await self._publish(
            routing_key="discovered.dependency",
            event_type="discovery.dependency.discovered",
            data=data,
        )
