"""Tests for CloudEvents publisher module."""

import json
import pytest
from unittest.mock import MagicMock, AsyncMock

from src.publisher import EventPublisher
from src.ssh_probe import ProbeResult


class TestEventPublisher:
    """Tests for EventPublisher class."""

    @pytest.fixture
    def mock_channel(self):
        """Create a mock aio_pika channel."""
        channel = MagicMock()
        channel.declare_exchange = AsyncMock()
        return channel

    @pytest.fixture
    def publisher(self, mock_channel):
        """Create a publisher with mock channel."""
        return EventPublisher(
            channel=mock_channel,
            exchange_name="discovery.events",
        )

    def test_set_scan_id(self, publisher):
        """Publisher should store scan_id for CloudEvent subject."""
        publisher.set_scan_id("scan-xyz-123")
        assert publisher._scan_id == "scan-xyz-123"

    def test_create_cloudevent_structure(self, publisher):
        """CloudEvent should have required fields."""
        event = publisher._create_cloudevent(
            "test.event.type",
            {"key": "value"},
        )

        assert event["specversion"] == "1.0"
        assert "id" in event
        assert event["source"] == "/collectors/infra-probe"
        assert event["type"] == "test.event.type"
        assert "time" in event
        assert event["datacontenttype"] == "application/json"
        assert event["data"] == {"key": "value"}

    def test_create_cloudevent_with_scan_id(self, publisher):
        """CloudEvent should include subject when scan_id is set."""
        publisher.set_scan_id("scan-abc")
        event = publisher._create_cloudevent(
            "test.event.type",
            {"key": "value"},
        )

        assert event["subject"] == "scan-abc"

    def test_create_cloudevent_without_scan_id(self, publisher):
        """CloudEvent should not include subject when scan_id is not set."""
        event = publisher._create_cloudevent(
            "test.event.type",
            {"key": "value"},
        )

        assert "subject" not in event

    @pytest.mark.asyncio
    async def test_publish_infrastructure_discovered(self, publisher, mock_channel):
        """Publisher should publish infrastructure event."""
        # Setup mock exchange
        mock_exchange = MagicMock()
        mock_exchange.publish = AsyncMock()
        mock_channel.declare_exchange.return_value = mock_exchange

        # Create a probe result
        result = ProbeResult(
            probe_id="probe-123",
            target_ip="192.168.1.100",
            server_id="server-abc",
            hostname="testhost",
            operating_system={"name": "Ubuntu", "version": "22.04"},
            hardware={"cpu_cores": 4, "memory_gb": 16},
            success=True,
        )

        await publisher.publish_infrastructure_discovered(result)

        # Verify exchange was declared
        mock_channel.declare_exchange.assert_called_once()

        # Verify message was published
        mock_exchange.publish.assert_called_once()
        call_args = mock_exchange.publish.call_args

        # Check routing key
        assert call_args.kwargs["routing_key"] == "discovered.infrastructure"

        # Check message content
        message = call_args.args[0]
        body = json.loads(message.body.decode())

        assert body["type"] == "discovery.infrastructure.discovered"
        assert body["data"]["probe_id"] == "probe-123"
        assert body["data"]["target_ip"] == "192.168.1.100"
        assert body["data"]["hostname"] == "testhost"

    @pytest.mark.asyncio
    async def test_publish_excludes_empty_values(self, publisher, mock_channel):
        """Publisher should exclude empty values from event data."""
        mock_exchange = MagicMock()
        mock_exchange.publish = AsyncMock()
        mock_channel.declare_exchange.return_value = mock_exchange

        # Create a result with some empty fields
        result = ProbeResult(
            probe_id="probe-123",
            target_ip="192.168.1.100",
            hostname="testhost",
            operating_system={},  # Empty dict
            installed_software=[],  # Empty list
            success=True,
        )

        await publisher.publish_infrastructure_discovered(result)

        message = mock_exchange.publish.call_args.args[0]
        body = json.loads(message.body.decode())

        # Empty values should be excluded
        assert "operating_system" not in body["data"]
        assert "installed_software" not in body["data"]
        # Non-empty values should be included
        assert "hostname" in body["data"]

    @pytest.mark.asyncio
    async def test_publish_never_includes_credentials(self, publisher, mock_channel):
        """Published events should never contain credential-like fields."""
        mock_exchange = MagicMock()
        mock_exchange.publish = AsyncMock()
        mock_channel.declare_exchange.return_value = mock_exchange

        result = ProbeResult(
            probe_id="probe-123",
            target_ip="192.168.1.100",
            hostname="testhost",
            success=True,
        )

        await publisher.publish_infrastructure_discovered(result)

        message = mock_exchange.publish.call_args.args[0]
        body_str = message.body.decode()

        # Ensure no credential-related keys exist
        assert "password" not in body_str.lower()
        assert "private_key" not in body_str.lower()
        assert "passphrase" not in body_str.lower()
        assert "credential" not in body_str.lower()
