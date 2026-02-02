"""Main FastAPI application for Transmitter service."""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from pydantic import BaseModel

from .config import get_settings
from .consumer import EventConsumer
from .batch import BatchProcessor
from .client import APIClient
from .database import Database

settings = get_settings()

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global instances
database: Database | None = None
consumer: EventConsumer | None = None
batch_processor: BatchProcessor | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    global database, consumer, batch_processor

    logger.info("Starting Transmitter service")

    # Initialize database
    database = Database(settings.database_url)
    await database.connect()
    await database.migrate()
    logger.info("Database connected")

    # Initialize API client
    api_client = APIClient(
        destination_url=settings.destination_url,
        auth_token=settings.auth_token,
        retry_max_attempts=settings.retry_max_attempts,
        retry_backoff_multiplier=settings.retry_backoff_multiplier,
        retry_max_delay_s=settings.retry_max_delay_s,
        circuit_failure_threshold=settings.circuit_failure_threshold,
        circuit_reset_timeout_s=settings.circuit_reset_timeout_s,
    )

    # Initialize batch processor
    batch_processor = BatchProcessor(
        batch_size=settings.batch_size,
        batch_interval_s=settings.batch_interval_s,
        api_client=api_client,
        database=database,
    )

    # Initialize and start consumer
    consumer = EventConsumer(
        rabbitmq_url=settings.rabbitmq_url,
        exchange=settings.rabbitmq_exchange,
        queue=settings.rabbitmq_queue,
        batch_processor=batch_processor,
    )
    await consumer.start()
    logger.info("RabbitMQ consumer started")

    # Start batch processor background task
    batch_task = asyncio.create_task(batch_processor.run())

    yield

    # Cleanup
    if consumer:
        await consumer.stop()
    if batch_processor:
        batch_processor.stop()
    batch_task.cancel()
    try:
        await batch_task
    except asyncio.CancelledError:
        pass
    if database:
        await database.disconnect()
    if api_client:
        await api_client.close()

    logger.info("Transmitter service stopped")


app = FastAPI(
    title="Transmitter",
    description="Secure data transmission service for approved discoveries",
    version="0.1.0",
    lifespan=lifespan,
)


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    service: str


class ReadyResponse(BaseModel):
    """Readiness check response."""

    status: str
    service: str
    database: str
    rabbitmq: str
    circuit_breaker: str


class StatsResponse(BaseModel):
    """Transmission statistics response."""

    pending_items: int
    batches_sent: int
    batches_failed: int


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(status="healthy", service="transmitter")


@app.get("/ready", response_model=ReadyResponse)
async def readiness_check() -> ReadyResponse:
    """Readiness check endpoint."""
    db_status = "connected" if database and await database.is_healthy() else "disconnected"
    mq_status = "connected" if consumer and consumer.is_connected else "disconnected"
    cb_status = "closed" if batch_processor and not batch_processor.is_circuit_open() else "open"

    return ReadyResponse(
        status="ready" if db_status == "connected" and mq_status == "connected" else "degraded",
        service="transmitter",
        database=db_status,
        rabbitmq=mq_status,
        circuit_breaker=cb_status,
    )


@app.get("/api/v1/stats", response_model=StatsResponse)
async def get_stats() -> StatsResponse:
    """Get transmission statistics."""
    if not batch_processor:
        return StatsResponse(pending_items=0, batches_sent=0, batches_failed=0)

    return StatsResponse(
        pending_items=batch_processor.pending_count,
        batches_sent=batch_processor.batches_sent,
        batches_failed=batch_processor.batches_failed,
    )


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

    return generate_latest().decode("utf-8"), {"Content-Type": CONTENT_TYPE_LATEST}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.server_host,
        port=settings.server_port,
        reload=False,
    )
