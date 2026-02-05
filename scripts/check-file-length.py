#!/usr/bin/env python3
"""Pre-commit hook: enforce file length limits.

Python/Go: 500 LOC hard limit (450 warning)
TypeScript/TSX: 800 LOC hard limit (700 warning)

Counts non-empty, non-comment lines in staged files only.
Place SKIP_FILE_LENGTH_CHECK in the first 10 lines to opt out.
"""

import subprocess
import sys

# Hard limits (fail commit)
HARD_LIMITS = {
    ".py": 500,
    ".go": 500,
    ".ts": 800,
    ".tsx": 800,
}

# Warning thresholds (print warning but allow commit)
WARN_LIMITS = {
    ".py": 450,
    ".go": 450,
    ".ts": 700,
    ".tsx": 700,
}

EXCLUDED_PATTERNS = (
    "/migrations/",
    "/tests/",
    "/test_",
    "_test.go",
    "/sample-repos/",
    "/node_modules/",
    "/venv/",
    "/build/",
    "/dist/",
)

SKIP_MARKER = "SKIP_FILE_LENGTH_CHECK"


def get_staged_files():
    """Return list of staged file paths (added/modified)."""
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
        capture_output=True,
        text=True,
    )
    return [f.strip() for f in result.stdout.splitlines() if f.strip()]


def is_excluded(path):
    """Check if path matches any exclusion pattern."""
    return any(pattern in path for pattern in EXCLUDED_PATTERNS)


def get_extension(path):
    """Return file extension including the dot."""
    dot = path.rfind(".")
    return path[dot:] if dot != -1 else ""


def count_effective_lines(path):
    """Count non-empty, non-comment lines.

    Returns (line_count, should_skip) where should_skip is True if
    the SKIP_MARKER was found in the first 10 lines.
    """
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
    except OSError:
        return 0, False

    # Check first 10 lines for skip marker
    for line in lines[:10]:
        if SKIP_MARKER in line:
            return 0, True

    ext = get_extension(path)
    count = 0
    in_block_comment = False

    for line in lines:
        stripped = line.strip()

        # Skip empty lines
        if not stripped:
            continue

        # Handle block comments
        if ext in (".ts", ".tsx", ".go"):
            if in_block_comment:
                if "*/" in stripped:
                    in_block_comment = False
                continue
            if stripped.startswith("/*"):
                if "*/" not in stripped or stripped.endswith("/*"):
                    in_block_comment = True
                continue

        if ext in (".py",):
            # Single-line comments
            if stripped.startswith("#"):
                continue
        elif ext in (".go",):
            if stripped.startswith("//"):
                continue
        elif ext in (".ts", ".tsx"):
            if stripped.startswith("//"):
                continue

        count += 1

    return count, False


def main():
    staged = get_staged_files()
    warnings = []
    errors = []

    for path in staged:
        ext = get_extension(path)
        if ext not in HARD_LIMITS:
            continue

        if is_excluded(path):
            continue

        line_count, skip = count_effective_lines(path)
        if skip:
            continue

        hard = HARD_LIMITS[ext]
        warn = WARN_LIMITS[ext]

        if line_count > hard:
            errors.append(f"  FAIL  {path}: {line_count} lines (limit {hard})")
        elif line_count > warn:
            warnings.append(
                f"  WARN  {path}: {line_count} lines (warn at {warn}, limit {hard})"
            )

    if warnings:
        print("File length warnings:")
        for w in warnings:
            print(w)
        print()

    if errors:
        print("File length violations (commit blocked):")
        for e in errors:
            print(e)
        print()
        print("Split large files into modules or add SKIP_FILE_LENGTH_CHECK")
        print("in the first 10 lines as an escape hatch.")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
