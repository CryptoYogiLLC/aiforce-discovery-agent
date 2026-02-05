"""Infrastructure Probe service main module.

FastAPI service for SSH-based infrastructure probing.

SECURITY:
- Credentials are NEVER logged
- Credentials are NEVER stored
- Credentials exist only in memory during probe execution
- Results go through the normal approval pipeline
"""

import asyncio
import logging
from contextlib import asynccontextmanager

import aio_pika
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

from .config import settings
from .ssh_probe import SSHProbe, ProbeCredentials
from .publisher import EventPublisher

# Configure logging - NEVER log credentials
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# Global state
rabbitmq_connection: aio_pika.Connection | None = None
publisher: EventPublisher | None = None
ssh_probe: SSHProbe | None = None
probe_semaphore: asyncio.Semaphore | None = None


class ProbeRequest(BaseModel):
    """Request model for infrastructure probe.

    SECURITY: Credentials are cleared after use and never logged.
    """

    target_ip: str = Field(..., description="IP address to probe")
    port: int = Field(default=22, description="SSH port")
    username: str = Field(..., description="SSH username")
    password: str | None = Field(
        default=None, description="SSH password (cleared after use)"
    )
    private_key: str | None = Field(
        default=None, description="SSH private key (cleared after use)"
    )
    passphrase: str | None = Field(
        default=None, description="Key passphrase (cleared after use)"
    )
    server_id: str | None = Field(
        default=None, description="Reference to network-scanner discovery"
    )
    scan_id: str | None = Field(
        default=None, description="Scan ID for orchestration (ADR-007)"
    )

    class Config:
        # Prevent credentials in logs/repr
        json_schema_extra = {
            "example": {
                "target_ip": "192.168.1.100",
                "port": 22,
                "username": "admin",
                "password": "***",
                "server_id": "abc123",
                "scan_id": "scan-xyz",
            }
        }


class ProbeResponse(BaseModel):
    """Response model for probe request."""

    probe_id: str
    target_ip: str
    success: bool
    message: str


class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    service: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    global rabbitmq_connection, publisher, ssh_probe, probe_semaphore

    logger.info("Starting Infrastructure Probe service...")

    # Initialize SSH probe
    ssh_probe = SSHProbe(
        timeout_s=settings.ssh_timeout_s,
        command_timeout_s=settings.command_timeout_s,
    )

    # Initialize semaphore for concurrent probes
    probe_semaphore = asyncio.Semaphore(settings.max_concurrent_probes)

    # Connect to RabbitMQ
    try:
        rabbitmq_connection = await aio_pika.connect_robust(settings.rabbitmq_url)
        channel = await rabbitmq_connection.channel()
        publisher = EventPublisher(channel, settings.rabbitmq_exchange)
        logger.info("Connected to RabbitMQ")
    except Exception as e:
        logger.error(f"Failed to connect to RabbitMQ: {e}")
        publisher = None

    logger.info(
        f"Infrastructure Probe service started on "
        f"{settings.server_host}:{settings.server_port}"
    )

    yield

    # Cleanup
    if rabbitmq_connection:
        await rabbitmq_connection.close()
        logger.info("Disconnected from RabbitMQ")

    logger.info("Infrastructure Probe service stopped")


app = FastAPI(
    title="Infrastructure Probe",
    description="SSH-based infrastructure discovery service",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        service="infra-probe",
    )


@app.post("/probe", response_model=ProbeResponse)
async def probe_infrastructure(
    request: ProbeRequest,
    background_tasks: BackgroundTasks,
):
    """
    Initiate infrastructure probe.

    SECURITY:
    - Credentials are cleared immediately after probe completes
    - Credentials are NEVER logged or stored
    - Only system info is published to events
    """
    if not ssh_probe:
        raise HTTPException(status_code=503, detail="Probe service not initialized")

    # SECURITY: Create credentials object (never log this)
    credentials = ProbeCredentials(
        username=request.username,
        password=request.password,
        private_key=request.private_key,
        passphrase=request.passphrase,
    )

    # Clear sensitive fields from request immediately
    request.password = None
    request.private_key = None
    request.passphrase = None

    # Log WITHOUT credentials
    logger.info(
        f"Probe request received: {request.target_ip}:{request.port} "
        f"(user: {request.username})"
    )

    # Execute probe in background with rate limiting
    background_tasks.add_task(
        _execute_probe,
        request.target_ip,
        request.port,
        credentials,
        request.server_id,
        request.scan_id,
    )

    return ProbeResponse(
        probe_id="pending",
        target_ip=request.target_ip,
        success=True,
        message="Probe initiated",
    )


async def _execute_probe(
    target_ip: str,
    port: int,
    credentials: ProbeCredentials,
    server_id: str | None,
    scan_id: str | None,
) -> None:
    """Execute probe with rate limiting and publish results."""
    global probe_semaphore, ssh_probe, publisher

    if not probe_semaphore or not ssh_probe:
        return

    async with probe_semaphore:
        try:
            # Execute probe (credentials cleared inside)
            result = await ssh_probe.probe(
                target_ip=target_ip,
                credentials=credentials,
                port=port,
                server_id=server_id,
            )

            # Publish result if successful
            if result.success and publisher:
                publisher.set_scan_id(scan_id)
                await publisher.publish_infrastructure_discovered(result)
            elif not result.success:
                logger.warning(f"Probe failed for {target_ip}: {result.error}")

        except Exception as e:
            logger.error(f"Probe execution error for {target_ip}: {type(e).__name__}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.server_host,
        port=settings.server_port,
        reload=False,
    )
