"""Configuration management for Database Inspector."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="DBINSPECTOR_",
        env_nested_delimiter="__",
        case_sensitive=False,
    )

    # Server settings
    server_host: str = Field(default="0.0.0.0", description="Server host")
    server_port: int = Field(default=8003, description="Server port")

    # RabbitMQ settings
    rabbitmq_url: str = Field(
        default="amqp://discovery:discovery@localhost:5672/",
        description="RabbitMQ connection URL",
    )
    rabbitmq_exchange: str = Field(
        default="discovery.events",
        description="RabbitMQ exchange name",
    )

    # PostgreSQL default connection (for on-demand scanning)
    postgres_host: str = Field(default="localhost", description="PostgreSQL host")
    postgres_port: int = Field(default=5432, description="PostgreSQL port")
    postgres_user: str = Field(default="postgres", description="PostgreSQL user")
    postgres_password: str = Field(default="", description="PostgreSQL password")
    postgres_database: str = Field(default="postgres", description="PostgreSQL database")

    # MySQL default connection (for on-demand scanning)
    mysql_host: str = Field(default="localhost", description="MySQL host")
    mysql_port: int = Field(default=3306, description="MySQL port")
    mysql_user: str = Field(default="root", description="MySQL user")
    mysql_password: str = Field(default="", description="MySQL password")
    mysql_database: str = Field(default="mysql", description="MySQL database")

    # PII Detection settings
    pii_sample_size: int = Field(
        default=100,
        description="Number of rows to sample for PII detection",
    )
    pii_detection_enabled: bool = Field(
        default=True,
        description="Enable PII detection in data sampling",
    )

    # Logging
    log_level: str = Field(default="INFO", description="Logging level")


def get_settings() -> Settings:
    """Get application settings singleton."""
    return Settings()
