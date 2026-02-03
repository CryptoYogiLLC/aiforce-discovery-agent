"""Code Analyzer FastAPI application."""

import logging
from contextlib import asynccontextmanager
from typing import Any

import aio_pika
from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pathlib import Path

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


class DryRunScanRequest(BaseModel):
    """Request model for dry-run local repository scanning."""

    session_id: str
    repos_path: str | None = None  # Override SAMPLE_REPOS_PATH if provided
    callback_url: str | None = None  # URL to post discoveries (approval-api)


class DryRunScanResponse(BaseModel):
    """Response model for dry-run scan."""

    status: str
    message: str
    repos_scanned: int
    analysis_ids: list[str]


# Global state
app_state: dict[str, Any] = {
    "rabbitmq_connection": None,
    "rabbitmq_channel": None,
}


async def get_rabbitmq_connection() -> aio_pika.RobustConnection:
    """Get or create RabbitMQ connection."""
    if (
        app_state["rabbitmq_connection"] is None
        or app_state["rabbitmq_connection"].is_closed
    ):
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


@app.get("/metrics")
async def metrics() -> PlainTextResponse:
    """Prometheus metrics endpoint."""
    return PlainTextResponse(
        content=generate_latest().decode("utf-8"),
        media_type=CONTENT_TYPE_LATEST,
    )


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


async def post_dryrun_discovery(
    callback_url: str,
    session_id: str,
    discovery_type: str,
    data: dict,
) -> None:
    """Post a discovery to the approval-api's internal endpoint."""
    import httpx

    url = f"{callback_url}/api/dryrun/internal/discoveries"
    payload = {
        "session_id": session_id,
        "source": "code-analyzer",
        "discovery_type": discovery_type,
        "data": data,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()


@app.post("/api/v1/dryrun/scan", response_model=DryRunScanResponse)
async def scan_local_repos(request: DryRunScanRequest) -> DryRunScanResponse:
    """
    Scan local repositories for dry-run testing.

    This endpoint scans all repositories in the configured SAMPLE_REPOS_PATH
    (or the provided repos_path), analyzes each one, and posts discoveries
    to the approval-api's internal endpoint for dry-run session tracking.

    Used by the dryrun-orchestrator to trigger code analysis during dry-run sessions.
    """
    import uuid

    from .analyzers.language_detector import LanguageDetector
    from .analyzers.framework_detector import FrameworkDetector
    from .analyzers.dependency_extractor import DependencyExtractor
    from .analyzers.metrics_calculator import MetricsCalculator

    # Determine repos path
    repos_base = Path(request.repos_path or settings.sample_repos_path)
    if not repos_base.exists():
        raise HTTPException(
            status_code=400,
            detail=f"Repos path not found: {repos_base}",
        )

    # Callback URL is required for dry-run mode
    if not request.callback_url:
        raise HTTPException(
            status_code=400,
            detail="callback_url is required for dry-run scanning",
        )

    logger.info(
        f"Starting dry-run scan for session {request.session_id} at {repos_base}"
    )

    # Find all repo directories
    repo_dirs = [
        d for d in repos_base.iterdir() if d.is_dir() and not d.name.startswith(".")
    ]

    if not repo_dirs:
        raise HTTPException(
            status_code=400,
            detail=f"No repositories found in {repos_base}",
        )

    # Initialize analyzers
    language_detector = LanguageDetector(settings.excluded_dirs_list)
    framework_detector = FrameworkDetector()
    dependency_extractor = DependencyExtractor()
    metrics_calculator = MetricsCalculator(
        excluded_dirs=settings.excluded_dirs_list,
        max_file_size_kb=settings.max_file_size_kb,
    )

    analysis_ids = []
    discoveries_posted = 0

    for repo_path in repo_dirs:
        analysis_id = str(uuid.uuid4())
        analysis_ids.append(analysis_id)
        repo_url = f"dryrun://{request.session_id}/{repo_path.name}"

        logger.info(f"Analyzing local repo: {repo_path.name} (id: {analysis_id})")

        try:
            # Run analysis directly on local path (no git clone needed)
            languages = language_detector.detect(repo_path)
            frameworks = framework_detector.detect(repo_path)
            dependencies = dependency_extractor.extract(repo_path)
            metrics = metrics_calculator.calculate(repo_path)

            # Post repository discovery
            await post_dryrun_discovery(
                request.callback_url,
                request.session_id,
                "repository",
                {
                    "analysis_id": analysis_id,
                    "repo_url": repo_url,
                    "repo_name": repo_path.name,
                    "languages": languages,
                    "frameworks": frameworks,
                },
            )
            discoveries_posted += 1

            # Post codebase metrics discovery
            await post_dryrun_discovery(
                request.callback_url,
                request.session_id,
                "codebase_metrics",
                {
                    "analysis_id": analysis_id,
                    "repo_url": repo_url,
                    "repo_name": repo_path.name,
                    "metrics": metrics,
                },
            )
            discoveries_posted += 1

            # Post dependency discoveries
            for dep in dependencies:
                await post_dryrun_discovery(
                    request.callback_url,
                    request.session_id,
                    "dependency",
                    {
                        "analysis_id": analysis_id,
                        "repo_url": repo_url,
                        "repo_name": repo_path.name,
                        "dependency": dep,
                    },
                )
                discoveries_posted += 1

            logger.info(
                f"Analyzed {repo_path.name}: {len(languages)} languages, "
                f"{len(frameworks)} frameworks, {len(dependencies)} dependencies"
            )

        except Exception as e:
            logger.error(f"Failed to analyze {repo_path.name}: {e}")
            # Continue with other repos

    logger.info(
        f"Dry-run scan completed: {len(analysis_ids)}/{len(repo_dirs)} repos analyzed, "
        f"{discoveries_posted} discoveries posted"
    )

    return DryRunScanResponse(
        status="completed",
        message=f"Scanned {len(analysis_ids)} repositories, posted {discoveries_posted} discoveries",
        repos_scanned=len(analysis_ids),
        analysis_ids=analysis_ids,
    )


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
