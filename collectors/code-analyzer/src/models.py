"""Request and response models for the Code Analyzer service."""

from pydantic import BaseModel, HttpUrl


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


class DiscoverRequest(BaseModel):
    """Request model for autonomous discovery scan (ADR-007)."""

    scan_id: str
    scan_paths: list[str] | None = None  # Paths to scan for repos
    limits: dict | None = None  # max_depth, max_repos
    progress_url: str
    complete_url: str


class DiscoverResponse(BaseModel):
    """Response model for autonomous discovery."""

    status: str
    message: str
    scan_id: str
