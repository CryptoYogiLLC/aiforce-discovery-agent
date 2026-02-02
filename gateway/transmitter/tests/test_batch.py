"""Tests for batch processing logic."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from src.batch import BatchProcessor


@pytest.fixture
def mock_api_client():
    """Create a mock API client."""
    client = MagicMock()
    client.is_circuit_open.return_value = False
    client.get_payload_size.return_value = 1000
    client.send_batch = AsyncMock(return_value=(200, None))
    client.retry_max_attempts = 3
    client.destination_url = "https://api.example.com/v1/discovery"
    return client


@pytest.fixture
def mock_database():
    """Create a mock database."""
    db = MagicMock()
    db.create_batch = AsyncMock(return_value="batch-123")
    db.update_batch_sent = AsyncMock()
    db.update_batch_success = AsyncMock()
    db.update_batch_failure = AsyncMock()
    return db


@pytest.fixture
def batch_processor(mock_api_client, mock_database):
    """Create a batch processor with mocks."""
    return BatchProcessor(
        batch_size=10,
        batch_interval_s=60,
        api_client=mock_api_client,
        database=mock_database,
    )


class TestBatchProcessor:
    """Tests for BatchProcessor class."""

    def test_add_item(self, batch_processor):
        """Should add items to queue."""
        batch_processor.add_item({"id": "1"})
        batch_processor.add_item({"id": "2"})

        assert batch_processor.pending_count == 2

    def test_initial_stats(self, batch_processor):
        """Should start with zero stats."""
        assert batch_processor.batches_sent == 0
        assert batch_processor.batches_failed == 0
        assert batch_processor.pending_count == 0

    def test_circuit_open_check(self, batch_processor, mock_api_client):
        """Should check circuit breaker status."""
        mock_api_client.is_circuit_open.return_value = True
        assert batch_processor.is_circuit_open() is True

        mock_api_client.is_circuit_open.return_value = False
        assert batch_processor.is_circuit_open() is False

    @pytest.mark.asyncio
    async def test_process_batch_success(
        self, batch_processor, mock_api_client, mock_database
    ):
        """Should process batch successfully."""
        # Add items
        for i in range(5):
            batch_processor.add_item({"id": str(i)})

        # Process batch
        await batch_processor._process_batch()

        # Verify
        assert batch_processor.batches_sent == 1
        assert batch_processor.batches_failed == 0
        assert batch_processor.pending_count == 0

        mock_database.create_batch.assert_called_once()
        mock_database.update_batch_sent.assert_called_once()
        mock_database.update_batch_success.assert_called_once_with("batch-123", 200)

    @pytest.mark.asyncio
    async def test_process_batch_client_error(
        self, batch_processor, mock_api_client, mock_database
    ):
        """Should handle client errors without requeue."""
        mock_api_client.send_batch = AsyncMock(return_value=(400, "Bad request"))

        batch_processor.add_item({"id": "1"})
        await batch_processor._process_batch()

        assert batch_processor.batches_sent == 0
        assert batch_processor.batches_failed == 1
        assert batch_processor.pending_count == 0  # Not requeued

        mock_database.update_batch_failure.assert_called_once()

    @pytest.mark.asyncio
    async def test_process_empty_batch(self, batch_processor, mock_database):
        """Should handle empty queue gracefully."""
        await batch_processor._process_batch()

        assert batch_processor.batches_sent == 0
        mock_database.create_batch.assert_not_called()

    @pytest.mark.asyncio
    async def test_batch_size_limit(self, batch_processor):
        """Should respect batch size limit."""
        # Add more items than batch size
        for i in range(15):
            batch_processor.add_item({"id": str(i)})

        # Process one batch
        await batch_processor._process_batch()

        # Should only process batch_size items
        assert batch_processor.pending_count == 5  # 15 - 10 = 5
