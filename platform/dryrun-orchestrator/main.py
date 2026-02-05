"""
Dry-Run Orchestrator Service

Manages Docker containers for dry-run testing sessions.
Communicates with approval-api for session management.

Reference: ADR-004 Dry-Run Orchestration Model

Security: All Docker control endpoints require API key authentication.
This service should only be accessible from the internal Docker network.
"""

import httpx
from fastapi import FastAPI

from config import logger, settings
from docker_ops import shutdown as docker_shutdown
from docker_ops import startup as docker_startup
from handlers.repos import router as repos_router
from handlers.sessions import router as sessions_router
from handlers.status import router as status_router

# Initialize FastAPI app
app = FastAPI(
    title="Dry-Run Orchestrator",
    description="Manages Docker containers for dry-run testing sessions",
    version="1.0.0",
)

# Track active sessions and their containers
active_sessions: dict[str, list[str]] = {}

# Register routers
app.include_router(repos_router)
app.include_router(sessions_router)
app.include_router(status_router)


# Register lifecycle events
app.on_event("startup")(docker_startup)
app.on_event("shutdown")(docker_shutdown)


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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8030)
