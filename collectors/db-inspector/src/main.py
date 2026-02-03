"""Main FastAPI application for Database Inspector."""

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, SecretStr

from .config import get_settings
from .connectors.postgres import PostgresConnector
from .connectors.mysql import MySQLConnector
from .publisher import EventPublisher

settings = get_settings()

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global publisher instance
publisher: EventPublisher | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    global publisher

    logger.info("Starting Database Inspector service")

    # Initialize RabbitMQ publisher
    try:
        publisher = EventPublisher(settings.rabbitmq_url, settings.rabbitmq_exchange)
        await publisher.connect()
        logger.info("Connected to RabbitMQ")
    except Exception as e:
        logger.warning(
            f"Failed to connect to RabbitMQ: {e}. Running without publishing."
        )
        publisher = None

    yield

    # Cleanup
    if publisher:
        await publisher.close()
    logger.info("Database Inspector service stopped")


app = FastAPI(
    title="Database Inspector",
    description="Database schema extraction and PII detection service",
    version="0.1.0",
    lifespan=lifespan,
)


# Request/Response models
class DatabaseConnectionRequest(BaseModel):
    """Request model for database connection."""

    db_type: str  # "postgres" or "mysql"
    host: str
    port: int
    user: str
    password: str
    database: str


class InspectionResponse(BaseModel):
    """Response model for database inspection."""

    database: str
    db_type: str
    tables: list[dict[str, Any]]
    relationships: list[dict[str, Any]]
    pii_findings: list[dict[str, Any]]


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    service: str


class ReadyResponse(BaseModel):
    """Readiness check response."""

    status: str
    service: str
    rabbitmq: str


# ADR-007: Batch inspection models with SecretStr for credential security
class BatchTargetCredentials(BaseModel):
    """Credentials for a batch inspection target."""

    username: str
    password: SecretStr  # SecretStr prevents credential logging


class BatchInspectionTarget(BaseModel):
    """A single target for batch inspection."""

    host: str
    port: int
    db_type: str  # postgres, mysql, etc.
    database: str | None = None
    credentials: BatchTargetCredentials


class BatchInspectionRequest(BaseModel):
    """Request model for batch database inspection (ADR-007)."""

    scan_id: str
    targets: list[BatchInspectionTarget]
    progress_url: str
    complete_url: str


class BatchInspectionResponse(BaseModel):
    """Response model for batch inspection."""

    status: str
    message: str
    scan_id: str
    inspected_count: int
    failed_count: int


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(status="healthy", service="db-inspector")


@app.get("/ready", response_model=ReadyResponse)
async def readiness_check() -> ReadyResponse:
    """Readiness check endpoint."""
    rabbitmq_status = (
        "connected" if publisher and publisher.is_connected else "disconnected"
    )
    return ReadyResponse(
        status="ready",
        service="db-inspector",
        rabbitmq=rabbitmq_status,
    )


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

    return generate_latest().decode("utf-8"), {"Content-Type": CONTENT_TYPE_LATEST}


@app.post("/api/v1/inspect", response_model=InspectionResponse)
async def inspect_database(request: DatabaseConnectionRequest) -> InspectionResponse:
    """Inspect a database and extract schema information."""
    logger.info(
        f"Inspecting {request.db_type} database at {request.host}:{request.port}"
    )

    try:
        if request.db_type.lower() == "postgres":
            connector = PostgresConnector(
                host=request.host,
                port=request.port,
                user=request.user,
                password=request.password,
                database=request.database,
            )
        elif request.db_type.lower() == "mysql":
            connector = MySQLConnector(
                host=request.host,
                port=request.port,
                user=request.user,
                password=request.password,
                database=request.database,
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported database type: {request.db_type}",
            )

        # Connect and extract schema
        await connector.connect()
        try:
            tables = await connector.get_tables()
            relationships = await connector.get_relationships()
            pii_findings = await connector.detect_pii(
                sample_size=settings.pii_sample_size,
                enabled=settings.pii_detection_enabled,
            )

            # Publish events if connected to RabbitMQ
            if publisher and publisher.is_connected:
                await publisher.publish_database_discovered(
                    host=request.host,
                    port=request.port,
                    db_type=request.db_type,
                    database=request.database,
                )
                for table in tables:
                    await publisher.publish_schema_discovered(
                        database=request.database,
                        table=table,
                    )
                for relationship in relationships:
                    await publisher.publish_relationship_discovered(
                        database=request.database,
                        relationship=relationship,
                    )

            return InspectionResponse(
                database=request.database,
                db_type=request.db_type,
                tables=tables,
                relationships=relationships,
                pii_findings=pii_findings,
            )
        finally:
            await connector.close()

    except HTTPException:
        # Re-raise HTTP exceptions as-is (preserve status code)
        raise
    except Exception as e:
        logger.error(f"Database inspection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/inspect/postgres")
async def inspect_postgres_default() -> InspectionResponse:
    """Inspect PostgreSQL using default configuration."""
    request = DatabaseConnectionRequest(
        db_type="postgres",
        host=settings.postgres_host,
        port=settings.postgres_port,
        user=settings.postgres_user,
        password=settings.postgres_password,
        database=settings.postgres_database,
    )
    return await inspect_database(request)


