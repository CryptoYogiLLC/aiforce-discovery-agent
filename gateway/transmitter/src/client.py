"""External API client with retry and circuit breaker."""

import gzip
import json
import logging
from typing import Any

import httpx
from circuitbreaker import circuit
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

logger = logging.getLogger(__name__)


class TransmissionError(Exception):
    """Error during transmission."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class APIClient:
    """HTTPS client for external API with retry and circuit breaker."""

    def __init__(
        self,
        destination_url: str,
        auth_token: str,
        retry_max_attempts: int = 3,
        retry_backoff_multiplier: int = 2,
        retry_max_delay_s: int = 300,
        circuit_failure_threshold: int = 5,
        circuit_reset_timeout_s: int = 60,
    ):
        self.destination_url = destination_url
        self.auth_token = auth_token
        self.retry_max_attempts = retry_max_attempts
        self.retry_backoff_multiplier = retry_backoff_multiplier
        self.retry_max_delay_s = retry_max_delay_s
        self.circuit_failure_threshold = circuit_failure_threshold
        self.circuit_reset_timeout_s = circuit_reset_timeout_s

        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=10.0),
            follow_redirects=True,
        )

        # Configure circuit breaker dynamically
        self._circuit_breaker = circuit(
            failure_threshold=circuit_failure_threshold,
            recovery_timeout=circuit_reset_timeout_s,
            expected_exception=TransmissionError,
        )

    async def close(self) -> None:
        """Close the HTTP client."""
        await self.client.aclose()

    def is_circuit_open(self) -> bool:
        """Check if circuit breaker is open."""
        return self._circuit_breaker.opened

    async def send_batch(self, items: list[dict[str, Any]]) -> tuple[int, str | None]:
        """
        Send a batch of items to the external API.

        Returns:
            Tuple of (HTTP status code, error message or None)
        """
        return await self._send_with_circuit_breaker(items)

    async def _send_with_circuit_breaker(
        self, items: list[dict[str, Any]]
    ) -> tuple[int, str | None]:
        """Send with circuit breaker protection."""
        try:
            return await self._send_with_retry(items)
        except Exception as e:
            logger.error(f"Circuit breaker may open: {e}")
            raise

    async def _send_with_retry(
        self, items: list[dict[str, Any]]
    ) -> tuple[int, str | None]:
        """Send with retry logic."""

        @retry(
            stop=stop_after_attempt(self.retry_max_attempts),
            wait=wait_exponential(
                multiplier=self.retry_backoff_multiplier,
                max=self.retry_max_delay_s,
            ),
            retry=retry_if_exception_type(TransmissionError),
            reraise=True,
        )
        async def _do_send():
            return await self._send_request(items)

        return await _do_send()

    async def _send_request(
        self, items: list[dict[str, Any]]
    ) -> tuple[int, str | None]:
        """Send the actual HTTP request."""
        # Prepare payload
        payload = json.dumps({"discoveries": items}).encode()

        # Compress with gzip
        compressed = gzip.compress(payload)
        logger.debug(
            f"Payload size: {len(payload)} bytes, compressed: {len(compressed)} bytes"
        )

        # Prepare headers
        headers = {
            "Content-Type": "application/json",
            "Content-Encoding": "gzip",
        }
        if self.auth_token:
            headers["Authorization"] = f"Bearer {self.auth_token}"

        try:
            response = await self.client.post(
                self.destination_url,
                content=compressed,
                headers=headers,
            )

            logger.info(
                f"Transmission response: {response.status_code} for {len(items)} items"
            )

            if response.status_code >= 500:
                # Server error - retry
                raise TransmissionError(
                    f"Server error: {response.status_code}",
                    status_code=response.status_code,
                )

            if response.status_code >= 400:
                # Client error - don't retry
                return response.status_code, response.text

            return response.status_code, None

        except httpx.RequestError as e:
            logger.error(f"Request error: {e}")
            raise TransmissionError(str(e))

    def get_payload_size(self, items: list[dict[str, Any]]) -> int:
        """Calculate compressed payload size."""
        payload = json.dumps({"discoveries": items}).encode()
        compressed = gzip.compress(payload)
        return len(compressed)
