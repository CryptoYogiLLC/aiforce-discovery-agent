"""Architecture pattern detection for code repositories.

Detects 6 architecture patterns based on code structure, configuration,
and dependencies.
"""

import logging
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Architecture pattern definitions
ARCHITECTURE_PATTERNS = {
    "microservice": {
        "description": "Microservices architecture with independent services",
        "indicators": {
            "files": [
                "docker-compose.yml",
                "docker-compose.yaml",
                "kubernetes/",
                "k8s/",
                "helm/",
                ".github/workflows/",
            ],
            "patterns": [
                r"services:",
                r"apiVersion:.*apps/v1",
                r"kind:\s*Deployment",
            ],
            "deps": ["@nestjs/microservices", "amqplib", "kafka-node", "grpc"],
            "structure_check": "_is_microservice_structure",
        },
        "weight": 1.0,
    },
    "monolith": {
        "description": "Monolithic application with single deployment unit",
        "indicators": {
            "files": [],
            "patterns": [],
            "deps": [],
            "structure_check": "_is_monolith_structure",
        },
        "weight": 0.7,  # Default fallback
    },
    "serverless": {
        "description": "Serverless/FaaS architecture",
        "indicators": {
            "files": [
                "serverless.yml",
                "serverless.yaml",
                "template.yaml",
                "sam.yaml",
                "netlify.toml",
                "vercel.json",
                "functions/",
                "lambda/",
            ],
            "patterns": [
                r"provider:\s*aws",
                r"AWSTemplateFormatVersion",
                r"AWS::Serverless",
                r"@azure/functions",
                r"functions-framework",
            ],
            "deps": [
                "serverless",
                "@aws-cdk/aws-lambda",
                "@vercel/node",
                "netlify-lambda",
                "aws-lambda",
            ],
        },
        "weight": 1.2,
    },
    "event_driven": {
        "description": "Event-driven architecture with message queues",
        "indicators": {
            "files": [],
            "patterns": [
                r"@EventHandler",
                r"EventEmitter",
                r"publish.*event",
                r"subscribe.*event",
                r"event_bus",
                r"message_queue",
            ],
            "deps": [
                "amqplib",
                "pika",
                "kafka-python",
                "confluent-kafka",
                "aio-pika",
                "celery",
                "nats",
                "@nestjs/cqrs",
            ],
        },
        "weight": 1.0,
    },
    "layered": {
        "description": "Traditional layered/n-tier architecture",
        "indicators": {
            "files": [],
            "patterns": [],
            "deps": [],
            "structure_check": "_is_layered_structure",
        },
        "weight": 0.8,
    },
    "modular_monolith": {
        "description": "Monolith with clear module boundaries",
        "indicators": {
            "files": [],
            "patterns": [],
            "deps": [],
            "structure_check": "_is_modular_monolith_structure",
        },
        "weight": 0.9,
    },
}

# Standard layered architecture directory names
LAYERED_DIRS = {
    "presentation": ["views", "templates", "pages", "components", "ui"],
    "application": ["services", "usecases", "application", "handlers"],
    "domain": ["domain", "models", "entities", "core"],
    "infrastructure": ["infrastructure", "repositories", "adapters", "data"],
}


