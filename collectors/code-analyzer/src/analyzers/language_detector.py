"""Language detection for code repositories."""

import logging
import os
from collections import defaultdict
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Extension to language mapping
EXTENSION_MAP: dict[str, str] = {
    # Programming languages
    ".py": "Python",
    ".pyw": "Python",
    ".pyx": "Python",
    ".js": "JavaScript",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".jsx": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".go": "Go",
    ".java": "Java",
    ".kt": "Kotlin",
    ".kts": "Kotlin",
    ".scala": "Scala",
    ".rb": "Ruby",
    ".rs": "Rust",
    ".c": "C",
    ".h": "C",
    ".cpp": "C++",
    ".cc": "C++",
    ".cxx": "C++",
    ".hpp": "C++",
    ".cs": "C#",
    ".php": "PHP",
    ".swift": "Swift",
    ".m": "Objective-C",
    ".mm": "Objective-C",
    ".pl": "Perl",
    ".pm": "Perl",
    ".sh": "Shell",
    ".bash": "Shell",
    ".zsh": "Shell",
    ".ps1": "PowerShell",
    ".lua": "Lua",
    ".r": "R",
    ".R": "R",
    ".jl": "Julia",
    ".ex": "Elixir",
    ".exs": "Elixir",
    ".erl": "Erlang",
    ".hrl": "Erlang",
    ".clj": "Clojure",
    ".cljs": "Clojure",
    ".dart": "Dart",
    ".groovy": "Groovy",
    ".f90": "Fortran",
    ".f95": "Fortran",
    ".f03": "Fortran",
    ".hs": "Haskell",
    ".ml": "OCaml",
    ".mli": "OCaml",
    ".fs": "F#",
    ".fsx": "F#",
    ".v": "V",
    ".zig": "Zig",
    ".nim": "Nim",
    ".cr": "Crystal",
    # Markup/Config
    ".html": "HTML",
    ".htm": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".sass": "Sass",
    ".less": "Less",
    ".xml": "XML",
    ".json": "JSON",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".toml": "TOML",
    ".md": "Markdown",
    ".rst": "reStructuredText",
    # Templates
    ".vue": "Vue",
    ".svelte": "Svelte",
    ".astro": "Astro",
    # SQL
    ".sql": "SQL",
    # Protobuf/GraphQL
    ".proto": "Protocol Buffers",
    ".graphql": "GraphQL",
    ".gql": "GraphQL",
}

# Shebang to language mapping
SHEBANG_MAP: dict[str, str] = {
    "python": "Python",
    "python3": "Python",
    "node": "JavaScript",
    "nodejs": "JavaScript",
    "ruby": "Ruby",
    "perl": "Perl",
    "php": "PHP",
    "bash": "Shell",
    "sh": "Shell",
    "zsh": "Shell",
}


class LanguageDetector:
    """Detects programming languages in a repository."""

    def __init__(self, excluded_dirs: list[str] | None = None):
        self.excluded_dirs = set(excluded_dirs or [])

    def detect(self, repo_path: Path) -> dict[str, Any]:
        """
        Detect languages in the repository.

        Returns:
            Dictionary with language statistics
        """
        language_stats: dict[str, dict[str, int]] = defaultdict(
            lambda: {"files": 0, "lines": 0, "bytes": 0}
        )

        for root, dirs, files in os.walk(repo_path):
            # Filter excluded directories
            dirs[:] = [d for d in dirs if d not in self.excluded_dirs]

            for filename in files:
                filepath = Path(root) / filename
                try:
                    language = self._detect_file_language(filepath)
                    if language:
                        stats = self._get_file_stats(filepath)
                        language_stats[language]["files"] += 1
                        language_stats[language]["lines"] += stats["lines"]
                        language_stats[language]["bytes"] += stats["bytes"]
                except Exception as e:
                    logger.debug(f"Error processing {filepath}: {e}")

        # Calculate percentages
        total_lines = sum(s["lines"] for s in language_stats.values())
        total_bytes = sum(s["bytes"] for s in language_stats.values())

        result: dict[str, Any] = {
            "languages": {},
            "total_files": sum(s["files"] for s in language_stats.values()),
            "total_lines": total_lines,
            "total_bytes": total_bytes,
        }

        for lang, stats in sorted(
            language_stats.items(), key=lambda x: x[1]["lines"], reverse=True
        ):
            result["languages"][lang] = {
                "files": stats["files"],
                "lines": stats["lines"],
                "bytes": stats["bytes"],
                "percentage": round(stats["lines"] / total_lines * 100, 2)
                if total_lines > 0
                else 0,
            }

        return result

    def _detect_file_language(self, filepath: Path) -> str | None:
        """Detect language from file extension or shebang."""
        # Check extension
        ext = filepath.suffix.lower()
        if ext in EXTENSION_MAP:
            return EXTENSION_MAP[ext]

        # Check shebang for extensionless files
        if not ext:
            try:
                with open(filepath, "rb") as f:
                    first_line = f.readline(256)
                    if first_line.startswith(b"#!"):
                        shebang = first_line.decode("utf-8", errors="ignore").lower()
                        for interpreter, language in SHEBANG_MAP.items():
                            if interpreter in shebang:
                                return language
            except Exception:
                pass

        return None

    def _get_file_stats(self, filepath: Path) -> dict[str, int]:
        """Get file statistics."""
        try:
            size = filepath.stat().st_size
            with open(filepath, "rb") as f:
                lines = sum(1 for _ in f)
            return {"lines": lines, "bytes": size}
        except Exception:
            return {"lines": 0, "bytes": 0}
