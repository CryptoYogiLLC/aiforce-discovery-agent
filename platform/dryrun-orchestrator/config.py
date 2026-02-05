"""
Configuration and logging setup for the Dry-Run Orchestrator.

Contains Settings class (Pydantic), constants, and structured logging configuration.
"""

import re
import secrets

import structlog
from pydantic import Field
from pydantic_settings import BaseSettings

# Valid session ID pattern (alphanumeric, hyphens, underscores)
SESSION_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


class Settings(BaseSettings):
    """
    Application settings from environment variables.

    Security: No default credentials are provided. All sensitive settings
    MUST be configured via environment variables.
    """

    # Database/messaging URLs - REQUIRED, no defaults for security
    postgres_url: str = Field(
        ...,  # Required field, no default
        description="PostgreSQL connection URL (required)",
    )
    rabbitmq_url: str = Field(
        ...,  # Required field, no default
        description="RabbitMQ connection URL (required)",
    )
    redis_url: str = Field(
        default="redis://redis:6379",  # Redis typically doesn't have auth in dev
        description="Redis connection URL",
    )

    # API key for authenticating requests from approval-api
    api_key: str = Field(
        default_factory=lambda: secrets.token_urlsafe(32),
        description="API key for internal service authentication. "
        "Auto-generated if not provided (should be set in production).",
    )

    # Non-sensitive settings with safe defaults
    log_level: str = "info"
    sample_repos_path: str = "/repos"
    # Host path for mounting repos in new containers (required when running in container)
    # When orchestrator runs in a container, it sees /repos but needs host path for mounts
    sample_repos_host_path: str = ""  # If empty, uses sample_repos_path
    docker_network: str = "discovery-network"

    # Collector URLs for triggering scans
    code_analyzer_url: str = "http://code-analyzer:8002"
    network_scanner_url: str = "http://network-scanner:8001"
    db_inspector_url: str = "http://db-inspector:8003"

    # Approval API URL for posting discoveries
    approval_api_url: str = "http://approval-api:3001"

    class Config:
        env_prefix = "DRYRUN_"


# Validate settings on startup
try:
    settings = Settings()
except Exception as e:
    # Provide helpful error message for missing required settings
    raise SystemExit(
        f"Configuration error: {e}\n"
        "Required environment variables:\n"
        "  DRYRUN_POSTGRES_URL - PostgreSQL connection URL\n"
        "  DRYRUN_RABBITMQ_URL - RabbitMQ connection URL\n"
        "  DRYRUN_API_KEY - API key for authentication (optional, auto-generated if not set)"
    ) from e
