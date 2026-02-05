"""Configuration management for Transmitter service."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="TRANSMITTER_",
        env_nested_delimiter="__",
        case_sensitive=False,
    )

    # Server settings
    server_host: str = Field(default="0.0.0.0", description="Server host")
    server_port: int = Field(default=8020, description="Server port")

    # RabbitMQ settings
    rabbitmq_url: str = Field(
        default="amqp://discovery:discovery@localhost:5672/",
        description="RabbitMQ connection URL",
    )
    rabbitmq_exchange: str = Field(
        default="discovery.events",
        description="RabbitMQ exchange name",
    )
    rabbitmq_queue: str = Field(
        default="transmitter.approved",
        description="RabbitMQ queue name",
    )

    # Database settings
    database_url: str = Field(
        default="postgresql://discovery:discovery@localhost:5432/discovery",
        description="PostgreSQL connection URL",
    )

    # Destination settings
    destination_url: str = Field(
        default="https://api.example.com/v1/discovery",
        description="External API destination URL",
    )
    auth_token: str = Field(
        default="",
        description="API authentication token",
    )

    # Batch processing
    batch_size: int = Field(default=100, description="Maximum batch size")
    batch_interval_s: int = Field(default=60, description="Batch interval in seconds")

    # Phase 3: Output format (raw = backward compatible, neo4j = Neo4j format)
    output_format: str = Field(
        default="raw",
        description="Output format: 'raw' (backward compatible) or 'neo4j'",
    )
    max_claims_per_entity: int = Field(
        default=50, description="Maximum claims to generate per entity in neo4j format"
    )
    max_batch_size_mb: float = Field(
        default=10.0, description="Maximum batch size in MB before failing"
    )
    warn_batch_size_mb: float = Field(
        default=1.0, description="Batch size threshold for warning"
    )

    # Retry settings
    retry_max_attempts: int = Field(default=3, description="Max retry attempts")
    retry_backoff_multiplier: int = Field(default=2, description="Backoff multiplier")
    retry_max_delay_s: int = Field(
        default=300, description="Max retry delay in seconds"
    )

    # Circuit breaker settings
    circuit_failure_threshold: int = Field(
        default=5, description="Failure threshold to open circuit"
    )
    circuit_reset_timeout_s: int = Field(
        default=60, description="Circuit reset timeout in seconds"
    )

    # Logging
    log_level: str = Field(default="INFO", description="Logging level")


def get_settings() -> Settings:
    """Get application settings singleton."""
    return Settings()
