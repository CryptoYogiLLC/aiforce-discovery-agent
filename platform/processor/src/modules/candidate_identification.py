"""Candidate identification module for database discovery.

This module identifies database candidates from discovered services:
- Validates collector-flagged database candidates
- Raises confidence from 0.5 (port_only) to 0.85 (port_and_banner) when banner matches
- Preserves CloudEvent subject for scan_id tracking

Reference: ADR-007 Discovery Acquisition Model
"""

import re
import structlog
from typing import Any

logger = structlog.get_logger()


class CandidateIdentificationModule:
    """Identifies and validates database candidates from discovered services."""

    # Database port to type mappings (same as collectors use)
    DATABASE_PORTS: dict[int, str] = {
        3306: "mysql",
        5432: "postgresql",
        27017: "mongodb",
        6379: "redis",
        1433: "mssql",
        1521: "oracle",
        5984: "couchdb",
        9042: "cassandra",
        9200: "elasticsearch",
    }

    # Banner patterns for each database type (case-insensitive)
    # These patterns match common banner responses from database servers
    BANNER_PATTERNS: dict[str, list[str]] = {
        "mysql": [
            r"mysql",
            r"mariadb",
            r"5\.\d+\.\d+.*mysql",  # MySQL version pattern
            r"10\.\d+\.\d+.*mariadb",  # MariaDB version pattern
        ],
        "postgresql": [
            r"postgresql",
            r"postgres",
            r"pg_",
            r"psql",
        ],
        "mongodb": [
            r"mongodb",
            r"mongo",
            r"ismaster",  # MongoDB protocol response
        ],
        "redis": [
            r"redis",
            r"-err.*redis",
            r"\+pong",  # Redis PING response
        ],
        "mssql": [
            r"microsoft sql server",
            r"mssql",
            r"sqlserver",
            r"tds",  # TDS protocol
        ],
        "oracle": [
            r"oracle",
            r"tns",  # TNS protocol
            r"ora-\d+",  # Oracle error codes
        ],
        "couchdb": [
            r"couchdb",
            r"couch",
        ],
        "cassandra": [
            r"cassandra",
            r"datastax",
        ],
        "elasticsearch": [
            r"elasticsearch",
            r"elastic",
            r'"cluster_name"',  # Elasticsearch JSON response
        ],
    }

    # Confidence levels per ADR-007
    CONFIDENCE_PORT_ONLY = 0.5
    CONFIDENCE_PORT_AND_BANNER = 0.85

    async def process(self, data: dict[str, Any]) -> dict[str, Any]:
        """Process discovered service and identify database candidates.

        Args:
            data: The discovered item data from the CloudEvent

        Returns:
            Data with updated candidate identification metadata
        """
        processed = data.copy()

        # Initialize metadata if not present
        if "metadata" not in processed:
            processed["metadata"] = {}

        metadata = processed["metadata"]

        # Check if already flagged as database candidate by collector
        if metadata.get("database_candidate"):
            # Validate and potentially raise confidence
            processed = await self._validate_candidate(processed)
        else:
            # Check if this could be a database candidate not flagged by collector
            processed = await self._identify_candidate(processed)

        return processed

    async def _validate_candidate(self, data: dict[str, Any]) -> dict[str, Any]:
        """Validate a collector-flagged database candidate and raise confidence if banner matches.

        Args:
            data: Discovered service data with database_candidate flag

        Returns:
            Data with potentially raised confidence
        """
        metadata = data.get("metadata", {})
        port = data.get("port")
        banner = data.get("banner", "")

        current_confidence = metadata.get(
            "candidate_confidence", self.CONFIDENCE_PORT_ONLY
        )
        candidate_type = metadata.get("candidate_type", "")

        # If already at high confidence, skip
        if current_confidence >= self.CONFIDENCE_PORT_AND_BANNER:
            logger.debug(
                "candidate_already_validated",
                port=port,
                confidence=current_confidence,
            )
            return data

        # Check if banner matches expected database type
        if banner and candidate_type:
            if self._banner_matches(candidate_type, banner):
                metadata["candidate_confidence"] = self.CONFIDENCE_PORT_AND_BANNER
                metadata["candidate_reason"] = (
                    f"Port {port} + banner match for {candidate_type}"
                )
                metadata["validation_method"] = "port_and_banner"

                logger.info(
                    "candidate_confidence_raised",
                    port=port,
                    candidate_type=candidate_type,
                    old_confidence=current_confidence,
                    new_confidence=self.CONFIDENCE_PORT_AND_BANNER,
                )
            else:
                # Banner doesn't match - keep original confidence but note the mismatch
                metadata["banner_mismatch"] = True
                metadata["validation_method"] = "port_only"

                logger.debug(
                    "candidate_banner_mismatch",
                    port=port,
                    candidate_type=candidate_type,
                    banner_preview=banner[:50] if banner else None,
                )

        data["metadata"] = metadata
        return data

    async def _identify_candidate(self, data: dict[str, Any]) -> dict[str, Any]:
        """Identify potential database candidates not flagged by collector.

        This handles cases where collectors may have missed flagging a database.

        Args:
            data: Discovered service data without database_candidate flag

        Returns:
            Data with database candidate metadata if identified
        """
        port = data.get("port")
        banner = data.get("banner", "")
        metadata = data.get("metadata", {})

        # Check if port matches known database port
        if port in self.DATABASE_PORTS:
            db_type = self.DATABASE_PORTS[port]

            # Check if banner confirms the database type
            if banner and self._banner_matches(db_type, banner):
                metadata["database_candidate"] = True
                metadata["candidate_type"] = db_type
                metadata["candidate_confidence"] = self.CONFIDENCE_PORT_AND_BANNER
                metadata["candidate_reason"] = (
                    f"Port {port} + banner match for {db_type}"
                )
                metadata["validation_method"] = "port_and_banner"
                metadata["identified_by"] = "processor"

                logger.info(
                    "candidate_identified",
                    port=port,
                    candidate_type=db_type,
                    confidence=self.CONFIDENCE_PORT_AND_BANNER,
                )
            else:
                # Port matches but no banner confirmation - flag at lower confidence
                metadata["database_candidate"] = True
                metadata["candidate_type"] = db_type
                metadata["candidate_confidence"] = self.CONFIDENCE_PORT_ONLY
                metadata["candidate_reason"] = (
                    f"Port {port} matches {db_type} default port"
                )
                metadata["validation_method"] = "port_only"
                metadata["identified_by"] = "processor"

                logger.info(
                    "candidate_identified_port_only",
                    port=port,
                    candidate_type=db_type,
                    confidence=self.CONFIDENCE_PORT_ONLY,
                )

            data["metadata"] = metadata

        return data

    def _banner_matches(self, db_type: str, banner: str) -> bool:
        """Check if banner matches expected patterns for a database type.

        Args:
            db_type: Database type (mysql, postgresql, etc.)
            banner: Service banner/response string

        Returns:
            True if banner matches expected patterns
        """
        if not banner:
            return False

        patterns = self.BANNER_PATTERNS.get(db_type.lower(), [])
        banner_lower = banner.lower()

        for pattern in patterns:
            if re.search(pattern, banner_lower, re.IGNORECASE):
                return True

        return False
