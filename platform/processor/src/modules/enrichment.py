"""Enrichment module for discovered items.

This module adds contextual information to discovered items:
- Application context (what application does this belong to?)
- Environment classification (prod, staging, dev)
- Dependency relationships
- Technology stack identification
"""

import structlog
from typing import Any

logger = structlog.get_logger()


class EnrichmentModule:
    """Enriches discovered items with additional context."""

    # Common port to technology mappings
    PORT_TECHNOLOGY_MAP: dict[int, dict[str, str]] = {
        22: {"technology": "SSH", "category": "infrastructure"},
        80: {"technology": "HTTP", "category": "web"},
        443: {"technology": "HTTPS", "category": "web"},
        3306: {"technology": "MySQL", "category": "database"},
        5432: {"technology": "PostgreSQL", "category": "database"},
        6379: {"technology": "Redis", "category": "cache"},
        27017: {"technology": "MongoDB", "category": "database"},
        8080: {"technology": "HTTP Alt", "category": "web"},
        8443: {"technology": "HTTPS Alt", "category": "web"},
        9200: {"technology": "Elasticsearch", "category": "search"},
        9092: {"technology": "Kafka", "category": "messaging"},
        5672: {"technology": "RabbitMQ", "category": "messaging"},
        15672: {"technology": "RabbitMQ Management", "category": "management"},
    }

    # Environment detection patterns
    ENVIRONMENT_PATTERNS: dict[str, list[str]] = {
        "production": ["prod", "prd", "live", "main"],
        "staging": ["stage", "staging", "stg", "uat"],
        "development": ["dev", "develop", "local", "test"],
    }

    async def process(self, data: dict[str, Any]) -> dict[str, Any]:
        """Enrich the discovered item with additional context.

        Args:
            data: The discovered item data from the CloudEvent

        Returns:
            Enriched data with added context
        """
        enriched = data.copy()

        # Add enrichment metadata
        enriched["enrichment"] = {
            "version": "1.0.0",
            "applied": True,
        }

        # Enrich based on entity type
        entity_type = self._detect_entity_type(data)

        if entity_type == "server":
            enriched = await self._enrich_server(enriched)
        elif entity_type == "database":
            enriched = await self._enrich_database(enriched)
        elif entity_type == "repository":
            enriched = await self._enrich_repository(enriched)
        elif entity_type == "service":
            enriched = await self._enrich_service(enriched)

        logger.info(
            "enrichment_complete",
            entity_type=entity_type,
            enrichment_applied=True,
        )

        return enriched

    def _detect_entity_type(self, data: dict[str, Any]) -> str:
        """Detect the entity type from the data structure."""
        if "hostname" in data or "ip_address" in data:
            if "port" in data or "ports" in data:
                return "service"
            return "server"
        if "connection_string" in data or "database_type" in data:
            return "database"
        if "repository_url" in data or "language" in data:
            return "repository"
        return "unknown"

    async def _enrich_server(self, data: dict[str, Any]) -> dict[str, Any]:
        """Enrich server discovery data."""
        # Detect environment from hostname
        hostname = data.get("hostname", "")
        data["enrichment"]["environment"] = self._detect_environment(hostname)

        # Add OS family if detectable
        os_info = data.get("os", {})
        if os_info:
            data["enrichment"]["os_family"] = self._classify_os(os_info)

        return data

    async def _enrich_service(self, data: dict[str, Any]) -> dict[str, Any]:
        """Enrich service discovery data."""
        port = data.get("port")
        if port and port in self.PORT_TECHNOLOGY_MAP:
            tech_info = self.PORT_TECHNOLOGY_MAP[port]
            data["enrichment"]["technology"] = tech_info["technology"]
            data["enrichment"]["category"] = tech_info["category"]

        # Detect environment
        hostname = data.get("hostname", "")
        data["enrichment"]["environment"] = self._detect_environment(hostname)

        return data

    async def _enrich_database(self, data: dict[str, Any]) -> dict[str, Any]:
        """Enrich database discovery data."""
        db_type = data.get("database_type", "").lower()

        # Classify database
        if db_type in ["mysql", "mariadb", "postgresql", "postgres", "oracle", "mssql"]:
            data["enrichment"]["db_category"] = "relational"
        elif db_type in ["mongodb", "couchdb", "dynamodb"]:
            data["enrichment"]["db_category"] = "document"
        elif db_type in ["redis", "memcached"]:
            data["enrichment"]["db_category"] = "key-value"
        elif db_type in ["elasticsearch", "solr"]:
            data["enrichment"]["db_category"] = "search"
        else:
            data["enrichment"]["db_category"] = "unknown"

        # Detect environment from hostname in connection string
        conn_str = data.get("connection_string", "")
        data["enrichment"]["environment"] = self._detect_environment(conn_str)

        return data

    async def _enrich_repository(self, data: dict[str, Any]) -> dict[str, Any]:
        """Enrich repository discovery data."""
        # Classify language
        language = data.get("language", "").lower()

        language_categories = {
            "java": "backend",
            "python": "backend",
            "go": "backend",
            "rust": "backend",
            "javascript": "frontend",
            "typescript": "frontend",
            "react": "frontend",
            "vue": "frontend",
            "angular": "frontend",
            "swift": "mobile",
            "kotlin": "mobile",
            "c#": "backend",
            "ruby": "backend",
        }

        data["enrichment"]["language_category"] = language_categories.get(
            language, "other"
        )

        # Check for common frameworks
        dependencies = data.get("dependencies", [])
        data["enrichment"]["frameworks"] = self._detect_frameworks(dependencies)

        return data

    def _detect_environment(self, text: str) -> str:
        """Detect environment from hostname or other text."""
        text_lower = text.lower()
        for env, patterns in self.ENVIRONMENT_PATTERNS.items():
            for pattern in patterns:
                if pattern in text_lower:
                    return env
        return "unknown"

    def _classify_os(self, os_info: dict[str, Any]) -> str:
        """Classify OS into family."""
        os_name = os_info.get("name", "").lower()
        if "windows" in os_name:
            return "windows"
        if any(linux in os_name for linux in ["linux", "ubuntu", "centos", "rhel"]):
            return "linux"
        if "darwin" in os_name or "macos" in os_name:
            return "macos"
        return "unknown"

    def _detect_frameworks(self, dependencies: list[str]) -> list[str]:
        """Detect frameworks from dependencies."""
        framework_indicators = {
            "spring": "Spring Framework",
            "django": "Django",
            "flask": "Flask",
            "fastapi": "FastAPI",
            "express": "Express.js",
            "react": "React",
            "angular": "Angular",
            "vue": "Vue.js",
            "rails": "Ruby on Rails",
            "laravel": "Laravel",
            ".net": ".NET",
        }

        detected = []
        deps_lower = [d.lower() for d in dependencies]

        for indicator, framework in framework_indicators.items():
            if any(indicator in dep for dep in deps_lower):
                detected.append(framework)

        return detected
