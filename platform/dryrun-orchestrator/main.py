"""
Dry-Run Orchestrator Service

Manages Docker containers for dry-run testing sessions.
Communicates with approval-api for session management.

Reference: ADR-004 Dry-Run Orchestration Model

Security: All Docker control endpoints require API key authentication.
This service should only be accessible from the internal Docker network.
"""

import re
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Optional

import docker
import httpx
import structlog
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from pydantic_settings import BaseSettings

# Valid session ID pattern (alphanumeric, hyphens, underscores)
SESSION_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


class Settings(BaseSettings):
    """
    Application settings from environment variables.

    Security: No default credentials are provided. All sensitive settings
    MUST be configured via environment variables.
    """

    # Database/messaging URLs - REQUIRED, no defaults for security
    postgres_url: str = Field(
        ...,  # Required field, no default
        description="PostgreSQL connection URL (required)",
    )
    rabbitmq_url: str = Field(
        ...,  # Required field, no default
        description="RabbitMQ connection URL (required)",
    )
    redis_url: str = Field(
        default="redis://redis:6379",  # Redis typically doesn't have auth in dev
        description="Redis connection URL",
    )

    # API key for authenticating requests from approval-api
    api_key: str = Field(
        default_factory=lambda: secrets.token_urlsafe(32),
        description="API key for internal service authentication. "
        "Auto-generated if not provided (should be set in production).",
    )

    # Non-sensitive settings with safe defaults
    log_level: str = "info"
    sample_repos_path: str = "/repos"
    # Host path for mounting repos in new containers (required when running in container)
    # When orchestrator runs in a container, it sees /repos but needs host path for mounts
    sample_repos_host_path: str = ""  # If empty, uses sample_repos_path
    docker_network: str = "discovery-network"

    # Collector URLs for triggering scans
    code_analyzer_url: str = "http://code-analyzer:8002"
    network_scanner_url: str = "http://network-scanner:8001"
    db_inspector_url: str = "http://db-inspector:8003"

    # Approval API URL for posting discoveries
    approval_api_url: str = "http://approval-api:3001"

    class Config:
        env_prefix = "DRYRUN_"


# Validate settings on startup
try:
    settings = Settings()
except Exception as e:
    # Provide helpful error message for missing required settings
    raise SystemExit(
        f"Configuration error: {e}\n"
        "Required environment variables:\n"
        "  DRYRUN_POSTGRES_URL - PostgreSQL connection URL\n"
        "  DRYRUN_RABBITMQ_URL - RabbitMQ connection URL\n"
        "  DRYRUN_API_KEY - API key for authentication (optional, auto-generated if not set)"
    ) from e

# Initialize FastAPI app
app = FastAPI(
    title="Dry-Run Orchestrator",
    description="Manages Docker containers for dry-run testing sessions",
    version="1.0.0",
)

# Docker client
docker_client: Optional[docker.DockerClient] = None


async def verify_api_key(x_api_key: Annotated[str | None, Header()] = None) -> str:
    """
    Verify the API key for protected endpoints.

    All Docker control endpoints require a valid API key to prevent
    unauthorized container manipulation.
    """
    if not x_api_key:
        logger.warning("API request without authentication")
        raise HTTPException(
            status_code=401,
            detail="Missing X-API-Key header",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    if not secrets.compare_digest(x_api_key, settings.api_key):
        logger.warning("API request with invalid key")
        raise HTTPException(
            status_code=403,
            detail="Invalid API key",
        )

    return x_api_key


# Type alias for dependency injection
ApiKeyDep = Annotated[str, Depends(verify_api_key)]


class StartSessionRequest(BaseModel):
    """Request to start a dry-run session."""

    session_id: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Session ID (alphanumeric, hyphens, underscores only)",
    )

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        """Validate session_id contains only safe characters for Docker names."""
        if not SESSION_ID_PATTERN.match(v):
            raise ValueError(
                "session_id must contain only alphanumeric characters, hyphens, and underscores"
            )
        return v


class StartSessionResponse(BaseModel):
    """Response after starting a dry-run session."""

    container_count: int
    network_name: str
    containers: list[dict]


class CleanupRequest(BaseModel):
    """Request to cleanup a dry-run session."""

    session_id: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Session ID (alphanumeric, hyphens, underscores only)",
    )

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        """Validate session_id contains only safe characters for Docker names."""
        if not SESSION_ID_PATTERN.match(v):
            raise ValueError(
                "session_id must contain only alphanumeric characters, hyphens, and underscores"
            )
        return v


class CleanupResponse(BaseModel):
    """Response after cleaning up a dry-run session."""

    cleaned_containers: int
    session_id: str


class ContainerStatus(BaseModel):
    """Status of a container."""

    container_id: str
    name: str
    status: str
    image: str
    ports: dict


# Track active sessions and their containers
active_sessions: dict[str, list[str]] = {}


