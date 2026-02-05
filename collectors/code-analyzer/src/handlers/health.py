"""Health, readiness, metrics, and stats endpoints."""

from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from ..config import settings
from ..rabbitmq import get_rabbitmq_connection

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy"}


@router.get("/ready")
async def ready() -> dict[str, str | bool]:
    """Readiness check - verifies RabbitMQ connection."""
    rabbitmq_ok = False
    try:
        connection = await get_rabbitmq_connection()
        rabbitmq_ok = not connection.is_closed
    except Exception:
        pass

    if not rabbitmq_ok:
        raise HTTPException(status_code=503, detail="RabbitMQ not ready")

    return {"status": "ready", "rabbitmq": rabbitmq_ok}


@router.get("/metrics")
async def metrics() -> PlainTextResponse:
    """Prometheus metrics endpoint."""
    return PlainTextResponse(
        content=generate_latest().decode("utf-8"),
        media_type=CONTENT_TYPE_LATEST,
    )


@router.get("/api/v1/stats")
async def get_stats() -> dict[str, Any]:
    """Get service statistics."""
    return {
        "service": "code-analyzer",
        "version": "1.0.0",
        "config": {
            "max_repo_size_mb": settings.max_repo_size_mb,
            "clone_depth": settings.clone_depth,
            "excluded_dirs": settings.excluded_dirs_list,
        },
    }
