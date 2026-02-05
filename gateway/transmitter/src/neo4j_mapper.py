"""Neo4j-compatible payload mapper for discovered entities.

Transforms enriched/scored/correlated events into Neo4j-compatible format
for import into the AIForce Assess workbench.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


class Neo4jMapper:
    """Maps discovered entities to Neo4j-compatible format.

    Uses entity_label from enrichment (Phase 2) for node labeling.
    Transforms relationships from correlated_relationships.
    """

    def __init__(self, skip_empty_values: bool = True):
        """
        Initialize the mapper.

        Args:
            skip_empty_values: Skip null/empty values to reduce payload size
        """
        self._skip_empty = skip_empty_values

    def map_entity(self, event_data: dict[str, Any]) -> dict[str, Any]:
        """
        Map a single event to Neo4j node format.

        Args:
            event_data: The CloudEvent data payload

        Returns:
            Neo4j-compatible node structure
        """
        enrichment = event_data.get("enrichment", {})
        scoring = event_data.get("scoring", {})

        # Get entity label from enrichment (Phase 2)
        entity_label = enrichment.get("entity_label", "Entity")

        # Build node structure
        node = {
            "label": entity_label,
            "properties": self._build_properties(event_data, enrichment, scoring),
        }

        # Add relationships if present
        relationships = event_data.get("correlated_relationships", [])
        if relationships:
            node["relationships"] = [
                self._map_relationship(rel) for rel in relationships
            ]

        return node

    def _build_properties(
        self,
        data: dict[str, Any],
        enrichment: dict[str, Any],
        scoring: dict[str, Any],
    ) -> dict[str, Any]:
        """Build node properties from event data."""
        props: dict[str, Any] = {}

        # Core identification
        self._add_property(props, "entity_id", self._get_entity_id(data))
        self._add_property(props, "entity_category", enrichment.get("entity_category"))
        self._add_property(props, "environment", enrichment.get("environment"))

        # Type-specific properties
        entity_label = enrichment.get("entity_label", "")

        if entity_label in ["Server", "Infrastructure"]:
            self._add_server_properties(props, data)
        elif entity_label in ["Service", "APIService"]:
            self._add_service_properties(props, data)
        elif entity_label in [
            "Database",
            "RelationalDatabase",
            "DocumentDatabase",
            "KeyValueStore",
            "SearchEngine",
        ]:
            self._add_database_properties(props, data, enrichment)
        elif entity_label in [
            "Application",
            "WebApplication",
            "BatchJob",
            "Library",
            "CLITool",
        ]:
            self._add_application_properties(props, data)

        # Scoring properties
        self._add_property(props, "complexity_score", scoring.get("complexity_score"))
        self._add_property(props, "risk_score", scoring.get("risk_score"))
        self._add_property(props, "effort_score", scoring.get("effort_score"))
        self._add_property(props, "cloud_readiness", scoring.get("cloud_readiness"))
        self._add_property(
            props, "migration_readiness", scoring.get("migration_readiness")
        )

        # Metadata from Phase 1 (cloud detection)
        metadata = data.get("metadata", {})
        self._add_property(props, "cloud_provider", metadata.get("cloud_provider"))
        self._add_property(props, "hosting_model", metadata.get("hosting_model"))

        return props

    def _add_server_properties(
        self, props: dict[str, Any], data: dict[str, Any]
    ) -> None:
        """Add server-specific properties."""
        self._add_property(props, "hostname", data.get("hostname"))
        self._add_property(props, "ip_addresses", data.get("ip_addresses"))
        self._add_property(props, "open_ports", data.get("open_ports"))

        os_info = data.get("os", {})
        if os_info:
            self._add_property(props, "os_name", os_info.get("name"))
            self._add_property(props, "os_version", os_info.get("version"))
            self._add_property(props, "os_family", os_info.get("family"))

    def _add_service_properties(
        self, props: dict[str, Any], data: dict[str, Any]
    ) -> None:
        """Add service-specific properties."""
        self._add_property(props, "ip", data.get("ip"))
        self._add_property(props, "port", data.get("port"))
        self._add_property(props, "protocol", data.get("protocol"))
        self._add_property(props, "service_name", data.get("service"))
        self._add_property(props, "service_version", data.get("version"))

    def _add_database_properties(
        self,
        props: dict[str, Any],
        data: dict[str, Any],
        enrichment: dict[str, Any],
    ) -> None:
        """Add database-specific properties."""
        self._add_property(props, "db_type", data.get("db_type"))
        self._add_property(props, "host", data.get("host"))
        self._add_property(props, "port", data.get("port"))
        self._add_property(props, "db_version", data.get("version"))
        self._add_property(props, "db_category", enrichment.get("db_category"))

        # Database list
        databases = data.get("databases", [])
        if databases:
            self._add_property(
                props,
                "database_names",
                [db.get("name") for db in databases if db.get("name")],
            )

    def _add_application_properties(
        self, props: dict[str, Any], data: dict[str, Any]
    ) -> None:
        """Add application/repository-specific properties."""
        self._add_property(props, "repository_url", data.get("repository_url"))
        self._add_property(props, "branch", data.get("branch"))
        self._add_property(props, "application_type", data.get("application_type"))
        self._add_property(
            props, "architecture_pattern", data.get("architecture_pattern")
        )

        # Languages
        languages = data.get("languages", {})
        if languages:
            primary = max(
                languages.keys(),
                key=lambda k: languages[k].get("percentage", 0),
                default=None,
            )
            self._add_property(props, "primary_language", primary)
            self._add_property(props, "languages", list(languages.keys()))

        # Frameworks
        frameworks = data.get("frameworks", [])
        if frameworks:
            framework_names = [f.get("name") for f in frameworks if f.get("name")]
            self._add_property(props, "frameworks", framework_names)

    def _map_relationship(self, rel: dict[str, Any]) -> dict[str, Any]:
        """Map a relationship to Neo4j format."""
        return {
            "type": self._neo4j_relationship_type(rel.get("type", "RELATES_TO")),
            "start_node": rel.get("source_id"),
            "end_node": rel.get("target_id"),
            "properties": {
                "confidence": rel.get("confidence", 0.5),
                "evidence": rel.get("evidence"),
            },
        }

    def _neo4j_relationship_type(self, rel_type: str) -> str:
        """Convert relationship type to Neo4j convention (UPPER_CASE)."""
        return rel_type.upper().replace("-", "_")

    def _add_property(self, props: dict[str, Any], key: str, value: Any) -> None:
        """Add a property if it's not empty."""
        if self._skip_empty:
            if value is None or value == "" or value == []:
                return
        props[key] = value

    def _get_entity_id(self, data: dict[str, Any]) -> str | None:
        """Extract entity ID from data."""
        for id_field in ["analysis_id", "server_id", "service_id", "probe_id", "db_id"]:
            if id_field in data:
                return data[id_field]
        return None

    def map_batch(self, items: list[dict[str, Any]]) -> dict[str, Any]:
        """
        Map a batch of events to Neo4j import format.

        Args:
            items: List of CloudEvent data payloads

        Returns:
            Neo4j-compatible batch structure
        """
        nodes = []
        all_relationships = []

        for item in items:
            mapped = self.map_entity(item)
            nodes.append(
                {
                    "label": mapped["label"],
                    "properties": mapped["properties"],
                }
            )

            # Collect relationships
            if "relationships" in mapped:
                all_relationships.extend(mapped["relationships"])

        return {
            "format": "neo4j",
            "version": "1.0.0",
            "nodes": nodes,
            "relationships": all_relationships,
            "metadata": {
                "node_count": len(nodes),
                "relationship_count": len(all_relationships),
            },
        }
