"""Autonomous repository discovery endpoint (ADR-007)."""

import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request

from ..config import settings
from ..models import DiscoverRequest, DiscoverResponse
from ..rabbitmq import get_rabbitmq_channel

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/api/v1/discover", response_model=DiscoverResponse)
async def discover_repositories(
    request: DiscoverRequest, raw_request: Request
) -> DiscoverResponse:
    """
    Autonomous repository discovery endpoint (ADR-007).

    Scans configured paths for code repositories, analyzes each one,
    and publishes discoveries via CloudEvents with scan_id tracking.
    Reports progress via callbacks to approval-api.
    """

    from ..connectors.callback import CallbackReporter
    from ..analyzers.language_detector import LanguageDetector
    from ..analyzers.framework_detector import FrameworkDetector
    from ..analyzers.dependency_extractor import DependencyExtractor
    from ..analyzers.metrics_calculator import MetricsCalculator
    from ..publisher import EventPublisher

    # Forward API key from incoming request to callback reporter
    api_key = raw_request.headers.get("x-internal-api-key")

    # Initialize callback reporter
    reporter = CallbackReporter(
        scan_id=request.scan_id,
        progress_url=request.progress_url,
        complete_url=request.complete_url,
        api_key=api_key,
    )

    logger.info(f"Starting autonomous discovery for scan {request.scan_id}")

    # Report initial progress
    await reporter.report_progress(
        "initializing", 0, "Starting code repository discovery"
    )

    try:
        # Determine scan paths
        scan_paths = request.scan_paths or [settings.sample_repos_path]
        limits = request.limits or {}
        max_repos = limits.get("max_repos", 100)
        # max_depth reserved for future directory depth limiting

        # Find all repository directories
        repo_dirs: list[Path] = []
        for scan_path in scan_paths:
            base_path = Path(scan_path)
            if not base_path.exists():
                logger.warning(f"Scan path not found: {scan_path}")
                continue

            # Find repo directories (look for .git folders or package files)
            for item in base_path.iterdir():
                if item.is_dir() and not item.name.startswith("."):
                    repo_dirs.append(item)
                    if len(repo_dirs) >= max_repos:
                        break

        if not repo_dirs:
            await reporter.report_complete("completed", None)
            return DiscoverResponse(
                status="completed",
                message="No repositories found in scan paths",
                scan_id=request.scan_id,
            )

        # Initialize analyzers
        language_detector = LanguageDetector(settings.excluded_dirs_list)
        framework_detector = FrameworkDetector()
        dependency_extractor = DependencyExtractor()
        metrics_calculator = MetricsCalculator(
            excluded_dirs=settings.excluded_dirs_list,
            max_file_size_kb=settings.max_file_size_kb,
        )

        # Initialize publisher with scan_id
        channel = await get_rabbitmq_channel()
        publisher = EventPublisher(channel, settings.rabbitmq_exchange, request.scan_id)

        total_repos = len(repo_dirs)
        failed_repos: list[str] = []
        analyzed_repos = 0

        for i, repo_path in enumerate(repo_dirs):
            progress = ((i + 1) * 100) // total_repos

            # Report progress
            await reporter.report_progress(
                "scanning",
                progress,
                f"Analyzing repository {i + 1}/{total_repos}: {repo_path.name}",
            )

            try:
                # Run analysis
                languages = language_detector.detect(repo_path)
                frameworks = framework_detector.detect(repo_path)
                dependencies = dependency_extractor.extract(repo_path)
                metrics = metrics_calculator.calculate(repo_path)

                analysis_id = str(uuid.uuid4())
                repo_url = f"file://{repo_path}"

                # Publish repository discovery
                await publisher.publish_repository_discovered(
                    analysis_id=analysis_id,
                    repo_url=repo_url,
                    branch="local",
                    languages=languages,
                    frameworks=frameworks,
                )
                reporter.increment_discovery_count()

                # Publish codebase metrics
                await publisher.publish_codebase_discovered(
                    analysis_id=analysis_id,
                    repo_url=repo_url,
                    metrics=metrics,
                )
                reporter.increment_discovery_count()

                # Publish dependencies
                for dep in dependencies:
                    await publisher.publish_dependency_discovered(
                        analysis_id=analysis_id,
                        repo_url=repo_url,
                        dependency=dep,
                    )
                    reporter.increment_discovery_count()

                analyzed_repos += 1
                logger.info(
                    f"Analyzed {repo_path.name}: {len(languages)} languages, "
                    f"{len(frameworks)} frameworks, {len(dependencies)} dependencies"
                )

            except Exception as e:
                logger.error(f"Failed to analyze {repo_path.name}: {e}")
                failed_repos.append(repo_path.name)
                # Continue with other repos

        # Determine completion status
        if failed_repos and analyzed_repos == 0:
            status = "failed"
            error_msg = f"All {len(failed_repos)} repos failed analysis"
        elif failed_repos:
            status = "completed"
            error_msg = f"{len(failed_repos)}/{total_repos} repos failed analysis"
        else:
            status = "completed"
            error_msg = None

        # Report completion
        await reporter.report_complete(status, error_msg)
        await reporter.close()

        logger.info(
            f"Autonomous discovery {status}: {analyzed_repos}/{total_repos} repos, "
            f"{reporter.discovery_count} discoveries"
        )

        return DiscoverResponse(
            status=status,
            message=f"Discovered {reporter.discovery_count} items from "
            f"{analyzed_repos}/{total_repos} repositories",
            scan_id=request.scan_id,
        )

    except Exception as e:
        logger.error(f"Autonomous discovery failed: {e}")
        await reporter.report_complete("failed", str(e))
        await reporter.close()
        raise HTTPException(status_code=500, detail=str(e))
