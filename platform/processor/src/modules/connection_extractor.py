"""Connection string extraction and redaction module.

Extracts database and service connection strings from code/config,
masking passwords while preserving host:port for correlation.
"""

import re
import structlog
from typing import Any
from urllib.parse import urlparse  # noqa: F401

logger = structlog.get_logger()

# Connection string patterns for various databases and services
CONNECTION_PATTERNS = {
    "jdbc": {
        "pattern": r"jdbc:([a-z0-9]+)://([^/\s]+)(?:/([^\s?]+))?(?:\?(.+))?",
        "extract": ["type", "host_port", "database", "params"],
    },
    "mongodb": {
        "pattern": r"mongodb(?:\+srv)?://(?:([^:]+):([^@]+)@)?([^/\s]+)(?:/([^\s?]+))?(?:\?(.+))?",
        "extract": ["username", "password", "host_port", "database", "params"],
    },
    "postgresql": {
        "pattern": r"postgres(?:ql)?://(?:([^:]+):([^@]+)@)?([^/\s]+)(?:/([^\s?]+))?(?:\?(.+))?",
        "extract": ["username", "password", "host_port", "database", "params"],
    },
    "mysql": {
        "pattern": r"mysql://(?:([^:]+):([^@]+)@)?([^/\s]+)(?:/([^\s?]+))?(?:\?(.+))?",
        "extract": ["username", "password", "host_port", "database", "params"],
    },
    "redis": {
        "pattern": r"redis://(?:([^:]+):([^@]+)@)?([^/\s]+)(?:/(\d+))?",
        "extract": ["username", "password", "host_port", "database"],
    },
    "amqp": {
        "pattern": r"amqps?://(?:([^:]+):([^@]+)@)?([^/\s]+)(?:/([^\s?]+))?(?:\?(.+))?",
        "extract": ["username", "password", "host_port", "vhost", "params"],
    },
    "sqlserver": {
        "pattern": r"(?:mssql|sqlserver)://(?:([^:]+):([^@]+)@)?([^/\s]+)(?:/([^\s?]+))?",
        "extract": ["username", "password", "host_port", "database"],
    },
    "elasticsearch": {
        "pattern": r"(?:https?://)?(?:([^:]+):([^@]+)@)?([^/\s:]+(?::\d+)?)",
        "extract": ["username", "password", "host_port"],
    },
}

# Patterns for inline credentials in config files
CONFIG_CREDENTIAL_PATTERNS = [
    # Key-value pairs
    (
        r"(?:password|pwd|secret|token|api[_-]?key)\s*[=:]\s*['\"]?([^'\"\s]+)",
        "credential",
    ),
    (r"(?:user(?:name)?|login)\s*[=:]\s*['\"]?([^'\"\s]+)", "username"),
    # Host/port patterns
    (
        r"(?:host(?:name)?|server|endpoint)\s*[=:]\s*['\"]?([^'\"\s:]+)(?::(\d+))?",
        "host",
    ),
    (r"(?:port)\s*[=:]\s*['\"]?(\d+)", "port"),
    (r"(?:database|db(?:name)?|schema)\s*[=:]\s*['\"]?([^'\"\s]+)", "database"),
]