async def trigger_code_analyzer(session_id: str) -> dict:
    """
    Trigger the code-analyzer to scan local repositories.

    This calls the code-analyzer's /api/v1/dryrun/scan endpoint to analyze
    all sample repositories mounted at /repos. Discoveries are posted back
    to the approval-api's internal endpoint.
    """
    url = f"{settings.code_analyzer_url}/api/v1/dryrun/scan"
    logger.info("Triggering code-analyzer", session_id=session_id, url=url)

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                url,
                json={
                    "session_id": session_id,
                    "callback_url": settings.approval_api_url,
                },
            )
            response.raise_for_status()
            result = response.json()
            logger.info(
                "Code analysis completed",
                session_id=session_id,
                repos_scanned=result.get("repos_scanned", 0),
            )
            return result
    except httpx.HTTPStatusError as e:
        logger.error(
            "Code analyzer returned error",
            session_id=session_id,
            status_code=e.response.status_code,
            detail=e.response.text,
        )
        raise
    except httpx.RequestError as e:
        logger.error(
            "Failed to reach code analyzer",
            session_id=session_id,
            error=str(e),
        )
        raise


@app.on_event("startup")
async def startup():
    """Initialize Docker client on startup."""
    global docker_client
    try:
        docker_client = docker.from_env()
        logger.info("Docker client initialized")

        # Log API key status (masked for security)
        api_key_preview = (
            settings.api_key[:8] + "..." if settings.api_key else "NOT SET"
        )
        logger.info(
            "Authentication configured",
            api_key_preview=api_key_preview,
            note="Protected endpoints require X-API-Key header",
        )
    except docker.errors.DockerException as e:
        logger.error("Failed to initialize Docker client", error=str(e))
        raise


@app.on_event("shutdown")
async def shutdown():
    """Cleanup on shutdown."""
    if docker_client:
        docker_client.close()
        logger.info("Docker client closed")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "dryrun-orchestrator",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/repos")
async def list_sample_repos():
    """List available sample repositories for dry-run testing."""
    repos_path = Path(settings.sample_repos_path)

    if not repos_path.exists():
        return {"repos": [], "error": "Sample repos path not found"}

    # Handle potential filesystem errors (permissions, etc.)
    try:
        repo_entries = list(repos_path.iterdir())
    except OSError as e:
        logger.error("Failed to list sample repos", error=str(e))
        raise HTTPException(
            status_code=500, detail="Cannot access sample repos directory"
        )

    repos = []
    for repo_dir in repo_entries:
        if repo_dir.is_dir() and not repo_dir.name.startswith("."):
            # Detect language/framework
            language = "unknown"
            framework = "unknown"

            if (repo_dir / "requirements.txt").exists():
                language = "python"
                if (repo_dir / "manage.py").exists():
                    framework = "django"
                elif (repo_dir / "app.py").exists():
                    framework = "flask"
            elif (repo_dir / "package.json").exists():
                language = "javascript"
                if (repo_dir / "vite.config.ts").exists():
                    framework = "react-vite"
                elif (repo_dir / "next.config.js").exists():
                    framework = "nextjs"
                else:
                    framework = "express"
            elif (repo_dir / "pom.xml").exists():
                language = "java"
                framework = "spring-boot"
            elif (repo_dir / "go.mod").exists():
                language = "go"
                framework = "gin"

            repos.append(
                {
                    "name": repo_dir.name,
                    "path": str(repo_dir),
                    "language": language,
                    "framework": framework,
                }
            )

    return {"repos": repos, "count": len(repos)}


