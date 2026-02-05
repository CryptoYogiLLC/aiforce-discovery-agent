"""CloudEvents publisher for infrastructure probe results.

SECURITY: Credentials are NEVER published to events.
Only system information is included in events.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import aio_pika

from .ssh_probe import ProbeResult

logger = logging.getLogger(__name__)


class EventPublisher:
    """Publishes CloudEvents to RabbitMQ.

    SECURITY: Only publishes system information, never credentials.
    """

    def __init__(
        self,
        channel: aio_pika.Channel,
        exchange_name: str,
        scan_id: str | None = None,
    ):
        self.channel = channel
        self.exchange_name = exchange_name
        self._exchange: aio_pika.Exchange | None = None
        self._scan_id = scan_id

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
    ) -> dict[str, Any]:
        """Create a CloudEvent envelope."""
        event = {
            "specversion": "1.0",
            "id": str(uuid4()),
            "source": "/collectors/infra-probe",
            "type": event_type,
            "time": datetime.now(timezone.utc).isoformat(),
            "datacontenttype": "application/json",
            "data": data,
        }

        if self._scan_id:
            event["subject"] = self._scan_id

        return event

    async def publish_infrastructure_discovered(self, result: ProbeResult) -> None:
        """
        Publish infrastructure discovered event.

        SECURITY: Only system info is published, never credentials.

        CloudEvents type: discovery.infrastructure.discovered
        Routing key: discovered.infrastructure
        """
        # Build event data from ProbeResult (no credentials)
        data = {
            "probe_id": result.probe_id,
            "target_ip": result.target_ip,
            "server_id": result.server_id,
            "hostname": result.hostname,
            "operating_system": result.operating_system,
            "hardware": result.hardware,
            "installed_software": result.installed_software,
            "running_services": result.running_services,
            "network_config": result.network_config,
            "discovered_at": datetime.now(timezone.utc).isoformat(),
        }

        # Remove empty values
        data = {k: v for k, v in data.items() if v is not None and v != {} and v != []}

        exchange = await self._get_exchange()
        event = self._create_cloudevent(
            "discovery.infrastructure.discovered",
            data,
        )

        message = aio_pika.Message(
            body=json.dumps(event).encode(),
            content_type="application/cloudevents+json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        )

        await exchange.publish(message, routing_key="discovered.infrastructure")
        logger.info(
            f"Published infrastructure event for {result.target_ip} "
            f"(probe_id: {result.probe_id})"
        )