class ConnectionExtractor:
    """Extracts and redacts connection strings from discovered data."""

    def __init__(self, redact_passwords: bool = True, preserve_host_port: bool = True):
        """
        Initialize the connection extractor.

        Args:
            redact_passwords: Whether to mask passwords (default: True)
            preserve_host_port: Whether to preserve host:port info (default: True)
        """
        self._redact_passwords = redact_passwords
        self._preserve_host_port = preserve_host_port

    async def process(self, data: dict[str, Any]) -> dict[str, Any]:
        """
        Extract connections from discovered data.

        Args:
            data: The discovered item data

        Returns:
            Data with extracted_connections list added
        """
        result = data.copy()
        connections = []

        # Extract from various data fields
        fields_to_scan = [
            "config",
            "environment",
            "env_vars",
            "connection_strings",
            "configuration",
            "settings",
        ]

        for field in fields_to_scan:
            if field in data:
                field_data = data[field]
                if isinstance(field_data, dict):
                    connections.extend(self._extract_from_dict(field_data))
                elif isinstance(field_data, str):
                    connections.extend(self._extract_from_string(field_data))
                elif isinstance(field_data, list):
                    for item in field_data:
                        if isinstance(item, str):
                            connections.extend(self._extract_from_string(item))

        # Also scan any string values in the data
        connections.extend(self._scan_for_connections(data))

        # Deduplicate connections
        unique_connections = self._deduplicate_connections(connections)

        if unique_connections:
            result["extracted_connections"] = unique_connections
            logger.info(
                "connections_extracted",
                count=len(unique_connections),
            )

        return result

    def _extract_from_dict(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        """Extract connections from a dictionary of config values."""
        connections = []

        for key, value in data.items():
            if isinstance(value, str):
                # Check for connection string patterns
                for db_type, config in CONNECTION_PATTERNS.items():
                    matches = re.findall(config["pattern"], value, re.IGNORECASE)
                    for match in matches:
                        conn = self._parse_connection(db_type, match, config["extract"])
                        if conn:
                            conn["source_key"] = key
                            connections.append(conn)

        return connections

    def _extract_from_string(self, text: str) -> list[dict[str, Any]]:
        """Extract connections from a text string."""
        connections = []

        for db_type, config in CONNECTION_PATTERNS.items():
            matches = re.findall(config["pattern"], text, re.IGNORECASE)
            for match in matches:
                conn = self._parse_connection(db_type, match, config["extract"])
                if conn:
                    connections.append(conn)

        return connections

    def _scan_for_connections(
        self, data: dict[str, Any], path: str = ""
    ) -> list[dict[str, Any]]:
        """Recursively scan data structure for connection strings."""
        connections = []

        for key, value in data.items():
            current_path = f"{path}.{key}" if path else key

            if isinstance(value, str) and len(value) > 10:
                # Skip already processed fields
                if key in [
                    "extracted_connections",
                    "enrichment",
                    "redaction",
                    "scoring",
                ]:
                    continue

                for db_type, config in CONNECTION_PATTERNS.items():
                    matches = re.findall(config["pattern"], value, re.IGNORECASE)
                    for match in matches:
                        conn = self._parse_connection(db_type, match, config["extract"])
                        if conn:
                            conn["source_path"] = current_path
                            connections.append(conn)

            elif isinstance(value, dict):
                connections.extend(self._scan_for_connections(value, current_path))

            elif isinstance(value, list):
                for i, item in enumerate(value):
                    if isinstance(item, dict):
                        connections.extend(
                            self._scan_for_connections(item, f"{current_path}[{i}]")
                        )

        return connections

    def _parse_connection(
        self, db_type: str, match: tuple, extract_fields: list[str]
    ) -> dict[str, Any] | None:
        """Parse a regex match into a connection dict."""
        if not match:
            return None

        conn = {"type": db_type}

        for i, field_name in enumerate(extract_fields):
            if i < len(match) and match[i]:
                value = match[i]

                # Redact sensitive fields
                if field_name == "password" and self._redact_passwords:
                    conn["password"] = "[REDACTED]"
                    conn["has_password"] = True
                elif field_name == "username":
                    # Keep username but note it exists
                    conn["username"] = value
                elif field_name == "host_port":
                    # Always preserve host:port for correlation
                    host, port = self._parse_host_port(value)
                    conn["host"] = host
                    if port:
                        conn["port"] = str(port)
                elif field_name == "database":
                    conn["database"] = value
                elif field_name in ["params", "vhost"]:
                    # Redact params that might contain secrets
                    conn[field_name] = self._redact_params(value)

        # Only return if we have meaningful connection info
        if conn.get("host"):
            return conn

        return None

    def _parse_host_port(self, host_port: str) -> tuple[str, int | None]:
        """Parse host:port string."""
        if ":" in host_port:
            parts = host_port.rsplit(":", 1)
            try:
                return parts[0], int(parts[1])
            except ValueError:
                return host_port, None
        return host_port, None

    def _redact_params(self, params: str) -> str:
        """Redact sensitive parameters from query string."""
        if not params:
            return ""

        sensitive_keys = ["password", "pwd", "secret", "token", "key", "credential"]
        redacted_parts = []

        for part in params.split("&"):
            if "=" in part:
                key, value = part.split("=", 1)
                if any(s in key.lower() for s in sensitive_keys):
                    redacted_parts.append(f"{key}=[REDACTED]")
                else:
                    redacted_parts.append(part)
            else:
                redacted_parts.append(part)

        return "&".join(redacted_parts)

    def _deduplicate_connections(
        self, connections: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Remove duplicate connections."""
        seen = set()
        unique = []

        for conn in connections:
            # Create a key from type, host, port, database
            key = (
                conn.get("type"),
                conn.get("host"),
                conn.get("port"),
                conn.get("database"),
            )
            if key not in seen:
                seen.add(key)
                unique.append(conn)

        return unique
