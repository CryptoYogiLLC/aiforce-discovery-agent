"""
Dry-Run Orchestrator Service

Manages Docker containers for dry-run testing sessions.
Communicates with approval-api for session management.

Reference: ADR-004 Dry-Run Orchestration Model

Security: All Docker control endpoints require API key authentication.
This service should only be accessible from the internal Docker network.
"""

import secrets
from datetime import datetime
from pathlib import Path
from typing import Annotated, Optional

import docker
import structlog
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings

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
    docker_network: str = "discovery-network"

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

    session_id: str


class StartSessionResponse(BaseModel):
    """Response after starting a dry-run session."""

    container_count: int
    network_name: str
    containers: list[dict]


class CleanupRequest(BaseModel):
    """Request to cleanup a dry-run session."""

    session_id: str


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
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/api/repos")
async def list_sample_repos():
    """List available sample repositories for dry-run testing."""
    repos_path = Path(settings.sample_repos_path)

    if not repos_path.exists():
        return {"repos": [], "error": "Sample repos path not found"}

    repos = []
    for repo_dir in repos_path.iterdir():
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
        # Get or create the network
        network_name = f"dryrun-{session_id[:8]}"
        try:
            docker_client.networks.get(network_name)
        except docker.errors.NotFound:
            docker_client.networks.create(
                network_name,
                driver="bridge",
                labels={"dryrun.session_id": session_id},
            )

        # Get sample repos
        repos_path = Path(settings.sample_repos_path)
        repos = [
            d for d in repos_path.iterdir() if d.is_dir() and not d.name.startswith(".")
        ]

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
                container = docker_client.containers.run(
                    image,
                    name=container_name,
                    command="tail -f /dev/null",  # Keep container running
                    detach=True,
                    network=network_name,
                    volumes={
                        str(repo.absolute()): {
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

    try:
        # Get containers for this session
        container_ids = active_sessions.get(session_id, [])

        # Also find containers by label (in case of restarts)
        labeled_containers = docker_client.containers.list(
            all=True, filters={"label": f"dryrun.session_id={session_id}"}
        )

        all_containers = set(container_ids)
        for container in labeled_containers:
            all_containers.add(container.id)

        # Stop and remove each container
        for container_id in all_containers:
            try:
                container = docker_client.containers.get(container_id)
                container.stop(timeout=10)
                container.remove()
                cleaned_count += 1
                logger.info("Container removed", container_id=container_id[:12])
            except docker.errors.NotFound:
                pass  # Already removed
            except docker.errors.APIError as e:
                logger.error(
                    "Failed to remove container",
                    container_id=container_id[:12],
                    error=str(e),
                )

        # Remove the network
        network_name = f"dryrun-{session_id[:8]}"
        try:
            network = docker_client.networks.get(network_name)
            network.remove()
            logger.info("Network removed", network_name=network_name)
        except docker.errors.NotFound:
            pass
        except docker.errors.APIError as e:
            logger.warning(
                "Failed to remove network", network_name=network_name, error=str(e)
            )

        # Clear from tracking
        active_sessions.pop(session_id, None)

        return CleanupResponse(cleaned_containers=cleaned_count, session_id=session_id)

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
