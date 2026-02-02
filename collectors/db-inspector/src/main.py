"""Main FastAPI application for Database Inspector."""

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

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
        logger.warning(f"Failed to connect to RabbitMQ: {e}. Running without publishing.")
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


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(status="healthy", service="db-inspector")


@app.get("/ready", response_model=ReadyResponse)
async def readiness_check() -> ReadyResponse:
    """Readiness check endpoint."""
    rabbitmq_status = "connected" if publisher and publisher.is_connected else "disconnected"
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
    logger.info(f"Inspecting {request.db_type} database at {request.host}:{request.port}")

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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.server_host,
        port=settings.server_port,
        reload=False,
    )
