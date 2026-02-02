"""Scoring module for discovered items.

This module calculates complexity and effort scores for discovered items
to help prioritize migration activities.
"""

import structlog
from typing import Any

logger = structlog.get_logger()


class ScoringModule:
    """Calculates complexity and effort scores for discovered items."""

    # Technology complexity weights (1-10 scale)
    TECHNOLOGY_COMPLEXITY = {
        # Databases
        "postgresql": 5,
        "mysql": 5,
        "mariadb": 5,
        "mongodb": 6,
        "redis": 3,
        "elasticsearch": 7,
        "oracle": 9,
        "mssql": 8,
        "db2": 9,
        # Web frameworks
        "spring framework": 7,
        "django": 5,
        "flask": 3,
        "fastapi": 4,
        "express.js": 4,
        "react": 5,
        "angular": 6,
        "vue.js": 4,
        ".net": 7,
        "ruby on rails": 6,
        "laravel": 5,
        # Infrastructure
        "ssh": 2,
        "http": 2,
        "https": 2,
        "rabbitmq": 5,
        "kafka": 8,
    }

    # Environment risk weights
    ENVIRONMENT_RISK = {
        "production": 3,
        "staging": 2,
        "development": 1,
        "unknown": 2,
    }

    # Database category complexity
    DB_CATEGORY_COMPLEXITY = {
        "relational": 5,
        "document": 6,
        "key-value": 3,
        "search": 7,
        "unknown": 5,
    }

    async def process(self, data: dict[str, Any]) -> dict[str, Any]:
        """Calculate scores for the discovered item.

        Args:
            data: The enriched and redacted item data

        Returns:
            Data with calculated scores
        """
        scored = data.copy()

        # Calculate individual score components
        complexity_score = self._calculate_complexity(data)
        risk_score = self._calculate_risk(data)
        effort_score = self._calculate_effort(data, complexity_score)

        # Add scoring metadata
        scored["scoring"] = {
            "version": "1.0.0",
            "complexity_score": complexity_score,
            "risk_score": risk_score,
            "effort_score": effort_score,
            "overall_score": self._calculate_overall(
                complexity_score, risk_score, effort_score
            ),
            "factors": self._get_scoring_factors(data),
        }

        logger.info(
            "scoring_complete",
            complexity=complexity_score,
            risk=risk_score,
            effort=effort_score,
        )

        return scored

    def _calculate_complexity(self, data: dict[str, Any]) -> int:
        """Calculate technology complexity score (1-10).

        Args:
            data: The item data

        Returns:
            Complexity score from 1 (simple) to 10 (complex)
        """
        scores = []

        # Check enrichment data for technology
        enrichment = data.get("enrichment", {})

        # Technology-based complexity
        technology = enrichment.get("technology", "").lower()
        if technology in self.TECHNOLOGY_COMPLEXITY:
            scores.append(self.TECHNOLOGY_COMPLEXITY[technology])

        # Framework-based complexity
        frameworks = enrichment.get("frameworks", [])
        for framework in frameworks:
            framework_lower = framework.lower()
            if framework_lower in self.TECHNOLOGY_COMPLEXITY:
                scores.append(self.TECHNOLOGY_COMPLEXITY[framework_lower])

        # Database category complexity
        db_category = enrichment.get("db_category", "")
        if db_category in self.DB_CATEGORY_COMPLEXITY:
            scores.append(self.DB_CATEGORY_COMPLEXITY[db_category])

        # Dependencies count (more deps = more complexity)
        dependencies = data.get("dependencies", [])
        if dependencies:
            dep_count = len(dependencies)
            if dep_count > 50:
                scores.append(8)
            elif dep_count > 20:
                scores.append(6)
            elif dep_count > 10:
                scores.append(4)
            else:
                scores.append(2)

        # Return average or default
        if scores:
            return min(10, max(1, round(sum(scores) / len(scores))))
        return 5  # Default medium complexity

    def _calculate_risk(self, data: dict[str, Any]) -> int:
        """Calculate risk score (1-10).

        Args:
            data: The item data

        Returns:
            Risk score from 1 (low) to 10 (high)
        """
        risk_factors = []

        enrichment = data.get("enrichment", {})

        # Environment risk
        environment = enrichment.get("environment", "unknown")
        env_risk = self.ENVIRONMENT_RISK.get(environment, 2)
        risk_factors.append(env_risk * 2)  # Scale to 1-6

        # Category-based risk
        category = enrichment.get("category", "")
        if category == "database":
            risk_factors.append(7)  # Databases are high risk
        elif category == "messaging":
            risk_factors.append(6)  # Messaging systems are medium-high
        elif category == "infrastructure":
            risk_factors.append(5)  # Infrastructure is medium
        elif category == "web":
            risk_factors.append(3)  # Web services are lower risk

        # PII presence increases risk
        redaction = data.get("redaction", {})
        if redaction.get("applied"):
            # If redaction was needed, there was PII
            risk_factors.append(6)

        # Return average or default
        if risk_factors:
            return min(10, max(1, round(sum(risk_factors) / len(risk_factors))))
        return 5  # Default medium risk

    def _calculate_effort(
        self, data: dict[str, Any], complexity: int
    ) -> int:
        """Calculate effort score (1-10).

        Effort is a function of complexity and other factors.

        Args:
            data: The item data
            complexity: The calculated complexity score

        Returns:
            Effort score from 1 (low effort) to 10 (high effort)
        """
        effort_factors = [complexity]  # Start with complexity

        enrichment = data.get("enrichment", {})

        # Database migrations require more effort
        if enrichment.get("db_category"):
            effort_factors.append(7)

        # Legacy technologies require more effort
        technology = enrichment.get("technology", "").lower()
        legacy_techs = ["oracle", "db2", "mssql", ".net"]
        if technology in legacy_techs:
            effort_factors.append(8)

        # Multiple frameworks increase effort
        frameworks = enrichment.get("frameworks", [])
        if len(frameworks) > 2:
            effort_factors.append(6)

        # Large dependency count increases effort
        dependencies = data.get("dependencies", [])
        if len(dependencies) > 30:
            effort_factors.append(7)

        # Return average
        if effort_factors:
            return min(10, max(1, round(sum(effort_factors) / len(effort_factors))))
        return 5  # Default medium effort

    def _calculate_overall(
        self, complexity: int, risk: int, effort: int
    ) -> int:
        """Calculate overall priority score.

        Weighted average of complexity, risk, and effort.
        Higher score = higher priority for migration planning.

        Args:
            complexity: Complexity score (1-10)
            risk: Risk score (1-10)
            effort: Effort score (1-10)

        Returns:
            Overall score from 1 to 10
        """
        # Weights: risk is most important, then effort, then complexity
        weighted = (complexity * 0.2) + (risk * 0.5) + (effort * 0.3)
        return min(10, max(1, round(weighted)))

    def _get_scoring_factors(self, data: dict[str, Any]) -> list[str]:
        """Get list of factors that influenced the scoring.

        Args:
            data: The item data

        Returns:
            List of factor descriptions
        """
        factors = []

        enrichment = data.get("enrichment", {})

        if enrichment.get("environment") == "production":
            factors.append("Production environment")

        if enrichment.get("db_category"):
            factors.append(f"Database: {enrichment['db_category']}")

        technology = enrichment.get("technology", "")
        if technology:
            factors.append(f"Technology: {technology}")

        frameworks = enrichment.get("frameworks", [])
        if frameworks:
            factors.append(f"Frameworks: {', '.join(frameworks[:3])}")

        dependencies = data.get("dependencies", [])
        if len(dependencies) > 20:
            factors.append(f"High dependency count: {len(dependencies)}")

        if data.get("redaction", {}).get("applied"):
            factors.append("Contains PII")

        return factors
