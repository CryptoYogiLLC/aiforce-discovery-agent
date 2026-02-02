"""Framework and technology detection for code repositories."""

import json
import logging
import os
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Framework detection patterns
FRAMEWORK_PATTERNS: dict[str, dict[str, Any]] = {
    # JavaScript/TypeScript frameworks
    "React": {
        "files": ["package.json"],
        "patterns": [r'"react"\s*:', r'"react-dom"\s*:'],
        "language": "JavaScript",
    },
    "Next.js": {
        "files": ["next.config.js", "next.config.ts", "next.config.mjs"],
        "patterns": [r'"next"\s*:'],
        "language": "JavaScript",
    },
    "Vue.js": {
        "files": ["vue.config.js"],
        "patterns": [r'"vue"\s*:'],
        "language": "JavaScript",
    },
    "Nuxt.js": {
        "files": ["nuxt.config.js", "nuxt.config.ts"],
        "patterns": [r'"nuxt"\s*:'],
        "language": "JavaScript",
    },
    "Angular": {
        "files": ["angular.json", ".angular-cli.json"],
        "patterns": [r'"@angular/core"\s*:'],
        "language": "TypeScript",
    },
    "Svelte": {
        "files": ["svelte.config.js"],
        "patterns": [r'"svelte"\s*:'],
        "language": "JavaScript",
    },
    "Express.js": {
        "files": [],
        "patterns": [r'"express"\s*:'],
        "language": "JavaScript",
    },
    "NestJS": {
        "files": ["nest-cli.json"],
        "patterns": [r'"@nestjs/core"\s*:'],
        "language": "TypeScript",
    },
    "Fastify": {
        "files": [],
        "patterns": [r'"fastify"\s*:'],
        "language": "JavaScript",
    },
    # Python frameworks
    "Django": {
        "files": ["manage.py"],
        "patterns": [r"django", r"from django"],
        "language": "Python",
        "req_patterns": [r"django[=<>~]?"],
    },
    "FastAPI": {
        "files": [],
        "patterns": [r"from fastapi", r"import fastapi"],
        "language": "Python",
        "req_patterns": [r"fastapi[=<>~]?"],
    },
    "Flask": {
        "files": [],
        "patterns": [r"from flask", r"import flask"],
        "language": "Python",
        "req_patterns": [r"flask[=<>~]?"],
    },
    "Tornado": {
        "files": [],
        "patterns": [r"from tornado", r"import tornado"],
        "language": "Python",
        "req_patterns": [r"tornado[=<>~]?"],
    },
    "Pyramid": {
        "files": [],
        "patterns": [r"from pyramid", r"import pyramid"],
        "language": "Python",
        "req_patterns": [r"pyramid[=<>~]?"],
    },
    "Celery": {
        "files": [],
        "patterns": [r"from celery", r"import celery"],
        "language": "Python",
        "req_patterns": [r"celery[=<>~]?"],
    },
    "SQLAlchemy": {
        "files": [],
        "patterns": [r"from sqlalchemy", r"import sqlalchemy"],
        "language": "Python",
        "req_patterns": [r"sqlalchemy[=<>~]?"],
    },
    # Java frameworks
    "Spring Boot": {
        "files": [],
        "patterns": [r"spring-boot", r"@SpringBootApplication"],
        "language": "Java",
    },
    "Spring Framework": {
        "files": [],
        "patterns": [r"org\.springframework", r"spring-core"],
        "language": "Java",
    },
    "Hibernate": {
        "files": [],
        "patterns": [r"hibernate", r"@Entity"],
        "language": "Java",
    },
    "Maven": {
        "files": ["pom.xml"],
        "patterns": [],
        "language": "Java",
    },
    "Gradle": {
        "files": ["build.gradle", "build.gradle.kts"],
        "patterns": [],
        "language": "Java",
    },
    # Go frameworks
    "Gin": {
        "files": [],
        "patterns": [r"github\.com/gin-gonic/gin"],
        "language": "Go",
    },
    "Echo": {
        "files": [],
        "patterns": [r"github\.com/labstack/echo"],
        "language": "Go",
    },
    "Fiber": {
        "files": [],
        "patterns": [r"github\.com/gofiber/fiber"],
        "language": "Go",
    },
    "Chi": {
        "files": [],
        "patterns": [r"github\.com/go-chi/chi"],
        "language": "Go",
    },
    "GORM": {
        "files": [],
        "patterns": [r"gorm\.io/gorm"],
        "language": "Go",
    },
    # Ruby frameworks
    "Ruby on Rails": {
        "files": ["Gemfile", "config/routes.rb"],
        "patterns": [r"rails", r"gem ['\"]rails['\"]"],
        "language": "Ruby",
    },
    "Sinatra": {
        "files": [],
        "patterns": [r"gem ['\"]sinatra['\"]"],
        "language": "Ruby",
    },
    # Rust frameworks
    "Actix Web": {
        "files": [],
        "patterns": [r"actix-web"],
        "language": "Rust",
    },
    "Rocket": {
        "files": [],
        "patterns": [r'rocket\s*='],
        "language": "Rust",
    },
    "Axum": {
        "files": [],
        "patterns": [r'axum\s*='],
        "language": "Rust",
    },
    # C# frameworks
    "ASP.NET Core": {
        "files": [],
        "patterns": [r"Microsoft\.AspNetCore", r"<TargetFramework>net"],
        "language": "C#",
    },
    "Entity Framework": {
        "files": [],
        "patterns": [r"Microsoft\.EntityFrameworkCore"],
        "language": "C#",
    },
    # PHP frameworks
    "Laravel": {
        "files": ["artisan"],
        "patterns": [r"laravel/framework"],
        "language": "PHP",
    },
    "Symfony": {
        "files": [],
        "patterns": [r"symfony/"],
        "language": "PHP",
    },
    # Infrastructure
    "Docker": {
        "files": ["Dockerfile", "docker-compose.yml", "docker-compose.yaml"],
        "patterns": [],
        "language": "Infrastructure",
    },
    "Kubernetes": {
        "files": ["k8s/", "kubernetes/"],
        "patterns": [r"apiVersion:.*kubernetes", r"kind: Deployment"],
        "language": "Infrastructure",
    },
    "Terraform": {
        "files": ["main.tf", "variables.tf"],
        "patterns": [],
        "language": "Infrastructure",
    },
    "Helm": {
        "files": ["Chart.yaml"],
        "patterns": [],
        "language": "Infrastructure",
    },
}


