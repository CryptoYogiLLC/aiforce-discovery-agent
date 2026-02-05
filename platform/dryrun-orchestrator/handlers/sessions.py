"""
Dry-run session management handlers.

Handles starting and cleaning up dry-run sessions with Docker containers.
"""

from pathlib import Path

import docker
from fastapi import APIRouter, HTTPException

from auth import ApiKeyDep
from config import logger, settings
from docker_ops import docker_client
from models import (
    CleanupRequest,
    CleanupResponse,
    StartSessionRequest,
    StartSessionResponse,
)

router = APIRouter()


@router.post("/api/dryrun/start", response_model=StartSessionResponse)
async def start_dryrun_session(request: StartSessionRequest, _api_key: ApiKeyDep):
    """
    Start a dry-run session by spinning up test containers.

    This creates the simulated environment for the collectors to scan.

    Requires: X-API-Key header for authentication.
    """
    # Import here to avoid circular imports
    from main import active_sessions, trigger_code_analyzer

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


@router.post("/api/dryrun/cleanup", response_model=CleanupResponse)
async def cleanup_dryrun_session(request: CleanupRequest, _api_key: ApiKeyDep):
    """
    Cleanup a dry-run session by stopping and removing containers.

    Requires: X-API-Key header for authentication.
    """
    # Import here to avoid circular imports
    from main import active_sessions

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
