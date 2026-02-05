"""Configuration for Infrastructure Probe service.

Security note: Credentials are NEVER logged or published to events.
They exist only in memory during probe execution.
"""

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Server settings
    server_host: str = Field(default="0.0.0.0", alias="INFRAPROBE_SERVER_HOST")
    server_port: int = Field(default=8004, alias="INFRAPROBE_SERVER_PORT")

    # RabbitMQ settings
    rabbitmq_url: str = Field(
        default="amqp://discovery:discovery@localhost:5672/",
        alias="INFRAPROBE_RABBITMQ_URL",
    )
    rabbitmq_exchange: str = Field(
        default="discovery.events", alias="INFRAPROBE_RABBITMQ_EXCHANGE"
    )

    # SSH settings
    ssh_timeout_s: int = Field(default=30, alias="INFRAPROBE_SSH_TIMEOUT_S")
    ssh_port: int = Field(default=22, alias="INFRAPROBE_SSH_PORT")

    # Probe settings
    max_concurrent_probes: int = Field(
        default=10, alias="INFRAPROBE_MAX_CONCURRENT_PROBES"
    )
    command_timeout_s: int = Field(default=60, alias="INFRAPROBE_COMMAND_TIMEOUT_S")

    # Security settings
    # NEVER log credentials - they are short-lived in-memory only
    allow_root_login: bool = Field(default=False, alias="INFRAPROBE_ALLOW_ROOT_LOGIN")
    require_key_auth: bool = Field(default=False, alias="INFRAPROBE_REQUIRE_KEY_AUTH")

    # Logging
    log_level: str = Field(default="INFO", alias="INFRAPROBE_LOG_LEVEL")

    model_config = {"env_prefix": "INFRAPROBE_", "case_sensitive": False}


settings = Settings()