@app.post("/api/v1/inspect/mysql")
async def inspect_mysql_default() -> InspectionResponse:
    """Inspect MySQL using default configuration."""
    request = DatabaseConnectionRequest(
        db_type="mysql",
        host=settings.mysql_host,
        port=settings.mysql_port,
        user=settings.mysql_user,
        password=settings.mysql_password,
        database=settings.mysql_database,
    )
    return await inspect_database(request)


@app.post("/api/v1/inspect/batch", response_model=BatchInspectionResponse)
async def batch_inspect_databases(
    request: BatchInspectionRequest,
    x_internal_api_key: str | None = Header(None, alias="X-Internal-API-Key"),
) -> BatchInspectionResponse:
    """
    Batch database inspection endpoint (ADR-007).

    Inspects multiple database targets for deep inspection phase.
    Reports progress via callbacks to approval-api.
    Credentials are handled securely with SecretStr.
    """
    from .connectors.callback import CallbackReporter

    logger.info(
        f"Starting batch inspection for scan {request.scan_id} "
        f"with {len(request.targets)} targets"
    )

    # Initialize callback reporter
    reporter = CallbackReporter(
        scan_id=request.scan_id,
        progress_url=request.progress_url,
        complete_url=request.complete_url,
        api_key=x_internal_api_key,
    )

    # Report initial progress
    await reporter.report_progress("initializing", 0, "Starting database inspection")

    # Set scan_id on publisher for CloudEvent subject
    if publisher:
        publisher.set_scan_id(request.scan_id)

    inspected_count = 0
    failed_count = 0
    total_targets = len(request.targets)

    try:
        for i, target in enumerate(request.targets):
            progress = ((i + 1) * 100) // total_targets

            # Report progress for each target
            await reporter.report_progress(
                "inspecting",
                progress,
                f"Inspecting {target.db_type} at {target.host}:{target.port}",
            )

            try:
                # Select connector based on db_type
                if target.db_type.lower() == "postgres":
                    connector = PostgresConnector(
                        host=target.host,
                        port=target.port,
                        user=target.credentials.username,
                        password=target.credentials.password.get_secret_value(),
                        database=target.database or "postgres",
                    )
                elif target.db_type.lower() == "mysql":
                    connector = MySQLConnector(
                        host=target.host,
                        port=target.port,
                        user=target.credentials.username,
                        password=target.credentials.password.get_secret_value(),
                        database=target.database or "mysql",
                    )
                else:
                    logger.warning(f"Unsupported database type: {target.db_type}")
                    failed_count += 1
                    continue

                # Connect and inspect
                await connector.connect()
                try:
                    tables = await connector.get_tables()
                    relationships = await connector.get_relationships()
                    # PII detection runs but findings aren't published in batch mode
                    await connector.detect_pii(
                        sample_size=settings.pii_sample_size,
                        enabled=settings.pii_detection_enabled,
                    )

                    # Publish events
                    if publisher and publisher.is_connected:
                        await publisher.publish_database_discovered(
                            host=target.host,
                            port=target.port,
                            db_type=target.db_type,
                            database=target.database or "unknown",
                        )
                        reporter.increment_discovery_count()

                        for table in tables:
                            await publisher.publish_schema_discovered(
                                database=target.database or "unknown",
                                table=table,
                            )
                            reporter.increment_discovery_count()

                        for relationship in relationships:
                            await publisher.publish_relationship_discovered(
                                database=target.database or "unknown",
                                relationship=relationship,
                            )
                            reporter.increment_discovery_count()

                    inspected_count += 1
                    logger.info(
                        f"Inspected {target.db_type} at {target.host}:{target.port}: "
                        f"{len(tables)} tables, {len(relationships)} relationships"
                    )

                finally:
                    await connector.close()

            except Exception as e:
                # Log error but continue with other targets (don't log password)
                logger.error(
                    f"Failed to inspect {target.db_type} at {target.host}:{target.port}: {e}"
                )
                failed_count += 1

        # Clear scan_id from publisher
        if publisher:
            publisher.set_scan_id(None)

        # Report completion
        if failed_count == total_targets:
            await reporter.report_complete(
                "failed", f"All {total_targets} targets failed inspection"
            )
        else:
            await reporter.report_complete("completed", None)

        await reporter.close()

        logger.info(
            f"Batch inspection completed: {inspected_count} succeeded, "
            f"{failed_count} failed, {reporter.discovery_count} discoveries"
        )

        return BatchInspectionResponse(
            status="completed" if failed_count < total_targets else "partial",
            message=f"Inspected {inspected_count}/{total_targets} targets, "
            f"{reporter.discovery_count} discoveries",
            scan_id=request.scan_id,
            inspected_count=inspected_count,
            failed_count=failed_count,
        )

    except Exception as e:
        logger.error(f"Batch inspection failed: {e}")
        if publisher:
            publisher.set_scan_id(None)
        await reporter.report_complete("failed", str(e))
        await reporter.close()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.server_host,
        port=settings.server_port,
        reload=False,
    )
