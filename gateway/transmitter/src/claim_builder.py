"""Claim builder for Neo4j workbench integration.

Builds claims (assertions) about discovered entities with confidence tiers.
Claims are used by the workbench to make decisions about entity properties.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)

# Maximum claims per entity
MAX_CLAIMS_PER_ENTITY = 50


# Confidence tiers
class ConfidenceTier:
    """Confidence level tiers for claims."""

    VERIFIED = 1.0  # Human-verified or from authoritative source
    HIGH = 0.9  # Strong automated detection
    MEDIUM_HIGH = 0.75  # Good automated detection
    MEDIUM = 0.5  # Reasonable automated detection
    LOW = 0.25  # Weak signal
    INFERRED = 0.1  # Inferred from other data


# Claim types
class ClaimType:
    """Standard claim types."""

    IDENTITY = "identity"  # Who/what this entity is
    PROPERTY = "property"  # Attribute value
    RELATIONSHIP = "relationship"  # Connection to another entity
    CLASSIFICATION = "classification"  # Category/type
    METRIC = "metric"  # Measured value
    STATUS = "status"  # Current state


class ClaimBuilder:
    """Builds claims about discovered entities.

    Claims are assertions with confidence levels that can be
    used by the workbench to make decisions.
    """

    def __init__(self, max_claims: int = MAX_CLAIMS_PER_ENTITY):
        """
        Initialize the claim builder.

        Args:
            max_claims: Maximum claims to generate per entity
        """
        self._max_claims = max_claims

    def build_claims(self, event_data: dict[str, Any]) -> list[dict[str, Any]]:
        """
        Build claims from event data.

        Args:
            event_data: The CloudEvent data payload

        Returns:
            List of claims sorted by confidence (highest first)
        """
        claims = []

        enrichment = event_data.get("enrichment", {})
        scoring = event_data.get("scoring", {})
        metadata = event_data.get("metadata", {})

        entity_id = self._get_entity_id(event_data)

        # Identity claims
        claims.extend(self._build_identity_claims(event_data, enrichment))

        # Classification claims
        claims.extend(self._build_classification_claims(enrichment, event_data))

        # Property claims
        claims.extend(self._build_property_claims(event_data, metadata))

        # Metric claims (from scoring)
        claims.extend(self._build_metric_claims(scoring))

        # Relationship claims
        relationships = event_data.get("correlated_relationships", [])
        claims.extend(self._build_relationship_claims(relationships))

        # Sort by confidence and truncate
        claims.sort(key=lambda c: c.get("confidence", 0), reverse=True)
        claims = claims[: self._max_claims]

        # Add entity reference
        for claim in claims:
            claim["entity_id"] = entity_id

        if len(claims) > 0:
            logger.debug(f"Built {len(claims)} claims for entity {entity_id}")

        return claims

    def _build_identity_claims(
        self, data: dict[str, Any], _enrichment: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Build identity claims."""
        claims = []

        # Name/identifier claims
        if data.get("hostname"):
            claims.append(
                {
                    "type": ClaimType.IDENTITY,
                    "attribute": "hostname",
                    "value": data["hostname"],
                    "confidence": ConfidenceTier.HIGH,
                    "source": "network_scan",
                }
            )

        if data.get("repository_url"):
            claims.append(
                {
                    "type": ClaimType.IDENTITY,
                    "attribute": "repository_url",
                    "value": data["repository_url"],
                    "confidence": ConfidenceTier.VERIFIED,
                    "source": "code_analysis",
                }
            )

        if data.get("ip_addresses"):
            for ip in data["ip_addresses"]:
                claims.append(
                    {
                        "type": ClaimType.IDENTITY,
                        "attribute": "ip_address",
                        "value": ip,
                        "confidence": ConfidenceTier.VERIFIED,
                        "source": "network_scan",
                    }
                )

        return claims

    def _build_classification_claims(
        self, enrichment: dict[str, Any], data: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Build classification claims."""
        claims = []

        # Entity type classification
        if enrichment.get("entity_label"):
            claims.append(
                {
                    "type": ClaimType.CLASSIFICATION,
                    "attribute": "entity_type",
                    "value": enrichment["entity_label"],
                    "confidence": ConfidenceTier.HIGH,
                    "source": "enrichment",
                }
            )

        if enrichment.get("entity_category"):
            claims.append(
                {
                    "type": ClaimType.CLASSIFICATION,
                    "attribute": "entity_category",
                    "value": enrichment["entity_category"],
                    "confidence": ConfidenceTier.HIGH,
                    "source": "enrichment",
                }
            )

        # Environment classification
        if enrichment.get("environment"):
            confidence = (
                ConfidenceTier.MEDIUM_HIGH
                if enrichment["environment"] != "unknown"
                else ConfidenceTier.LOW
            )
            claims.append(
                {
                    "type": ClaimType.CLASSIFICATION,
                    "attribute": "environment",
                    "value": enrichment["environment"],
                    "confidence": confidence,
                    "source": "pattern_matching",
                }
            )

        # Application type
        if data.get("application_type"):
            claims.append(
                {
                    "type": ClaimType.CLASSIFICATION,
                    "attribute": "application_type",
                    "value": data["application_type"],
                    "confidence": ConfidenceTier.MEDIUM_HIGH,
                    "source": "code_analysis",
                }
            )

        # Architecture pattern
        if data.get("architecture_pattern"):
            claims.append(
                {
                    "type": ClaimType.CLASSIFICATION,
                    "attribute": "architecture_pattern",
                    "value": data["architecture_pattern"],
                    "confidence": ConfidenceTier.MEDIUM,
                    "source": "structure_analysis",
                }
            )

        return claims

    def _build_property_claims(
        self, data: dict[str, Any], metadata: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """Build property claims."""
        claims = []

        # Technology properties
        if data.get("db_type"):
            claims.append(
                {
                    "type": ClaimType.PROPERTY,
                    "attribute": "database_type",
                    "value": data["db_type"],
                    "confidence": ConfidenceTier.HIGH,
                    "source": "db_inspector",
                }
            )

        if data.get("version"):
            claims.append(
                {
                    "type": ClaimType.PROPERTY,
                    "attribute": "version",
                    "value": data["version"],
                    "confidence": ConfidenceTier.HIGH,
                    "source": "banner_detection",
                }
            )

        # Cloud metadata
        if metadata.get("cloud_provider"):
            confidence = (
                ConfidenceTier.MEDIUM_HIGH
                if metadata["cloud_provider"] not in ["none", "unknown"]
                else ConfidenceTier.LOW
            )
            claims.append(
                {
                    "type": ClaimType.PROPERTY,
                    "attribute": "cloud_provider",
                    "value": metadata["cloud_provider"],
                    "confidence": confidence,
                    "source": "ip_range_detection",
                }
            )

        if metadata.get("hosting_model"):
            claims.append(
                {
                    "type": ClaimType.PROPERTY,
                    "attribute": "hosting_model",
                    "value": metadata["hosting_model"],
                    "confidence": ConfidenceTier.MEDIUM,
                    "source": "ip_range_detection",
                }
            )

        # Languages and frameworks
        frameworks = data.get("frameworks", [])
        for fw in frameworks[:5]:  # Limit frameworks
            if isinstance(fw, dict) and fw.get("name"):
                confidence = fw.get("confidence", ConfidenceTier.MEDIUM)
                claims.append(
                    {
                        "type": ClaimType.PROPERTY,
                        "attribute": "uses_framework",
                        "value": fw["name"],
                        "confidence": confidence,
                        "source": "dependency_analysis",
                    }
                )

        return claims

    def _build_metric_claims(self, scoring: dict[str, Any]) -> list[dict[str, Any]]:
        """Build metric claims from scoring."""
        claims = []

        metric_mappings = [
            ("complexity_score", "complexity"),
            ("risk_score", "risk"),
            ("effort_score", "migration_effort"),
            ("cloud_readiness", "cloud_readiness"),
            ("migration_readiness", "migration_readiness"),
        ]

        for score_key, claim_attr in metric_mappings:
            value = scoring.get(score_key)
            if value is not None:
                claims.append(
                    {
                        "type": ClaimType.METRIC,
                        "attribute": claim_attr,
                        "value": value,
                        "confidence": ConfidenceTier.HIGH,
                        "source": "scoring_algorithm",
                    }
                )

        # Scoring factors as status claims
        factors = scoring.get("factors", [])
        for factor in factors[:5]:  # Limit factors
            claims.append(
                {
                    "type": ClaimType.STATUS,
                    "attribute": "scoring_factor",
                    "value": factor,
                    "confidence": ConfidenceTier.MEDIUM,
                    "source": "scoring_algorithm",
                }
            )

        return claims

    def _build_relationship_claims(
        self, relationships: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Build relationship claims."""
        claims = []

        for rel in relationships[:10]:  # Limit relationships
            claims.append(
                {
                    "type": ClaimType.RELATIONSHIP,
                    "attribute": rel.get("type", "relates_to"),
                    "value": {
                        "target_id": rel.get("target_id"),
                        "target_type": rel.get("target_type"),
                    },
                    "confidence": rel.get("confidence", ConfidenceTier.MEDIUM),
                    "source": "correlation",
                    "evidence": rel.get("evidence"),
                }
            )

        return claims

    def _get_entity_id(self, data: dict[str, Any]) -> str | None:
        """Extract entity ID from data."""
        for id_field in ["analysis_id", "server_id", "service_id", "probe_id", "db_id"]:
            if id_field in data:
                return data[id_field]
        return None
