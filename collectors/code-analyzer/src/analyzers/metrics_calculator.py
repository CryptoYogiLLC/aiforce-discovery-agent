"""Code metrics calculation for repositories."""

import logging
import os
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# File extensions to analyze for metrics
CODE_EXTENSIONS = {
    ".py",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".go",
    ".java",
    ".kt",
    ".scala",
    ".rb",
    ".rs",
    ".c",
    ".cpp",
    ".cc",
    ".h",
    ".hpp",
    ".cs",
    ".php",
    ".swift",
    ".m",
    ".mm",
    ".pl",
    ".sh",
    ".bash",
    ".lua",
    ".r",
    ".jl",
    ".ex",
    ".exs",
    ".erl",
    ".clj",
    ".dart",
    ".groovy",
    ".hs",
    ".ml",
    ".fs",
    ".v",
    ".zig",
    ".nim",
    ".cr",
}


class MetricsCalculator:
    """Calculates code metrics for a repository."""

    def __init__(
        self,
        excluded_dirs: list[str] | None = None,
        max_file_size_kb: int = 1024,
    ):
        self.excluded_dirs = set(excluded_dirs or [])
        self.max_file_size_kb = max_file_size_kb

    def calculate(self, repo_path: Path) -> dict[str, Any]:
        """
        Calculate code metrics for the repository.

        Returns:
            Dictionary with metrics
        """
        metrics: dict[str, Any] = {
            "lines_of_code": 0,
            "blank_lines": 0,
            "comment_lines": 0,
            "total_files": 0,
            "code_files": 0,
            "file_types": defaultdict(int),
            "average_file_size": 0,
            "largest_files": [],
            "complexity": {
                "average": 0,
                "max": 0,
                "files_above_threshold": 0,
            },
            "tech_debt_indicators": {
                "todo_count": 0,
                "fixme_count": 0,
                "hack_count": 0,
                "large_files": 0,
                "deeply_nested": 0,
            },
        }

        all_files: list[tuple[Path, int]] = []
        total_complexity = 0
        complexity_count = 0
        max_complexity = 0

        for root, dirs, files in os.walk(repo_path):
            # Filter excluded directories
            dirs[:] = [d for d in dirs if d not in self.excluded_dirs]

            for filename in files:
                filepath = Path(root) / filename
                metrics["total_files"] += 1

                ext = filepath.suffix.lower()
                metrics["file_types"][ext] += 1

                # Skip non-code files
                if ext not in CODE_EXTENSIONS:
                    continue

                try:
                    file_size = filepath.stat().st_size
                    if file_size > self.max_file_size_kb * 1024:
                        continue

                    metrics["code_files"] += 1
                    all_files.append((filepath, file_size))

                    # Analyze file
                    file_metrics = self._analyze_file(filepath)
                    metrics["lines_of_code"] += file_metrics["code_lines"]
                    metrics["blank_lines"] += file_metrics["blank_lines"]
                    metrics["comment_lines"] += file_metrics["comment_lines"]

                    # Tech debt indicators
                    metrics["tech_debt_indicators"]["todo_count"] += file_metrics[
                        "todo_count"
                    ]
                    metrics["tech_debt_indicators"]["fixme_count"] += file_metrics[
                        "fixme_count"
                    ]
                    metrics["tech_debt_indicators"]["hack_count"] += file_metrics[
                        "hack_count"
                    ]

                    if file_metrics["total_lines"] > 500:
                        metrics["tech_debt_indicators"]["large_files"] += 1

                    if file_metrics["max_indent"] > 6:
                        metrics["tech_debt_indicators"]["deeply_nested"] += 1

                    # Complexity (for Python files only currently)
                    if ext == ".py" and file_metrics.get("complexity"):
                        total_complexity += file_metrics["complexity"]
                        complexity_count += 1
                        max_complexity = max(max_complexity, file_metrics["complexity"])
                        if file_metrics["complexity"] > 10:
                            metrics["complexity"]["files_above_threshold"] += 1

                except Exception as e:
                    logger.debug(f"Error analyzing {filepath}: {e}")

        # Calculate averages
        if metrics["code_files"] > 0:
            total_size = sum(size for _, size in all_files)
            metrics["average_file_size"] = total_size / metrics["code_files"]

        if complexity_count > 0:
            metrics["complexity"]["average"] = round(
                total_complexity / complexity_count, 2
            )
            metrics["complexity"]["max"] = max_complexity

        # Find largest files
        all_files.sort(key=lambda x: x[1], reverse=True)
        metrics["largest_files"] = [
            {
                "path": str(filepath.relative_to(repo_path)),
                "size_bytes": size,
                "size_kb": round(size / 1024, 2),
            }
            for filepath, size in all_files[:10]
        ]

        # Convert defaultdict to dict
        metrics["file_types"] = dict(metrics["file_types"])

        return metrics

    def _analyze_file(self, filepath: Path) -> dict[str, Any]:
        """Analyze a single file for metrics."""
        result = {
            "total_lines": 0,
            "code_lines": 0,
            "blank_lines": 0,
            "comment_lines": 0,
            "todo_count": 0,
            "fixme_count": 0,
            "hack_count": 0,
            "max_indent": 0,
            "complexity": None,
        }

        try:
            with open(filepath, "r", errors="ignore") as f:
                content = f.read()
                lines = content.split("\n")

            result["total_lines"] = len(lines)

            ext = filepath.suffix.lower()
            in_multiline_comment = False

            for line in lines:
                stripped = line.strip()

                # Track indentation
                indent = len(line) - len(line.lstrip())
                spaces_per_indent = 4  # Assume 4 spaces
                indent_level = indent // spaces_per_indent
                result["max_indent"] = max(result["max_indent"], indent_level)

                # Blank lines
                if not stripped:
                    result["blank_lines"] += 1
                    continue

                # Comments (simplified detection)
                is_comment = False
                if ext in {".py", ".rb", ".sh", ".bash", ".pl", ".r"}:
                    is_comment = stripped.startswith("#")
                elif ext in {
                    ".js",
                    ".ts",
                    ".jsx",
                    ".tsx",
                    ".java",
                    ".go",
                    ".c",
                    ".cpp",
                    ".cs",
                    ".swift",
                    ".kt",
                    ".rs",
                    ".php",
                }:
                    if stripped.startswith("//"):
                        is_comment = True
                    elif stripped.startswith("/*"):
                        in_multiline_comment = True
                        is_comment = True
                    elif in_multiline_comment:
                        is_comment = True
                        if "*/" in stripped:
                            in_multiline_comment = False

                if is_comment:
                    result["comment_lines"] += 1
                else:
                    result["code_lines"] += 1

                # Tech debt markers
                upper_line = stripped.upper()
                if "TODO" in upper_line:
                    result["todo_count"] += 1
                if "FIXME" in upper_line:
                    result["fixme_count"] += 1
                if "HACK" in upper_line:
                    result["hack_count"] += 1

            # Calculate cyclomatic complexity for Python
            if ext == ".py":
                result["complexity"] = self._calculate_python_complexity(content)

        except Exception as e:
            logger.debug(f"Error reading {filepath}: {e}")

        return result

    def _calculate_python_complexity(self, content: str) -> int:
        """Calculate cyclomatic complexity for Python code."""
        try:
            from radon.complexity import cc_visit

            blocks = cc_visit(content)
            if blocks:
                return max(block.complexity for block in blocks)
            return 1
        except Exception:
            # Fallback: count decision points
            complexity = 1
            decision_keywords = [
                r"\bif\b",
                r"\belif\b",
                r"\bfor\b",
                r"\bwhile\b",
                r"\band\b",
                r"\bor\b",
                r"\bexcept\b",
            ]
            for keyword in decision_keywords:
                complexity += len(re.findall(keyword, content))
            return complexity
