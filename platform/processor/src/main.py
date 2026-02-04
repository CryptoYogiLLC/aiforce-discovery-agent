"""Main entry point for the Unified Processor service.

This service consumes discovered events, processes them through
enrichment, PII redaction, and scoring modules, then publishes
scored events for the approval gateway.
"""

import asyncio
from contextlib import asynccontextmanager
from typing import Any

import structlog
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .config import settings
from .consumer import EventConsumer
from .modules import (
    CandidateIdentificationModule,
    EnrichmentModule,
    PIIRedactorModule,
    ScoringModule,
)
from .publisher import EventPublisher

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Initialize processing modules
# ADR-007: Candidate identification runs first to flag database candidates
candidate_identification_module = CandidateIdentificationModule()
enrichment_module = EnrichmentModule()
pii_redactor_module = PIIRedactorModule(
    redact_emails=settings.pii_redact_emails,
    redact_ips=settings.pii_redact_ips,
    redact_hostnames=settings.pii_redact_hostnames,
    redact_usernames=settings.pii_redact_usernames,
)
scoring_module = ScoringModule()

# Initialize consumer and publisher
consumer = EventConsumer()
publisher = EventPublisher()


async def process_event(data: dict[str, Any]) -> None:
    """Process a discovered event through the pipeline.

    Pipeline stages (ADR-007):
    1. Candidate Identification - Flag database candidates and validate confidence
    2. Enrichment - Add context and metadata
    3. PII Redaction - Remove sensitive information
    4. Scoring - Calculate complexity and effort scores

    Args:
        data: The discovered event data
    """
    event_metadata = data.get("_event_metadata", {})
    event_type = event_metadata.get("type", "unknown")

    logger.info(
        "processing_started",
        event_id=event_metadata.get("id"),
        event_type=event_type,
        scan_id=event_metadata.get("subject"),  # ADR-007: Log scan_id
    )

    try:
        # Stage 1: Candidate Identification (ADR-007)
        if settings.candidate_identification_enabled:
            data = await candidate_identification_module.process(data)

        # Stage 2: Enrichment
        if settings.enrichment_enabled:
            data = await enrichment_module.process(data)

        # Stage 3: PII Redaction
        if settings.pii_redaction_enabled:
            data = await pii_redactor_module.process(data)

        # Stage 4: Scoring
        if settings.scoring_enabled:
            data = await scoring_module.process(data)

        # Determine entity type from original event type
        # e.g., "discovery.server.discovered" -> "server"
        entity_type = _extract_entity_type(event_type)

        # Publish scored event
        await publisher.publish_scored(data, entity_type)

        logger.info(
            "processing_complete",
            event_id=event_metadata.get("id"),
            entity_type=entity_type,
        )

    except Exception as e:
        logger.error(
            "processing_failed",
            event_id=event_metadata.get("id"),
            error=str(e),
            error_type=type(e).__name__,
        )
        raise


def _extract_entity_type(event_type: str) -> str:
    """Extract entity type from CloudEvent type.

    Args:
        event_type: CloudEvent type like "discovery.server.discovered"

    Returns:
        Entity type like "server"
    """
    parts = event_type.split(".")
    if len(parts) >= 2:
        return parts[1]
    return "unknown"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan events."""
    # Startup
    logger.info(
        "starting_processor",
        service=settings.service_name,
        version=settings.service_version,
    )

    # Connect to RabbitMQ
    await consumer.connect()
    await consumer.setup_queues()
    await publisher.connect()

    # Set up message handler
    consumer.set_handler(process_event)

    # Start consuming in background
    asyncio.create_task(consumer.start())
    asyncio.create_task(consumer.wait_for_messages())

    logger.info("processor_ready")

    yield

    # Shutdown
    logger.info("stopping_processor")
    await consumer.stop()
    await publisher.close()
    logger.info("processor_stopped")


app = FastAPI(
    title="AIForce Discovery Processor",
    description="Unified processing service for discovery events",
    version=settings.service_version,
    lifespan=lifespan,
)


@app.get("/health")
async def health_check() -> JSONResponse:
    """Health check endpoint.

    Returns service health status for Docker/Kubernetes probes.
    """
    return JSONResponse(
        content={
            "status": "healthy",
            "service": settings.service_name,
            "version": settings.service_version,
        }
    )


@app.get("/ready")
async def readiness_check() -> JSONResponse:
    """Readiness check endpoint.

    Returns whether the service is ready to accept traffic.
    """
    # Check RabbitMQ connection
    rabbitmq_ready = (
        consumer._connection is not None and not consumer._connection.is_closed
    )

    if not rabbitmq_ready:
        return JSONResponse(
            status_code=503,
            content={
                "status": "not_ready",
                "reason": "RabbitMQ not connected",
            },
        )

    return JSONResponse(
        content={
            "status": "ready",
            "service": settings.service_name,
        }
    )


@app.get("/config")
async def get_config() -> JSONResponse:
    """Return current configuration (non-sensitive values only)."""
    return JSONResponse(
        content={
            "service_name": settings.service_name,
            "service_version": settings.service_version,
            "candidate_identification_enabled": settings.candidate_identification_enabled,
            "enrichment_enabled": settings.enrichment_enabled,
            "pii_redaction_enabled": settings.pii_redaction_enabled,
            "scoring_enabled": settings.scoring_enabled,
            "pii_settings": {
                "redact_emails": settings.pii_redact_emails,
                "redact_ips": settings.pii_redact_ips,
                "redact_hostnames": settings.pii_redact_hostnames,
                "redact_usernames": settings.pii_redact_usernames,
            },
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
    )
