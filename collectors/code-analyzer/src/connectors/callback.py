"""Callback reporter for autonomous scan orchestration.

Reference: ADR-007 Discovery Acquisition Model
"""

import logging
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)


class CallbackReporter:
    """Reports progress and completion to approval-api."""

    def __init__(
        self,
        scan_id: str,
        progress_url: str,
        complete_url: str,
        api_key: str | None = None,
    ):
        self.scan_id = scan_id
        self.progress_url = progress_url
        self.complete_url = complete_url
        self.api_key = api_key
        self._sequence = 0
        self._discovery_count = 0
        self._client = httpx.AsyncClient(timeout=30.0)

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()

    def _get_headers(self) -> dict[str, str]:
        """Get headers for callback requests."""
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["X-Internal-API-Key"] = self.api_key
        return headers

    async def report_progress(
        self,
        phase: str,
        progress: int,
        message: str | None = None,
    ) -> bool:
        """
        Report scan progress.

        Args:
            phase: Current phase name
            progress: Progress percentage (0-100)
            message: Optional status message

        Returns:
            True if callback succeeded, False otherwise
        """
        self._sequence += 1

        payload = {
            "scan_id": self.scan_id,
            "collector": "code-analyzer",
            "sequence": self._sequence,
            "phase": phase,
            "progress": progress,
            "discovery_count": self._discovery_count,
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        try:
            response = await self._client.post(
                self.progress_url,
                json=payload,
                headers=self._get_headers(),
            )
            if response.status_code >= 400:
                logger.warning(
                    f"Progress callback failed: {response.status_code} {response.text}"
                )
                return False
            return True
        except Exception as e:
            logger.warning(f"Progress callback error: {e}")
            return False

    async def report_complete(
        self,
        status: str,
        error_message: str | None = None,
    ) -> bool:
        """
        Report scan completion.

        Args:
            status: Final status (completed, failed, timeout)
            error_message: Error message if failed

        Returns:
            True if callback succeeded, False otherwise
        """
        payload = {
            "scan_id": self.scan_id,
            "collector": "code-analyzer",
            "status": status,
            "discovery_count": self._discovery_count,
            "error_message": error_message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        try:
            response = await self._client.post(
                self.complete_url,
                json=payload,
                headers=self._get_headers(),
            )
            if response.status_code >= 400:
                logger.warning(
                    f"Complete callback failed: {response.status_code} {response.text}"
                )
                return False
            return True
        except Exception as e:
            logger.warning(f"Complete callback error: {e}")
            return False

    def increment_discovery_count(self, count: int = 1) -> None:
        """Increment the discovery counter."""
        self._discovery_count += count

    @property
    def discovery_count(self) -> int:
        """Get the current discovery count."""
        return self._discovery_count