class FrameworkDetector:
    """Detects frameworks and technologies in a repository."""

    def detect(self, repo_path: Path) -> list[dict[str, Any]]:
        """
        Detect frameworks in the repository.

        Returns:
            List of detected frameworks with confidence scores
        """
        detected: list[dict[str, Any]] = []

        for framework, config in FRAMEWORK_PATTERNS.items():
            confidence = self._check_framework(repo_path, framework, config)
            if confidence > 0:
                detected.append(
                    {
                        "name": framework,
                        "language": config.get("language", "Unknown"),
                        "confidence": confidence,
                    }
                )

        # Sort by confidence
        detected.sort(key=lambda x: x["confidence"], reverse=True)
        return detected

    def _check_framework(
        self, repo_path: Path, framework: str, config: dict[str, Any]
    ) -> float:
        """Check if a framework is present and return confidence score."""
        confidence = 0.0

        # Check for indicator files
        for indicator_file in config.get("files", []):
            if self._file_exists(repo_path, indicator_file):
                confidence += 0.5
                break

        # Check patterns in relevant files
        patterns = config.get("patterns", [])
        if patterns:
            if self._check_patterns_in_repo(repo_path, patterns):
                confidence += 0.5

        # Check requirements patterns (Python)
        req_patterns = config.get("req_patterns", [])
        if req_patterns:
            if self._check_requirements(repo_path, req_patterns):
                confidence += 0.3

        return min(confidence, 1.0)

    def _file_exists(self, repo_path: Path, filename: str) -> bool:
        """Check if a file exists in the repository."""
        # Handle directory patterns
        if filename.endswith("/"):
            return (repo_path / filename.rstrip("/")).is_dir()
        return (repo_path / filename).exists()

    def _check_patterns_in_repo(
        self, repo_path: Path, patterns: list[str]
    ) -> bool:
        """Check if patterns exist in common configuration files."""
        files_to_check = [
            "package.json",
            "go.mod",
            "go.sum",
            "requirements.txt",
            "pyproject.toml",
            "Pipfile",
            "pom.xml",
            "build.gradle",
            "Cargo.toml",
            "Gemfile",
            "composer.json",
        ]

        for filename in files_to_check:
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

    def _check_requirements(self, repo_path: Path, patterns: list[str]) -> bool:
        """Check patterns in Python requirements files."""
        req_files = ["requirements.txt", "requirements-dev.txt", "pyproject.toml", "Pipfile"]

        for req_file in req_files:
            filepath = repo_path / req_file
            if filepath.exists():
                try:
                    content = filepath.read_text(errors="ignore").lower()
                    for pattern in patterns:
                        if re.search(pattern, content, re.IGNORECASE):
                            return True
                except Exception:
                    pass

        return False
