"""Application type classification for code repositories.

Classifies repositories into 8 application types based on structure,
dependencies, and configuration patterns.
"""

import logging
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Application type definitions with detection rules
APPLICATION_TYPES = {
    "web_application": {
        "description": "Frontend web application with UI",
        "indicators": {
            "files": [
                "index.html",
                "public/index.html",
                "src/index.html",
                "app/views",
                "templates",
            ],
            "frameworks": [
                "React",
                "Vue.js",
                "Angular",
                "Svelte",
                "Next.js",
                "Nuxt.js",
            ],
            "patterns": [
                r"<html",
                r"ReactDOM\.render",
                r"createApp\(",
                r"@Component",
            ],
            "deps": ["react-dom", "vue", "@angular/core", "svelte"],
        },
        "weight": 1.0,
    },
    "api_service": {
        "description": "Backend API service",
        "indicators": {
            "files": ["routes/", "api/", "endpoints/", "controllers/"],
            "frameworks": [
                "Express.js",
                "FastAPI",
                "Flask",
                "Django",
                "Gin",
                "Echo",
                "Spring Boot",
                "NestJS",
                "ASP.NET Core",
            ],
            "patterns": [
                r"@app\.(get|post|put|delete)",
                r"router\.(get|post|put|delete)",
                r"@GetMapping",
                r"@PostMapping",
                r"@Controller",
                r"@RestController",
            ],
            "deps": [
                "express",
                "fastapi",
                "flask",
                "gin-gonic",
                "spring-boot-starter-web",
            ],
        },
        "weight": 1.0,
    },
    "batch_job": {
        "description": "Batch processing or scheduled job",
        "indicators": {
            "files": ["jobs/", "tasks/", "cron/", "scheduler/", "batch/"],
            "frameworks": ["Celery", "Apache Airflow", "Luigi"],
            "patterns": [
                r"@scheduled",
                r"@celery\.task",
                r"cron",
                r"schedule\.",
                r"@Scheduled",
                r"BatchJob",
            ],
            "deps": ["celery", "apscheduler", "schedule", "quartz", "airflow"],
        },
        "weight": 1.2,  # Higher weight for explicit batch patterns
    },
    "cli_tool": {
        "description": "Command-line interface tool",
        "indicators": {
            "files": ["cli/", "cmd/", "bin/"],
            "frameworks": [],
            "patterns": [
                r"argparse",
                r"click\.command",
                r"typer\.run",
                r"cobra\.Command",
                r"flag\.Parse\(\)",
                r"Commander",
            ],
            "deps": ["click", "typer", "argparse", "commander", "yargs", "cobra"],
        },
        "weight": 1.0,
    },
    "library": {
        "description": "Reusable library or SDK",
        "indicators": {
            "files": ["setup.py", "setup.cfg", "lib/"],
            "frameworks": [],
            "patterns": [
                r"from setuptools import",
                r"module\.exports",
                r"export\s+(default\s+)?(function|class|const)",
                r"pub\s+fn",  # Rust public functions
            ],
            "deps": [],
            "negative_indicators": {
                "files": ["Dockerfile", "docker-compose.yml"],
                "deps": ["express", "flask", "fastapi", "django"],
            },
        },
        "weight": 0.8,  # Lower weight - often misclassified
    },
    "mobile_app": {
        "description": "Mobile application",
        "indicators": {
            "files": [
                "android/",
                "ios/",
                "app.json",
                "AndroidManifest.xml",
                "Info.plist",
            ],
            "frameworks": [],
            "patterns": [
                r"react-native",
                r"flutter",
                r"@ionic",
                r"Capacitor",
                r"NativeScript",
            ],
            "deps": [
                "react-native",
                "flutter",
                "@ionic/core",
                "@capacitor/core",
                "expo",
            ],
        },
        "weight": 1.2,
    },
    "desktop_app": {
        "description": "Desktop application",
        "indicators": {
            "files": ["electron/", "tauri.conf.json"],
            "frameworks": [],
            "patterns": [
                r"electron",
                r"tauri",
                r"\.exe",
                r"\.dmg",
                r"PyQt",
                r"wxPython",
                r"tkinter",
            ],
            "deps": [
                "electron",
                "@electron/remote",
                "tauri",
                "pyqt5",
                "pyside6",
                "wxpython",
            ],
        },
        "weight": 1.0,
    },
    "unknown": {
        "description": "Cannot determine application type",
        "indicators": {"files": [], "frameworks": [], "patterns": [], "deps": []},
        "weight": 0.0,
    },
}


class ApplicationClassifier:
    """Classifies repositories into application types."""

    def classify(
        self,
        repo_path: Path,
        frameworks: list[dict[str, Any]] | None = None,
        dependencies: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """
        Classify the repository's application type.

        Args:
            repo_path: Path to the repository
            frameworks: List of detected frameworks (from FrameworkDetector)
            dependencies: List of dependencies (from DependencyExtractor)

        Returns:
            Classification result with type and confidence
        """
        frameworks = frameworks or []
        dependencies = dependencies or []

        scores: dict[str, float] = {}
        detected_framework_names = {f["name"] for f in frameworks}
        detected_dep_names = {d["name"].lower() for d in dependencies}

        for app_type, config in APPLICATION_TYPES.items():
            if app_type == "unknown":
                continue

            score = 0.0
            indicators = config["indicators"]

            # Check indicator files
            for file_pattern in indicators.get("files", []):
                if self._file_exists(repo_path, file_pattern):
                    score += 0.3

            # Check frameworks
            for framework in indicators.get("frameworks", []):
                if framework in detected_framework_names:
                    score += 0.4

            # Check patterns in code
            if self._check_patterns(repo_path, indicators.get("patterns", [])):
                score += 0.3

            # Check dependencies
            for dep in indicators.get("deps", []):
                if dep.lower() in detected_dep_names:
                    score += 0.2

            # Apply negative indicators (reduce score if present)
            negative = indicators.get("negative_indicators", {})
            for neg_file in negative.get("files", []):
                if self._file_exists(repo_path, neg_file):
                    score -= 0.2
            for neg_dep in negative.get("deps", []):
                if neg_dep.lower() in detected_dep_names:
                    score -= 0.3

            # Apply weight
            scores[app_type] = max(0.0, score * config["weight"])

        # Get the highest scoring type
        if not scores or max(scores.values()) < 0.2:
            return {
                "application_type": "unknown",
                "confidence": 0.0,
                "all_scores": {},
            }

        best_type = max(scores.keys(), key=lambda k: scores[k])
        confidence = min(scores[best_type], 1.0)

        return {
            "application_type": best_type,
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
        if "*" in pattern:
            return bool(list(repo_path.glob(pattern)))
        return (repo_path / pattern).exists()

    def _check_patterns(self, repo_path: Path, patterns: list[str]) -> bool:
        """Check if any pattern matches in source files."""
        if not patterns:
            return False

        # Check common entry point files
        files_to_check = [
            "main.py",
            "app.py",
            "index.js",
            "index.ts",
            "main.go",
            "Main.java",
            "Program.cs",
            "src/main.rs",
            "src/index.ts",
            "src/index.js",
            "src/App.tsx",
            "src/App.jsx",
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
