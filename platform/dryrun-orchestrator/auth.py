"""
API key authentication for the Dry-Run Orchestrator.

All Docker control endpoints require a valid API key to prevent
unauthorized container manipulation.
"""

import secrets
from typing import Annotated

from fastapi import Depends, Header, HTTPException

from config import logger, settings


async def verify_api_key(x_api_key: Annotated[str | None, Header()] = None) -> str:
    """
    Verify the API key for protected endpoints.

    All Docker control endpoints require a valid API key to prevent
    unauthorized container manipulation.
    """
    if not x_api_key:
        logger.warning("API request without authentication")
        raise HTTPException(
            status_code=401,
            detail="Missing X-API-Key header",
            headers={"WWW-Authenticate": "ApiKey"},
        )

    if not secrets.compare_digest(x_api_key, settings.api_key):
        logger.warning("API request with invalid key")
        raise HTTPException(
            status_code=403,
            detail="Invalid API key",
        )

    return x_api_key


# Type alias for dependency injection
ApiKeyDep = Annotated[str, Depends(verify_api_key)]
