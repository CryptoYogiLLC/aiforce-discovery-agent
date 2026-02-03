"""Configuration for Code Analyzer service."""

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Server settings
    server_host: str = Field(default="0.0.0.0", alias="CODEANALYZER_SERVER_HOST")
    server_port: int = Field(default=8002, alias="CODEANALYZER_SERVER_PORT")

    # RabbitMQ settings
    rabbitmq_url: str = Field(
        default="amqp://discovery:discovery@localhost:5672/",
        alias="CODEANALYZER_RABBITMQ_URL",
    )
    rabbitmq_exchange: str = Field(
        default="discovery.events", alias="CODEANALYZER_RABBITMQ_EXCHANGE"
    )

    # Git settings
    git_token: str = Field(default="", alias="CODEANALYZER_GIT_TOKEN")
    max_repo_size_mb: int = Field(default=500, alias="CODEANALYZER_MAX_REPO_SIZE_MB")
    clone_depth: str = Field(default="shallow", alias="CODEANALYZER_CLONE_DEPTH")
    clone_timeout_s: int = Field(default=300, alias="CODEANALYZER_CLONE_TIMEOUT_S")

    # Analysis settings
    max_file_size_kb: int = Field(default=1024, alias="CODEANALYZER_MAX_FILE_SIZE_KB")
    excluded_dirs: str = Field(
        default="node_modules,.git,vendor,dist,build,target,__pycache__,.venv,venv",
        alias="CODEANALYZER_EXCLUDED_DIRS",
    )

    # Logging
    log_level: str = Field(default="INFO", alias="CODEANALYZER_LOG_LEVEL")

    # Dry-run settings
    dryrun_mode: bool = Field(default=False, alias="DRYRUN_MODE")
    sample_repos_path: str = Field(default="/repos", alias="SAMPLE_REPOS_PATH")

    @property
    def excluded_dirs_list(self) -> list[str]:
        """Get excluded directories as a list."""
        return [d.strip() for d in self.excluded_dirs.split(",") if d.strip()]

    model_config = {"env_prefix": "CODEANALYZER_", "case_sensitive": False}


settings = Settings()