class ArchitectureDetector:
    """Detects architecture patterns in repositories."""

    def detect(
        self,
        repo_path: Path,
        metrics: dict[str, Any] | None = None,
        dependencies: list[dict[str, Any]] | None = None,
        frameworks: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """
        Detect the architecture pattern of a repository.

        Args:
            repo_path: Path to the repository
            metrics: Codebase metrics (from MetricsCalculator)
            dependencies: List of dependencies
            frameworks: List of detected frameworks

        Returns:
            Detection result with pattern and confidence
        """
        metrics = metrics or {}
        dependencies = dependencies or []
        frameworks = frameworks or []

        scores: dict[str, float] = {}
        detected_dep_names = {d["name"].lower() for d in dependencies}

        for pattern_name, config in ARCHITECTURE_PATTERNS.items():
            score = 0.0
            indicators = config["indicators"]

            # Check indicator files
            for file_pattern in indicators.get("files", []):
                if self._file_exists(repo_path, file_pattern):
                    score += 0.3

            # Check code patterns
            if self._check_patterns(repo_path, indicators.get("patterns", [])):
                score += 0.3

            # Check dependencies
            for dep in indicators.get("deps", []):
                if dep.lower() in detected_dep_names:
                    score += 0.2

            # Run structure check if defined
            structure_check = indicators.get("structure_check")
            if structure_check and hasattr(self, structure_check):
                check_method = getattr(self, structure_check)
                if check_method(repo_path, metrics):
                    score += 0.4

            # Apply weight
            scores[pattern_name] = score * config["weight"]

        # If no strong signal, default to monolith
        if not scores or max(scores.values()) < 0.3:
            return {
                "architecture_pattern": "unknown",
                "confidence": 0.0,
                "all_scores": {},
            }

        best_pattern = max(scores.keys(), key=lambda k: scores[k])
        confidence = min(scores[best_pattern], 1.0)

        return {
            "architecture_pattern": best_pattern,
            "confidence": round(confidence, 2),
            "all_scores": {
                k: round(v, 2)
                for k, v in sorted(scores.items(), key=lambda x: -x[1])
                if v > 0
            },
        }

    def _file_exists(self, repo_path: Path, pattern: str) -> bool:
        """Check if a file or directory exists."""
        if pattern.endswith("/"):
            return (repo_path / pattern.rstrip("/")).is_dir()
        return (repo_path / pattern).exists()

    def _check_patterns(self, repo_path: Path, patterns: list[str]) -> bool:
        """Check if patterns match in configuration files."""
        if not patterns:
            return False

        config_files = [
            "docker-compose.yml",
            "docker-compose.yaml",
            "serverless.yml",
            "serverless.yaml",
            "template.yaml",
            "package.json",
            "pyproject.toml",
        ]

        for filename in config_files:
            filepath = repo_path / filename
            if filepath.exists():
                try:
                    content = filepath.read_text(errors="ignore")
                    for pattern in patterns:
                        if re.search(pattern, content, re.IGNORECASE):
                            return True
                except Exception:
                    pass

        return False

    def _is_microservice_structure(
        self, repo_path: Path, _metrics: dict[str, Any]
    ) -> bool:
        """Check if repo has microservice-like structure."""
        # Multiple Dockerfiles suggest microservices
        dockerfiles = list(repo_path.glob("**/Dockerfile"))
        if len(dockerfiles) > 1:
            return True

        # docker-compose with multiple services
        compose_file = repo_path / "docker-compose.yml"
        if not compose_file.exists():
            compose_file = repo_path / "docker-compose.yaml"

        if compose_file.exists():
            try:
                content = compose_file.read_text()
                # Count services defined
                services_match = re.search(r"services:", content)
                if services_match:
                    # Simple heuristic: count indented keys after services:
                    service_count = len(
                        re.findall(r"\n  [a-zA-Z][a-zA-Z0-9_-]*:", content)
                    )
                    if service_count > 2:
                        return True
            except Exception:
                pass

        return False

    def _is_monolith_structure(self, repo_path: Path, metrics: dict[str, Any]) -> bool:
        """Check if repo has monolithic structure."""
        # Single entry point, no service decomposition
        total_lines = metrics.get("total_lines", 0)

        # Large codebase without microservice indicators
        if total_lines > 50000:
            # Check for single Dockerfile
            dockerfiles = list(repo_path.glob("**/Dockerfile"))
            if len(dockerfiles) <= 1:
                return True

        return False

    def _is_layered_structure(self, repo_path: Path, _metrics: dict[str, Any]) -> bool:
        """Check if repo follows layered architecture."""
        layers_found = 0

        for _layer_name, dir_names in LAYERED_DIRS.items():
            for dir_name in dir_names:
                # Check in src/ and root
                for prefix in ["src/", ""]:
                    if (repo_path / f"{prefix}{dir_name}").is_dir():
                        layers_found += 1
                        break

        # At least 3 layers suggests layered architecture
        return layers_found >= 3

    def _is_modular_monolith_structure(
        self, repo_path: Path, _metrics: dict[str, Any]
    ) -> bool:
        """Check if repo is a modular monolith."""
        # Look for module-like structure
        modules_dir = repo_path / "modules"
        packages_dir = repo_path / "packages"
        apps_dir = repo_path / "apps"

        if modules_dir.is_dir():
            # Count subdirectories (modules)
            module_count = sum(1 for d in modules_dir.iterdir() if d.is_dir())
            if module_count >= 3:
                return True

        if packages_dir.is_dir():
            # Monorepo with packages
            package_count = sum(1 for d in packages_dir.iterdir() if d.is_dir())
            if package_count >= 3:
                return True

        if apps_dir.is_dir():
            # Monorepo with apps
            app_count = sum(1 for d in apps_dir.iterdir() if d.is_dir())
            if app_count >= 2:
                return True

        # Check for lerna.json or nx.json (monorepo tools)
        if (repo_path / "lerna.json").exists() or (repo_path / "nx.json").exists():
            return True

        return False
