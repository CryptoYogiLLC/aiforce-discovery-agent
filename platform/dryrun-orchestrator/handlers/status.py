"""
Health check and orchestrator status handlers.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from auth import ApiKeyDep
from config import settings
from docker_ops import docker_client
from models import ContainerStatus

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "dryrun-orchestrator",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/api/status")
async def get_orchestrator_status():
    """Get overall orchestrator status."""
    # Import here to avoid circular imports
    from main import active_sessions

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


@router.get("/api/dryrun/{session_id}/containers")
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
