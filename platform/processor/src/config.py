"""Configuration management for the unified processor service."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Service configuration
    service_name: str = "processor"
    service_version: str = "1.0.0"
    host: str = "0.0.0.0"
    port: int = 8010
    log_level: str = "info"

    # RabbitMQ configuration
    rabbitmq_url: str = "amqp://discovery:discovery@rabbitmq:5672/"

    # PostgreSQL configuration
    postgres_url: str = (
        "postgresql+asyncpg://discovery:discovery@postgres:5432/discovery_agent"
    )

    # Redis configuration
    redis_url: str = "redis://redis:6379"

    # Processing configuration
    candidate_identification_enabled: bool = (
        True  # ADR-007: Database candidate identification
    )
    enrichment_enabled: bool = True
    pii_redaction_enabled: bool = True
    scoring_enabled: bool = True

    # PII redaction settings
    pii_redact_emails: bool = True
    pii_redact_ips: bool = True
    pii_redact_hostnames: bool = False
    pii_redact_usernames: bool = True

    # Consumer settings
    prefetch_count: int = 10
    consumer_tag: str = "processor"

    @property
    def rabbitmq_host(self) -> str:
        """Extract host from RabbitMQ URL."""
        # Simple extraction - in production use proper URL parsing
        url = self.rabbitmq_url
        if "@" in url:
            return url.split("@")[1].split("/")[0].split(":")[0]
        return "rabbitmq"


settings = Settings()
