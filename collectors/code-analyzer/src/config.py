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

    # Phase 1: Git history analysis
    analyze_git_history: bool = Field(
        default=True, alias="CODEANALYZER_ANALYZE_GIT_HISTORY"
    )
    git_history_max_commits: int = Field(
        default=5000, alias="CODEANALYZER_GIT_HISTORY_MAX_COMMITS"
    )

    # Phase 1: Vulnerability scanning (DISABLED by default)
    vuln_scan_enabled: bool = Field(
        default=False, alias="CODEANALYZER_VULN_SCAN_ENABLED"
    )
    vuln_scan_offline_mode: bool = Field(
        default=True, alias="CODEANALYZER_VULN_SCAN_OFFLINE_MODE"
    )
    vuln_db_path: str = Field(
        default="/data/osv-database.json", alias="CODEANALYZER_VULN_DB_PATH"
    )

    # Phase 1: EOL checking
    eol_check_enabled: bool = Field(
        default=True, alias="CODEANALYZER_EOL_CHECK_ENABLED"
    )
    eol_data_path: str = Field(default="", alias="CODEANALYZER_EOL_DATA_PATH")

    @property
    def excluded_dirs_list(self) -> list[str]:
        """Get excluded directories as a list."""
        return [d.strip() for d in self.excluded_dirs.split(",") if d.strip()]

    @property
    def is_full_clone(self) -> bool:
        """Check if full clone is requested (for git history analysis)."""
        return self.clone_depth.lower() == "full"

    model_config = {"env_prefix": "CODEANALYZER_", "case_sensitive": False}


settings = Settings()
