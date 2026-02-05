"""
Docker client lifecycle management for the Dry-Run Orchestrator.

Handles Docker client initialization on startup and cleanup on shutdown.
"""

from typing import Optional

import docker

from config import logger, settings


# Docker client - shared across the application
docker_client: Optional[docker.DockerClient] = None


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


async def shutdown():
    """Cleanup on shutdown."""
    if docker_client:
        docker_client.close()
        logger.info("Docker client closed")
