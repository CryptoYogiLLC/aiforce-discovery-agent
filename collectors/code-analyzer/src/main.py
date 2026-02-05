"""Code Analyzer FastAPI application."""

import logging

from fastapi import FastAPI

from .config import settings
from .rabbitmq import lifespan
from .handlers import health, analyze, dryrun, discover

# Configure logging
logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Code Analyzer",
    description="Repository analysis service for AIForce Discovery Agent",
    version="1.0.0",
    lifespan=lifespan,
)

# Register routers
app.include_router(health.router)
app.include_router(analyze.router)
app.include_router(dryrun.router)
app.include_router(discover.router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.server_host,
        port=settings.server_port,
        reload=True,
    )
