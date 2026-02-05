"""
Pydantic request/response models for the Dry-Run Orchestrator API.
"""

from pydantic import BaseModel, Field, field_validator

from config import SESSION_ID_PATTERN


class StartSessionRequest(BaseModel):
    """Request to start a dry-run session."""

    session_id: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Session ID (alphanumeric, hyphens, underscores only)",
    )

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        """Validate session_id contains only safe characters for Docker names."""
        if not SESSION_ID_PATTERN.match(v):
            raise ValueError(
                "session_id must contain only alphanumeric characters, hyphens, and underscores"
            )
        return v


class StartSessionResponse(BaseModel):
    """Response after starting a dry-run session."""

    container_count: int
    network_name: str
    containers: list[dict]


class CleanupRequest(BaseModel):
    """Request to cleanup a dry-run session."""

    session_id: str = Field(
        ...,
        min_length=1,
        max_length=64,
        description="Session ID (alphanumeric, hyphens, underscores only)",
    )

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: str) -> str:
        """Validate session_id contains only safe characters for Docker names."""
        if not SESSION_ID_PATTERN.match(v):
            raise ValueError(
                "session_id must contain only alphanumeric characters, hyphens, and underscores"
            )
        return v


class CleanupResponse(BaseModel):
    """Response after cleaning up a dry-run session."""

    cleaned_containers: int
    session_id: str


class ContainerStatus(BaseModel):
    """Status of a container."""

    container_id: str
    name: str
    status: str
    image: str
    ports: dict
