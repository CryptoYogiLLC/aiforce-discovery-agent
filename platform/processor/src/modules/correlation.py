"""Correlation module for linking discovered entities.

This module correlates discovered items to build relationships:
- Repository → Service (deploys_to)
- Service → Database (connects_to)
- Server → Service (hosts)
- Repository → Repository (depends_on)

Per ADR-007, correlation runs in the processor pipeline after scoring.
Pipeline order: enrichment → pii_redactor → scoring → correlation
"""

import structlog
from typing import Any
from hashlib import sha256

logger = structlog.get_logger()


# Relationship types
class RelationshipType:
    """Constants for relationship types."""

    CONNECTS_TO = "connects_to"
    DEPLOYED_ON = "deployed_on"
    DEPENDS_ON = "depends_on"
    HOSTS = "hosts"
    USES = "uses"
    PART_OF = "part_of"


class CorrelationModule:
    """Correlates discovered items to build entity relationships.

    This module is idempotent - running it multiple times on the same
    data produces the same result. Relationships are stored in
    data.correlated_relationships[].
    """

    def __init__(self, correlation_store: dict[str, Any] | None = None):
        """
        Initialize the correlation module.

        Args:
            correlation_store: Optional shared store for cross-event correlation.
                              In production, this would be Redis or a database.
        """
        # In-memory store for single-process correlation
        # Production should use Redis or database for distributed correlation
        self._store = correlation_store if correlation_store is not None else {}

    async def process(self, data: dict[str, Any]) -> dict[str, Any]:
        """
        Correlate the discovered item with other entities.

        Args:
            data: The scored item data from the pipeline

        Returns:
            Data with correlated_relationships added
        """
        result = data.copy()

        # Initialize relationships list
        relationships = []

        # Detect entity type and correlate accordingly
        entity_type = self._detect_entity_type(data)

        if entity_type == "repository":
            relationships.extend(await self._correlate_repository(data))
        elif entity_type == "service":
            relationships.extend(await self._correlate_service(data))
        elif entity_type == "database":
            relationships.extend(await self._correlate_database(data))
        elif entity_type == "server":
            relationships.extend(await self._correlate_server(data))
        elif entity_type == "infrastructure":
            relationships.extend(await self._correlate_infrastructure(data))

        # Deduplicate relationships (idempotency)
        unique_relationships = self._deduplicate_relationships(relationships)

        if unique_relationships:
            result["correlated_relationships"] = unique_relationships
            logger.info(
                "correlation_complete",
                entity_type=entity_type,
                relationship_count=len(unique_relationships),
            )
        else:
            result["correlated_relationships"] = []

        # Store entity for future correlation
        self._store_entity(data, entity_type)

        return result

    def _detect_entity_type(self, data: dict[str, Any]) -> str:
        """Detect entity type from data structure."""
        enrichment = data.get("enrichment", {})

        # Check enrichment labels first (Phase 2 entity classification)
        entity_label = enrichment.get("entity_label", "").lower()
        if entity_label:
            if "database" in entity_label:
                return "database"
            if "repository" in entity_label or "application" in entity_label:
                return "repository"
            if "server" in entity_label:
                return "server"
            if "service" in entity_label:
                return "service"
            if "infrastructure" in entity_label:
                return "infrastructure"

        # Fallback to data field detection
        if "repository_url" in data or "analysis_id" in data:
            return "repository"
        if "db_type" in data or "database_type" in data:
            return "database"
        if "port" in data and "service" in data:
            return "service"
        if "ip_addresses" in data or "server_id" in data:
            return "server"
        if "probe_id" in data:
            return "infrastructure"

        return "unknown"

    async def _correlate_repository(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        """Correlate repository with services and dependencies."""
        relationships = []
        repo_id = self._get_entity_id(data, "repository")

        # Correlate with extracted connections (deployment targets)
        for conn in data.get("extracted_connections", []):
            if conn.get("host"):
                target_id = self._generate_id(
                    "service", conn.get("host"), conn.get("port")
                )
                relationships.append(
                    {
                        "type": RelationshipType.CONNECTS_TO,
                        "source_id": repo_id,
                        "source_type": "repository",
                        "target_id": target_id,
                        "target_type": conn.get("type", "service"),
                        "confidence": 0.8,
                        "evidence": f"Connection to {conn.get('host')}:{conn.get('port')}",
                    }
                )

        # Correlate with dependencies
        for dep in data.get("dependencies", []):
            if isinstance(dep, dict):
                dep_name = dep.get("name", "")
            else:
                dep_name = str(dep)

            if dep_name:
                target_id = self._generate_id("dependency", dep_name)
                relationships.append(
                    {
                        "type": RelationshipType.DEPENDS_ON,
                        "source_id": repo_id,
                        "source_type": "repository",
                        "target_id": target_id,
                        "target_type": "dependency",
                        "confidence": 1.0,
                        "evidence": f"Dependency: {dep_name}",
                    }
                )

        return relationships

    async def _correlate_service(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        """Correlate service with servers and databases."""
        relationships = []
        service_id = self._get_entity_id(data, "service")

        # Service → Server relationship (hosted on)
        server_id = data.get("server_id")
        ip = data.get("ip")

        if server_id:
            relationships.append(
                {
                    "type": RelationshipType.DEPLOYED_ON,
                    "source_id": service_id,
                    "source_type": "service",
                    "target_id": server_id,
                    "target_type": "server",
                    "confidence": 1.0,
                    "evidence": "Same server_id",
                }
            )
        elif ip:
            # Try to find server by IP in store
            server = self._find_entity_by_ip(ip)
            if server:
                relationships.append(
                    {
                        "type": RelationshipType.DEPLOYED_ON,
                        "source_id": service_id,
                        "source_type": "service",
                        "target_id": server["id"],
                        "target_type": "server",
                        "confidence": 0.9,
                        "evidence": f"IP match: {ip}",
                    }
                )

        # Check if this is a database service
        metadata = data.get("metadata", {})
        if metadata.get("database_candidate"):
            relationships.append(
                {
                    "type": RelationshipType.USES,
                    "source_id": service_id,
                    "source_type": "service",
                    "target_id": self._generate_id(
                        "database",
                        metadata.get("candidate_type"),
                        ip,
                        data.get("port"),
                    ),
                    "target_type": "database",
                    "confidence": metadata.get("candidate_confidence", 0.5),
                    "evidence": metadata.get(
                        "candidate_reason", "Database port detected"
                    ),
                }
            )

        return relationships

    async def _correlate_database(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        """Correlate database with services that connect to it."""
        relationships = []
        db_id = self._get_entity_id(data, "database")

        host = data.get("host")
        port = data.get("port")

        if host and port:
            # Find services that connect to this database
            services = self._find_services_connecting_to(host, port)
            for service in services:
                relationships.append(
                    {
                        "type": RelationshipType.CONNECTS_TO,
                        "source_id": service["id"],
                        "source_type": service["type"],
                        "target_id": db_id,
                        "target_type": "database",
                        "confidence": 0.85,
                        "evidence": f"Connection to {host}:{port}",
                    }
                )

        return relationships

    async def _correlate_server(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        """Correlate server with services it hosts."""
        relationships = []
        server_id = self._get_entity_id(data, "server")

        # Find services on this server's IPs
        ip_addresses = data.get("ip_addresses", [])
        for ip in ip_addresses:
            services = self._find_services_on_ip(ip)
            for service in services:
                relationships.append(
                    {
                        "type": RelationshipType.HOSTS,
                        "source_id": server_id,
                        "source_type": "server",
                        "target_id": service["id"],
                        "target_type": "service",
                        "confidence": 0.95,
                        "evidence": f"Service on IP {ip}",
                    }
                )

        return relationships

    async def _correlate_infrastructure(
        self, data: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Correlate infrastructure probe data with servers."""
        relationships = []
        infra_id = self._get_entity_id(data, "infrastructure")

        # Link to server by IP
        target_ip = data.get("target_ip")
        server_id = data.get("server_id")

        if server_id:
            relationships.append(
                {
                    "type": RelationshipType.PART_OF,
                    "source_id": infra_id,
                    "source_type": "infrastructure",
                    "target_id": server_id,
                    "target_type": "server",
                    "confidence": 1.0,
                    "evidence": "Same server_id",
                }
            )
        elif target_ip:
            server = self._find_entity_by_ip(target_ip)
            if server:
                relationships.append(
                    {
                        "type": RelationshipType.PART_OF,
                        "source_id": infra_id,
                        "source_type": "infrastructure",
                        "target_id": server["id"],
                        "target_type": "server",
                        "confidence": 0.9,
                        "evidence": f"IP match: {target_ip}",
                    }
                )

        return relationships

    def _get_entity_id(self, data: dict[str, Any], entity_type: str) -> str:
        """Get or generate an entity ID."""
        # Check for existing IDs
        id_fields = {
            "repository": ["analysis_id"],
            "service": ["service_id"],
            "database": ["db_id", "database_id"],
            "server": ["server_id"],
            "infrastructure": ["probe_id"],
        }

        for field in id_fields.get(entity_type, []):
            if field in data:
                return data[field]

        # Generate ID from data
        if entity_type == "repository":
            return self._generate_id("repository", data.get("repository_url", ""))
        if entity_type == "service":
            return self._generate_id(
                "service", data.get("ip"), data.get("port"), data.get("service")
            )
        if entity_type == "database":
            return self._generate_id(
                "database", data.get("db_type"), data.get("host"), data.get("port")
            )
        if entity_type == "server":
            ips = data.get("ip_addresses", [])
            return self._generate_id("server", *ips)
        if entity_type == "infrastructure":
            return self._generate_id("infrastructure", data.get("target_ip"))

        return self._generate_id(entity_type, str(data))

    def _generate_id(self, *parts) -> str:
        """Generate a deterministic ID from parts."""
        content = ":".join(str(p) for p in parts if p)
        return sha256(content.encode()).hexdigest()[:16]

    def _store_entity(self, data: dict[str, Any], entity_type: str) -> None:
        """Store entity for future correlation."""
        entity_id = self._get_entity_id(data, entity_type)

        self._store[entity_id] = {
            "id": entity_id,
            "type": entity_type,
            "data": {
                "ip": data.get("ip"),
                "ip_addresses": data.get("ip_addresses", []),
                "host": data.get("host"),
                "port": data.get("port"),
                "connections": data.get("extracted_connections", []),
            },
        }

    def _find_entity_by_ip(self, ip: str) -> dict[str, Any] | None:
        """Find an entity by IP address."""
        for entity in self._store.values():
            entity_data = entity.get("data", {})
            if ip == entity_data.get("ip"):
                return entity
            if ip in entity_data.get("ip_addresses", []):
                return entity
        return None

    def _find_services_on_ip(self, ip: str) -> list[dict[str, Any]]:
        """Find services running on an IP."""
        services = []
        for entity in self._store.values():
            if entity.get("type") == "service":
                if entity.get("data", {}).get("ip") == ip:
                    services.append(entity)
        return services

    def _find_services_connecting_to(
        self, host: str, port: int
    ) -> list[dict[str, Any]]:
        """Find services/repos that connect to a host:port."""
        results = []
        for entity in self._store.values():
            connections = entity.get("data", {}).get("connections", [])
            for conn in connections:
                if conn.get("host") == host and conn.get("port") == port:
                    results.append(entity)
                    break
        return results

    def _deduplicate_relationships(
        self, relationships: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Deduplicate relationships for idempotency."""
        seen = set()
        unique = []

        for rel in relationships:
            key = (
                rel.get("type"),
                rel.get("source_id"),
                rel.get("target_id"),
            )
            if key not in seen:
                seen.add(key)
                unique.append(rel)

        return unique
