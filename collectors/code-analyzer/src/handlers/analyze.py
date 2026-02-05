"""Repository analysis endpoint."""

import logging
import uuid

from fastapi import APIRouter, HTTPException

from ..config import settings
from ..models import AnalyzeRequest, AnalyzeResponse
from ..rabbitmq import get_rabbitmq_channel

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/v1/analyze", response_model=AnalyzeResponse)
async def analyze_repository(request: AnalyzeRequest) -> AnalyzeResponse:
    """
    Analyze a code repository.

    Clones the repository, analyzes it for languages, frameworks,
    dependencies, and metrics, then publishes CloudEvents.
    """
    from ..git_client import GitClient
    from ..analyzers.language_detector import LanguageDetector
    from ..analyzers.framework_detector import FrameworkDetector
    from ..analyzers.dependency_extractor import DependencyExtractor
    from ..analyzers.metrics_calculator import MetricsCalculator
    from ..publisher import EventPublisher

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
