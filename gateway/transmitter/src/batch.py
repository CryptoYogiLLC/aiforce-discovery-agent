"""Batch processing logic for approved discoveries."""

import asyncio
import gzip
import json
import logging
from collections import deque
from typing import Any

from .client import APIClient, TransmissionError
from .database import Database
from .neo4j_mapper import Neo4jMapper
from .claim_builder import ClaimBuilder

logger = logging.getLogger(__name__)


class BatchProcessor:
    """Processes approved discoveries in batches."""

    def __init__(
        self,
        batch_size: int,
        batch_interval_s: int,
        api_client: APIClient,
        database: Database,
        output_format: str = "raw",
        max_claims_per_entity: int = 50,
        warn_batch_size_mb: float = 1.0,
        max_batch_size_mb: float = 10.0,
    ):
        self.batch_size = batch_size
        self.batch_interval_s = batch_interval_s
        self.api_client = api_client
        self.database = database
        self.output_format = output_format
        self.warn_batch_size_mb = warn_batch_size_mb
        self.max_batch_size_mb = max_batch_size_mb

        # Phase 3: Neo4j format support
        self._neo4j_mapper = Neo4jMapper() if output_format == "neo4j" else None
        self._claim_builder = ClaimBuilder(max_claims=max_claims_per_entity)

        self._queue: deque[dict[str, Any]] = deque()
        self._running = False
        self._batches_sent = 0
        self._batches_failed = 0

    @property
    def pending_count(self) -> int:
        """Number of items pending in queue."""
        return len(self._queue)

    @property
    def batches_sent(self) -> int:
        """Number of batches successfully sent."""
        return self._batches_sent

    @property
    def batches_failed(self) -> int:
        """Number of batches that failed."""
        return self._batches_failed

    def add_item(self, item: dict[str, Any]) -> None:
        """Add an item to the batch queue."""
        self._queue.append(item)
        logger.debug(f"Item added to queue, total: {len(self._queue)}")

    def is_circuit_open(self) -> bool:
        """Check if the API client's circuit breaker is open."""
        return self.api_client.is_circuit_open()

    def stop(self) -> None:
        """Stop the batch processor."""
        self._running = False

    async def run(self) -> None:
        """Run the batch processor loop."""
        self._running = True
        logger.info(
            f"Batch processor started (size={self.batch_size}, "
            f"interval={self.batch_interval_s}s)"
        )

        while self._running:
            try:
                # Check if we should process a batch
                if len(self._queue) >= self.batch_size:
                    await self._process_batch()
                else:
                    # Wait for interval and process whatever we have
                    await asyncio.sleep(self.batch_interval_s)
                    if len(self._queue) > 0:
                        await self._process_batch()

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Batch processor error: {e}")
                await asyncio.sleep(5)  # Brief pause before retrying

        # Process remaining items on shutdown
        while len(self._queue) > 0:
            try:
                await self._process_batch()
            except Exception as e:
                logger.error(f"Failed to process final batch: {e}")
                break

        logger.info("Batch processor stopped")

    def _transform_batch(self, items: list[dict[str, Any]]) -> dict[str, Any]:
        """Transform batch based on output format.

        Phase 3: Support raw (backward compatible) and neo4j formats.
        """
        if self.output_format == "neo4j" and self._neo4j_mapper:
            # Transform to Neo4j format
            batch_data = self._neo4j_mapper.map_batch(items)

            # Add claims for each entity
            all_claims = []
            for item in items:
                claims = self._claim_builder.build_claims(item)
                all_claims.extend(claims)
            batch_data["claims"] = all_claims
            batch_data["metadata"]["claim_count"] = len(all_claims)

            return batch_data
        else:
            # Raw format (backward compatible)
            return {
                "format": "raw",
                "version": "1.0.0",
                "items": items,
                "metadata": {
                    "item_count": len(items),
                },
            }

    def _check_batch_size(self, payload: dict[str, Any]) -> tuple[bool, float]:
        """Check if batch size is within limits.

        Returns:
            Tuple of (is_valid, size_mb)
        """
        payload_json = json.dumps(payload)
        compressed = gzip.compress(payload_json.encode())
        size_mb = len(compressed) / (1024 * 1024)

        if size_mb > self.max_batch_size_mb:
            logger.error(
                f"Batch too large: {size_mb:.2f}MB > {self.max_batch_size_mb}MB"
            )
            return False, size_mb

        if size_mb > self.warn_batch_size_mb:
            logger.warning(f"Large batch: {size_mb:.2f}MB")

        return True, size_mb

    async def _process_batch(self) -> None:
        """Process a single batch of items."""
        if len(self._queue) == 0:
            return

        # Collect items for batch
        items: list[dict[str, Any]] = []
        while len(items) < self.batch_size and len(self._queue) > 0:
            items.append(self._queue.popleft())

        if len(items) == 0:
            return

        # Transform batch based on output format
        transformed = self._transform_batch(items)

        # Check batch size
        is_valid, size_mb = self._check_batch_size(transformed)
        if not is_valid:
            # Re-queue items and fail
            for item in reversed(items):
                self._queue.appendleft(item)
            logger.error(f"Batch rejected: exceeds {self.max_batch_size_mb}MB limit")
            return

        # Calculate payload size
        payload_size = self.api_client.get_payload_size(items)

        # Create batch record
        batch_id = await self.database.create_batch(
            item_count=len(items),
            payload_size=payload_size,
            destination_url=self.api_client.destination_url,
        )

        logger.info(
            f"Processing batch {batch_id}: {len(items)} items, {payload_size} bytes"
        )

        try:
            # Mark batch as sending
            await self.database.update_batch_sent(batch_id)

            # Send batch
            status_code, error = await self.api_client.send_batch(items)

            if error:
                # Failed with client error (no retry)
                await self.database.update_batch_failure(
                    batch_id=batch_id,
                    http_status=status_code,
                    error_message=error,
                    retry_count=0,
                )
                self._batches_failed += 1
                logger.error(f"Batch {batch_id} failed: {status_code} - {error}")
            else:
                # Success
                await self.database.update_batch_success(batch_id, status_code)
                self._batches_sent += 1
                logger.info(f"Batch {batch_id} sent successfully")

        except TransmissionError as e:
            # Failed after retries
            await self.database.update_batch_failure(
                batch_id=batch_id,
                http_status=e.status_code,
                error_message=str(e),
                retry_count=self.api_client.retry_max_attempts,
            )
            self._batches_failed += 1
            logger.error(f"Batch {batch_id} failed after retries: {e}")

            # Re-queue items on transmission failure (except for client errors)
            if e.status_code is None or e.status_code >= 500:
                for item in reversed(items):
                    self._queue.appendleft(item)
                logger.info(f"Re-queued {len(items)} items")

        except Exception as e:
            # Unexpected error
            await self.database.update_batch_failure(
                batch_id=batch_id,
                http_status=None,
                error_message=str(e),
                retry_count=0,
            )
            self._batches_failed += 1
            logger.error(f"Batch {batch_id} unexpected error: {e}")

            # Re-queue items
            for item in reversed(items):
                self._queue.appendleft(item)
