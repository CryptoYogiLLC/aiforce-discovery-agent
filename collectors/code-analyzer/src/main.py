"""Code Analyzer FastAPI application."""

import logging
from contextlib import asynccontextmanager
from typing import Any

import aio_pika
from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel, HttpUrl

from .config import settings

# Configure logging
logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


class AnalyzeRequest(BaseModel):
    """Request model for repository analysis."""

    repo_url: HttpUrl
    branch: str = "main"
    credentials: str | None = None


class AnalyzeResponse(BaseModel):
    """Response model for repository analysis."""

    status: str
    message: str
    analysis_id: str | None = None


# Global state
app_state: dict[str, Any] = {
    "rabbitmq_connection": None,
    "rabbitmq_channel": None,
}


async def get_rabbitmq_connection() -> aio_pika.RobustConnection:
    """Get or create RabbitMQ connection."""
    if app_state["rabbitmq_connection"] is None or app_state["rabbitmq_connection"].is_closed:
        app_state["rabbitmq_connection"] = await aio_pika.connect_robust(
            settings.rabbitmq_url
        )
    return app_state["rabbitmq_connection"]


async def get_rabbitmq_channel() -> aio_pika.Channel:
    """Get or create RabbitMQ channel."""
    connection = await get_rabbitmq_connection()
    if app_state["rabbitmq_channel"] is None or app_state["rabbitmq_channel"].is_closed:
        app_state["rabbitmq_channel"] = await connection.channel()
    return app_state["rabbitmq_channel"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    logger.info("Starting Code Analyzer service...")

    try:
        connection = await get_rabbitmq_connection()
        channel = await connection.channel()
        await channel.declare_exchange(
            settings.rabbitmq_exchange,
            aio_pika.ExchangeType.TOPIC,
            durable=True,
        )
        logger.info("RabbitMQ connection established")
    except Exception as e:
        logger.warning(f"Failed to connect to RabbitMQ: {e}")

    yield

    # Cleanup
    if app_state["rabbitmq_channel"]:
        await app_state["rabbitmq_channel"].close()
    if app_state["rabbitmq_connection"]:
        await app_state["rabbitmq_connection"].close()
    logger.info("Code Analyzer service stopped")


app = FastAPI(
    title="Code Analyzer",
    description="Repository analysis service for AIForce Discovery Agent",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/ready")
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


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics() -> str:
    """Prometheus metrics endpoint."""
    return generate_latest().decode("utf-8"), 200, {"Content-Type": CONTENT_TYPE_LATEST}


@app.post("/api/v1/analyze", response_model=AnalyzeResponse)
async def analyze_repository(request: AnalyzeRequest) -> AnalyzeResponse:
    """
    Analyze a code repository.

    Clones the repository, analyzes it for languages, frameworks,
    dependencies, and metrics, then publishes CloudEvents.
    """
    import uuid
    from .git_client import GitClient
    from .analyzers.language_detector import LanguageDetector
    from .analyzers.framework_detector import FrameworkDetector
    from .analyzers.dependency_extractor import DependencyExtractor
    from .analyzers.metrics_calculator import MetricsCalculator
    from .publisher import EventPublisher

    analysis_id = str(uuid.uuid4())
    logger.info(f"Starting analysis {analysis_id} for {request.repo_url}")

    try:
        git_client = GitClient(
            token=request.credentials or settings.git_token,
            max_size_mb=settings.max_repo_size_mb,
            shallow=(settings.clone_depth == "shallow"),
        )

        # Clone repository
        repo_path = await git_client.clone(str(request.repo_url), request.branch)

        # Initialize analyzers
        language_detector = LanguageDetector(settings.excluded_dirs_list)
        framework_detector = FrameworkDetector()
        dependency_extractor = DependencyExtractor()
        metrics_calculator = MetricsCalculator(
            excluded_dirs=settings.excluded_dirs_list,
            max_file_size_kb=settings.max_file_size_kb,
        )

        # Run analysis
        languages = language_detector.detect(repo_path)
        frameworks = framework_detector.detect(repo_path)
        dependencies = dependency_extractor.extract(repo_path)
        metrics = metrics_calculator.calculate(repo_path)

        # Publish events
        channel = await get_rabbitmq_channel()
        publisher = EventPublisher(channel, settings.rabbitmq_exchange)

        await publisher.publish_repository_discovered(
            analysis_id=analysis_id,
            repo_url=str(request.repo_url),
            branch=request.branch,
            languages=languages,
            frameworks=frameworks,
        )

        await publisher.publish_codebase_discovered(
            analysis_id=analysis_id,
            repo_url=str(request.repo_url),
            metrics=metrics,
        )

        for dep in dependencies:
            await publisher.publish_dependency_discovered(
                analysis_id=analysis_id,
                repo_url=str(request.repo_url),
                dependency=dep,
            )

        # Cleanup
        await git_client.cleanup(repo_path)

        logger.info(f"Analysis {analysis_id} completed successfully")
        return AnalyzeResponse(
            status="completed",
            message=f"Analyzed {len(languages)} languages, {len(frameworks)} frameworks, {len(dependencies)} dependencies",
            analysis_id=analysis_id,
        )

    except Exception as e:
        logger.error(f"Analysis {analysis_id} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/stats")
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host=settings.server_host,
        port=settings.server_port,
        reload=True,
    )