@app.post("/api/dryrun/start", response_model=StartSessionResponse)
async def start_dryrun_session(request: StartSessionRequest, _api_key: ApiKeyDep):
    """
    Start a dry-run session by spinning up test containers.

    This creates the simulated environment for the collectors to scan.

    Requires: X-API-Key header for authentication.
    """
    session_id = request.session_id
    logger.info("Starting dry-run session", session_id=session_id)

    if not docker_client:
        raise HTTPException(status_code=503, detail="Docker client not available")

    if session_id in active_sessions:
        raise HTTPException(
            status_code=409, detail=f"Session {session_id} already active"
        )

    try:
        # Use the configured network (discovery-network) so collectors can reach containers
        network_name = settings.docker_network
        try:
            docker_client.networks.get(network_name)
        except docker.errors.NotFound:
            raise HTTPException(
                status_code=500,
                detail=f"Network {network_name} not found. Ensure discovery-network exists.",
            )

        # Get sample repos
        repos_path = Path(settings.sample_repos_path)
        repos = [
            d for d in repos_path.iterdir() if d.is_dir() and not d.name.startswith(".")
        ]

        # Determine host path for volume mounts
        # When running in a container, we need the actual host path, not container path
        host_repos_path = Path(
            settings.sample_repos_host_path or settings.sample_repos_path
        )

        containers = []
        container_ids = []

        # Start containers for each sample repo type
        # The collectors will scan these when triggered
        for repo in repos:
            container_name = f"dryrun-{session_id[:8]}-{repo.name}"

            # Choose appropriate image based on repo type
            if (repo / "requirements.txt").exists():
                image = "python:3.11-slim"
            elif (repo / "package.json").exists():
                image = "node:20-slim"
            elif (repo / "pom.xml").exists():
                image = "eclipse-temurin:17-jdk-alpine"
            elif (repo / "go.mod").exists():
                image = "golang:1.21-alpine"
            else:
                image = "alpine:latest"

            try:
                # Compute host path for volume mount
                host_repo_path = host_repos_path / repo.name
                container = docker_client.containers.run(
                    image,
                    name=container_name,
                    command="tail -f /dev/null",  # Keep container running
                    detach=True,
                    network=network_name,
                    volumes={
                        str(host_repo_path): {
                            "bind": f"/app/{repo.name}",
                            "mode": "ro",
                        }
                    },
                    labels={
                        "dryrun.session_id": session_id,
                        "dryrun.repo_name": repo.name,
                        "discovery.type": "code-repo",
                    },
                )
                container_ids.append(container.id)
                containers.append(
                    {
                        "container_id": container.id[:12],
                        "name": container_name,
                        "image": image,
                        "repo": repo.name,
                        "status": "running",
                    }
                )
                logger.info(
                    "Container started",
                    container_id=container.id[:12],
                    name=container_name,
                )
            except docker.errors.APIError as e:
                logger.error("Failed to start container", error=str(e), repo=repo.name)

        # Track session containers
        active_sessions[session_id] = container_ids

        # Trigger collectors to scan the test environment
        # This is done asynchronously - the response returns immediately
        # and collectors will publish discoveries via RabbitMQ
        try:
            analysis_result = await trigger_code_analyzer(session_id)
            logger.info(
                "Collectors triggered successfully",
                session_id=session_id,
                repos_scanned=analysis_result.get("repos_scanned", 0),
            )
        except Exception as e:
            # Log but don't fail the session - containers are running
            logger.warning(
                "Failed to trigger code analyzer, session continues",
                session_id=session_id,
                error=str(e),
            )

        return StartSessionResponse(
            container_count=len(containers),
            network_name=network_name,
            containers=containers,
        )

    except Exception as e:
        logger.error("Failed to start dry-run session", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/dryrun/cleanup", response_model=CleanupResponse)
async def cleanup_dryrun_session(request: CleanupRequest, _api_key: ApiKeyDep):
    """
    Cleanup a dry-run session by stopping and removing containers.

    Requires: X-API-Key header for authentication.
    """
    session_id = request.session_id
    logger.info("Cleaning up dry-run session", session_id=session_id)

    if not docker_client:
        raise HTTPException(status_code=503, detail="Docker client not available")

    cleaned_count = 0
    errors_encountered: list[str] = []

    try:
        # Find containers by label (primary method, works across restarts)
        labeled_containers = docker_client.containers.list(
            all=True, filters={"label": f"dryrun.session_id={session_id}"}
        )

        # Stop and remove each container
        for container in labeled_containers:
            try:
                container.stop(timeout=10)
                container.remove()
                cleaned_count += 1
                logger.info("Container removed", container_id=container.id[:12])
            except docker.errors.NotFound:
                pass  # Already removed
            except docker.errors.APIError as e:
                error_msg = f"Failed to remove container {container.id[:12]}: {e}"
                logger.error(error_msg)
                errors_encountered.append(error_msg)

        # Note: We don't remove the network since we use the shared discovery-network

        # Clear from tracking
        active_sessions.pop(session_id, None)

        # Report partial failures
        if errors_encountered:
            raise HTTPException(
                status_code=500,
                detail=f"Cleanup partially failed: {'; '.join(errors_encountered)}",
            )

        return CleanupResponse(cleaned_containers=cleaned_count, session_id=session_id)

    except docker.errors.DockerException as e:
        logger.error("Docker error during cleanup", error=str(e), session_id=session_id)
        raise HTTPException(status_code=500, detail=f"Docker error during cleanup: {e}")
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        logger.error("Failed to cleanup dry-run session", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/dryrun/{session_id}/containers")
async def get_session_containers(session_id: str, _api_key: ApiKeyDep):
    """
    Get status of all containers for a session.

    Requires: X-API-Key header for authentication.
    """
    if not docker_client:
        raise HTTPException(status_code=503, detail="Docker client not available")

    containers = docker_client.containers.list(
        all=True, filters={"label": f"dryrun.session_id={session_id}"}
    )

    result = []
    for container in containers:
        result.append(
            ContainerStatus(
                container_id=container.id[:12],
                name=container.name,
                status=container.status,
                image=container.image.tags[0] if container.image.tags else "unknown",
                ports=container.ports,
            )
        )

    return {"session_id": session_id, "containers": result, "count": len(result)}


@app.get("/api/status")
async def get_orchestrator_status():
    """Get overall orchestrator status."""
    if not docker_client:
        return {"status": "degraded", "docker": "unavailable"}

    # Count active sessions
    active_count = len(active_sessions)

    # Count all dryrun containers
    all_dryrun_containers = docker_client.containers.list(
        all=True, filters={"label": "dryrun.session_id"}
    )

    return {
        "status": "healthy",
        "docker": "connected",
        "active_sessions": active_count,
        "total_dryrun_containers": len(all_dryrun_containers),
        "sample_repos_path": settings.sample_repos_path,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8030)
