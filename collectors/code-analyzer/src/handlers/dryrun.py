"""Dry-run scanning endpoints."""

import logging
import uuid
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException

from ..config import settings
from ..models import DryRunScanRequest, DryRunScanResponse

logger = logging.getLogger(__name__)

router = APIRouter()


async def post_dryrun_discovery(
    callback_url: str,
    session_id: str,
    discovery_type: str,
    data: dict,
) -> None:
    """Post a discovery to the approval-api's internal endpoint."""
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


@router.post("/api/v1/dryrun/scan", response_model=DryRunScanResponse)
async def scan_local_repos(request: DryRunScanRequest) -> DryRunScanResponse:
    """
    Scan local repositories for dry-run testing.

    This endpoint scans all repositories in the configured SAMPLE_REPOS_PATH
    (or the provided repos_path), analyzes each one, and posts discoveries
    to the approval-api's internal endpoint for dry-run session tracking.

    Used by the dryrun-orchestrator to trigger code analysis during dry-run sessions.
    """
    from ..analyzers.language_detector import LanguageDetector
    from ..analyzers.framework_detector import FrameworkDetector
    from ..analyzers.dependency_extractor import DependencyExtractor
    from ..analyzers.metrics_calculator import MetricsCalculator

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
    failed_repos: list[str] = []

    for repo_path in repo_dirs:
        analysis_id = str(uuid.uuid4())
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

            # Only track as successful after all analysis and posting succeeds
            analysis_ids.append(analysis_id)

            logger.info(
                f"Analyzed {repo_path.name}: {len(languages)} languages, "
                f"{len(frameworks)} frameworks, {len(dependencies)} dependencies"
            )

        except Exception as e:
            logger.error(f"Failed to analyze {repo_path.name}: {e}")
            failed_repos.append(repo_path.name)
            # Continue with other repos

    # Determine status based on results
    if failed_repos and not analysis_ids:
        status = "failed"
    elif failed_repos:
        status = "partial"
    else:
        status = "completed"

    failure_detail = f" ({len(failed_repos)} failed)" if failed_repos else ""

    logger.info(
        f"Dry-run scan {status}: {len(analysis_ids)}/{len(repo_dirs)} repos analyzed, "
        f"{discoveries_posted} discoveries posted{failure_detail}"
    )

    return DryRunScanResponse(
        status=status,
        message=f"Scanned {len(analysis_ids)}/{len(repo_dirs)} repositories, "
        f"posted {discoveries_posted} discoveries{failure_detail}",
        repos_scanned=len(analysis_ids),
        analysis_ids=analysis_ids,
    )
