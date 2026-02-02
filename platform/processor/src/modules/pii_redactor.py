"""PII Redaction module for discovered items.

This module detects and redacts Personally Identifiable Information (PII)
from discovered data before it leaves the customer environment.
"""

import re
import structlog
from typing import Any

logger = structlog.get_logger()


class PIIRedactorModule:
    """Redacts PII from discovered items."""

    # Regex patterns for PII detection
    PATTERNS = {
        "email": re.compile(
            r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
            re.IGNORECASE,
        ),
        "ip_address": re.compile(
            r"\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}"
            r"(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b"
        ),
        "ipv6": re.compile(
            r"(?:(?:[0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|"
            r"(?:[0-9a-fA-F]{1,4}:){1,7}:|"
            r"(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4})",
            re.IGNORECASE,
        ),
        "phone": re.compile(
            r"\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b"
        ),
        "ssn": re.compile(r"\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b"),
        "credit_card": re.compile(
            r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|"
            r"3[47][0-9]{13}|6(?:011|5[0-9][0-9])[0-9]{12})\b"
        ),
        "api_key": re.compile(
            r"\b(?:api[_-]?key|apikey|secret|token|password|pwd)[\s:=]+['\"]?"
            r"([a-zA-Z0-9_\-]{20,})['\"]?",
            re.IGNORECASE,
        ),
        "aws_key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
        "username_in_path": re.compile(
            r"(?:/home/|/Users/|C:\\Users\\)([a-zA-Z0-9_.-]+)", re.IGNORECASE
        ),
    }

    # Redaction placeholders
    REDACTION_PLACEHOLDERS = {
        "email": "[REDACTED_EMAIL]",
        "ip_address": "[REDACTED_IP]",
        "ipv6": "[REDACTED_IPV6]",
        "phone": "[REDACTED_PHONE]",
        "ssn": "[REDACTED_SSN]",
        "credit_card": "[REDACTED_CC]",
        "api_key": "[REDACTED_SECRET]",
        "aws_key": "[REDACTED_AWS_KEY]",
        "username_in_path": "[REDACTED_USER]",
        "hostname": "[REDACTED_HOSTNAME]",
    }

    def __init__(
        self,
        redact_emails: bool = True,
        redact_ips: bool = True,
        redact_hostnames: bool = False,
        redact_usernames: bool = True,
    ):
        """Initialize PII redactor with configuration.

        Args:
            redact_emails: Whether to redact email addresses
            redact_ips: Whether to redact IP addresses
            redact_hostnames: Whether to redact hostnames
            redact_usernames: Whether to redact usernames in paths
        """
        self.redact_emails = redact_emails
        self.redact_ips = redact_ips
        self.redact_hostnames = redact_hostnames
        self.redact_usernames = redact_usernames

    async def process(self, data: dict[str, Any]) -> dict[str, Any]:
        """Redact PII from the discovered item data.

        Args:
            data: The enriched item data

        Returns:
            Data with PII redacted
        """
        redacted = self._redact_dict(data.copy())

        # Add redaction metadata
        if "redaction" not in redacted:
            redacted["redaction"] = {}

        redacted["redaction"]["applied"] = True
        redacted["redaction"]["version"] = "1.0.0"

        logger.info(
            "pii_redaction_complete",
            redaction_applied=True,
        )

        return redacted

    def _redact_dict(self, data: dict[str, Any]) -> dict[str, Any]:
        """Recursively redact PII from a dictionary."""
        result = {}
        for key, value in data.items():
            if isinstance(value, dict):
                result[key] = self._redact_dict(value)
            elif isinstance(value, list):
                result[key] = self._redact_list(value)
            elif isinstance(value, str):
                result[key] = self._redact_string(value, key)
            else:
                result[key] = value
        return result

    def _redact_list(self, data: list[Any]) -> list[Any]:
        """Recursively redact PII from a list."""
        result = []
        for item in data:
            if isinstance(item, dict):
                result.append(self._redact_dict(item))
            elif isinstance(item, list):
                result.append(self._redact_list(item))
            elif isinstance(item, str):
                result.append(self._redact_string(item))
            else:
                result.append(item)
        return result

    def _redact_string(self, text: str, field_name: str = "") -> str:
        """Redact PII from a string value.

        Args:
            text: The string to redact
            field_name: Optional field name for context-aware redaction

        Returns:
            The redacted string
        """
        result = text

        # Always redact highly sensitive data
        result = self.PATTERNS["ssn"].sub(self.REDACTION_PLACEHOLDERS["ssn"], result)
        result = self.PATTERNS["credit_card"].sub(
            self.REDACTION_PLACEHOLDERS["credit_card"], result
        )
        result = self.PATTERNS["api_key"].sub(
            r"\1" + self.REDACTION_PLACEHOLDERS["api_key"], result
        )
        result = self.PATTERNS["aws_key"].sub(
            self.REDACTION_PLACEHOLDERS["aws_key"], result
        )

        # Conditionally redact based on configuration
        if self.redact_emails:
            result = self.PATTERNS["email"].sub(
                self.REDACTION_PLACEHOLDERS["email"], result
            )

        if self.redact_ips:
            result = self.PATTERNS["ip_address"].sub(
                self.REDACTION_PLACEHOLDERS["ip_address"], result
            )
            result = self.PATTERNS["ipv6"].sub(
                self.REDACTION_PLACEHOLDERS["ipv6"], result
            )

        if self.redact_usernames:
            # Handle username in paths specially to preserve path structure
            result = self.PATTERNS["username_in_path"].sub(
                r"\1" + self.REDACTION_PLACEHOLDERS["username_in_path"], result
            )

        # Redact phone numbers
        result = self.PATTERNS["phone"].sub(
            self.REDACTION_PLACEHOLDERS["phone"], result
        )

        return result

    def detect_pii(self, text: str) -> list[dict[str, Any]]:
        """Detect PII in text without redacting.

        Args:
            text: The text to analyze

        Returns:
            List of detected PII items with type and location
        """
        findings = []

        for pii_type, pattern in self.PATTERNS.items():
            for match in pattern.finditer(text):
                findings.append(
                    {
                        "type": pii_type,
                        "start": match.start(),
                        "end": match.end(),
                        "value_preview": match.group()[:3] + "..."
                        if len(match.group()) > 3
                        else "[short]",
                    }
                )

        return findings
