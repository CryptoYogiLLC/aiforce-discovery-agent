"""Database operations for transmission tracking."""

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import asyncpg

logger = logging.getLogger(__name__)


class Database:
    """PostgreSQL database client for transmission tracking."""

    def __init__(self, database_url: str):
        self.database_url = database_url
        self.pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        """Establish database connection pool."""
        self.pool = await asyncpg.create_pool(
            self.database_url,
            min_size=1,
            max_size=10,
        )

    async def disconnect(self) -> None:
        """Close database connection pool."""
        if self.pool:
            await self.pool.close()
            self.pool = None

    async def is_healthy(self) -> bool:
        """Check database connection health."""
        if not self.pool:
            return False
        try:
            async with self.pool.acquire() as conn:
                await conn.execute("SELECT 1")
            return True
        except Exception:
            return False

    async def migrate(self) -> None:
        """Run database migrations."""
        if not self.pool:
            raise RuntimeError("Database not connected")

        async with self.pool.acquire() as conn:
            await conn.execute("""
                CREATE SCHEMA IF NOT EXISTS transmitter;
            """)

            await conn.execute("""
                CREATE TABLE IF NOT EXISTS transmitter.batches (
                    id UUID PRIMARY KEY,
                    status VARCHAR(20) NOT NULL DEFAULT 'pending',
                    item_count INTEGER NOT NULL,
                    payload_size INTEGER NOT NULL,
                    destination_url TEXT NOT NULL,
                    http_status INTEGER,
                    error_message TEXT,
                    retry_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT NOW(),
                    sent_at TIMESTAMP,
                    completed_at TIMESTAMP
                );
            """)

            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_batches_status
                ON transmitter.batches(status);
            """)

            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_batches_created_at
                ON transmitter.batches(created_at DESC);
            """)

        logger.info("Database migrations completed")

    async def create_batch(
        self,
        item_count: int,
        payload_size: int,
        destination_url: str,
    ) -> str:
        """Create a new batch record."""
        if not self.pool:
            raise RuntimeError("Database not connected")

        batch_id = str(uuid4())

        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO transmitter.batches
                (id, item_count, payload_size, destination_url, created_at)
                VALUES ($1, $2, $3, $4, $5)
                """,
                batch_id,
                item_count,
                payload_size,
                destination_url,
                datetime.now(timezone.utc),
            )

        return batch_id

    async def update_batch_sent(self, batch_id: str) -> None:
        """Mark batch as sent (in progress)."""
        if not self.pool:
            raise RuntimeError("Database not connected")

        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE transmitter.batches
                SET status = 'sending', sent_at = $2
                WHERE id = $1
                """,
                batch_id,
                datetime.now(timezone.utc),
            )

    async def update_batch_success(self, batch_id: str, http_status: int) -> None:
        """Mark batch as successfully transmitted."""
        if not self.pool:
            raise RuntimeError("Database not connected")

        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE transmitter.batches
                SET status = 'success', http_status = $2, completed_at = $3
                WHERE id = $1
                """,
                batch_id,
                http_status,
                datetime.now(timezone.utc),
            )

    async def update_batch_failure(
        self,
        batch_id: str,
        http_status: int | None,
        error_message: str,
        retry_count: int,
    ) -> None:
        """Mark batch as failed."""
        if not self.pool:
            raise RuntimeError("Database not connected")

        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE transmitter.batches
                SET status = 'failed', http_status = $2, error_message = $3,
                    retry_count = $4, completed_at = $5
                WHERE id = $1
                """,
                batch_id,
                http_status,
                error_message,
                retry_count,
                datetime.now(timezone.utc),
            )

    async def get_stats(self) -> dict[str, Any]:
        """Get transmission statistics."""
        if not self.pool:
            raise RuntimeError("Database not connected")

        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT
                    COUNT(*) FILTER (WHERE status = 'pending') as pending,
                    COUNT(*) FILTER (WHERE status = 'sending') as sending,
                    COUNT(*) FILTER (WHERE status = 'success') as success,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed
                FROM transmitter.batches
            """)

        return dict(row) if row else {}
