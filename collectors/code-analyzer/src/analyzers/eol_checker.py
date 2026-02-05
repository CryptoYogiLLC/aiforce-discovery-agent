"""End-of-life (EOL) status checker for dependencies and runtimes.

Uses a versioned data file to check EOL status without requiring
external API calls. Data file should be updated periodically.
"""

import json
import logging
from datetime import date, datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Default path for EOL data file
DEFAULT_EOL_DATA_PATH = Path(__file__).parent.parent.parent / "data" / "eol_data.json"

# Fallback EOL data when data file is not available
# This is minimal data - production should use the data file
FALLBACK_EOL_DATA = {
    "version": "2024.01.01",
    "products": {
        "python": {
            "2.7": {"eol": "2020-01-01", "support_status": "eol"},
            "3.6": {"eol": "2021-12-23", "support_status": "eol"},
            "3.7": {"eol": "2023-06-27", "support_status": "eol"},
            "3.8": {"eol": "2024-10-14", "support_status": "security_only"},
            "3.9": {"eol": "2025-10-05", "support_status": "security_only"},
            "3.10": {"eol": "2026-10-04", "support_status": "active"},
            "3.11": {"eol": "2027-10-24", "support_status": "active"},
            "3.12": {"eol": "2028-10-01", "support_status": "active"},
        },
        "node": {
            "12": {"eol": "2022-04-30", "support_status": "eol"},
            "14": {"eol": "2023-04-30", "support_status": "eol"},
            "16": {"eol": "2023-09-11", "support_status": "eol"},
            "18": {"eol": "2025-04-30", "support_status": "maintenance"},
            "20": {"eol": "2026-04-30", "support_status": "active"},
            "21": {"eol": "2024-06-01", "support_status": "active"},
            "22": {"eol": "2027-04-30", "support_status": "active"},
        },
        "java": {
            "8": {"eol": "2030-12-31", "support_status": "maintenance"},
            "11": {"eol": "2032-01-31", "support_status": "maintenance"},
            "17": {"eol": "2029-09-30", "support_status": "active"},
            "21": {"eol": "2031-09-30", "support_status": "active"},
        },
        "go": {
            "1.18": {"eol": "2023-02-01", "support_status": "eol"},
            "1.19": {"eol": "2023-08-08", "support_status": "eol"},
            "1.20": {"eol": "2024-02-06", "support_status": "eol"},
            "1.21": {"eol": "2024-08-13", "support_status": "maintenance"},
            "1.22": {"eol": "2025-02-01", "support_status": "active"},
        },
        "ruby": {
            "2.6": {"eol": "2022-04-12", "support_status": "eol"},
            "2.7": {"eol": "2023-03-31", "support_status": "eol"},
            "3.0": {"eol": "2024-03-31", "support_status": "security_only"},
            "3.1": {"eol": "2025-03-31", "support_status": "maintenance"},
            "3.2": {"eol": "2026-03-31", "support_status": "active"},
            "3.3": {"eol": "2027-03-31", "support_status": "active"},
        },
        "dotnet": {
            "5.0": {"eol": "2022-05-10", "support_status": "eol"},
            "6.0": {"eol": "2024-11-12", "support_status": "maintenance"},
            "7.0": {"eol": "2024-05-14", "support_status": "eol"},
            "8.0": {"eol": "2026-11-10", "support_status": "active"},
        },
        "php": {
            "7.4": {"eol": "2022-11-28", "support_status": "eol"},
            "8.0": {"eol": "2023-11-26", "support_status": "eol"},
            "8.1": {"eol": "2024-11-25", "support_status": "security_only"},
            "8.2": {"eol": "2025-12-08", "support_status": "active"},
            "8.3": {"eol": "2026-11-23", "support_status": "active"},
        },
    },
}


class EOLChecker:
    """Checks end-of-life status for dependencies and runtimes."""

    def __init__(self, data_path: str | Path | None = None):
        """
        Initialize the EOL checker.

        Args:
            data_path: Path to EOL data file. Uses default or fallback if not provided.
        """
        self._data_path = Path(data_path) if data_path else DEFAULT_EOL_DATA_PATH
        self._eol_data: dict[str, Any] = {}
        self._load_data()

    def _load_data(self) -> None:
        """Load EOL data from file or use fallback."""
        if self._data_path.exists():
            try:
                with open(self._data_path) as f:
                    self._eol_data = json.load(f)
                logger.info(
                    f"Loaded EOL data version {self._eol_data.get('version', 'unknown')}"
                )
                return
            except Exception as e:
                logger.warning(f"Failed to load EOL data file: {e}")

        logger.info("Using fallback EOL data")
        self._eol_data = FALLBACK_EOL_DATA

    def check_runtime(self, language: str, version: str) -> dict[str, Any]:
        """
        Check EOL status of a runtime/language version.

        Args:
            language: Language name (python, node, java, go, etc.)
            version: Version string

        Returns:
            EOL status information
        """
        language = language.lower()
        normalized_version = self._normalize_version(version)

        products = self._eol_data.get("products", {})
        product_data = products.get(language, {})

        # Try exact match first
        if normalized_version in product_data:
            return self._format_eol_status(
                product_data[normalized_version], normalized_version
            )

        # Try major.minor match
        parts = normalized_version.split(".")
        if len(parts) >= 2:
            major_minor = f"{parts[0]}.{parts[1]}"
            if major_minor in product_data:
                return self._format_eol_status(product_data[major_minor], major_minor)

        # Try major version only
        if parts and parts[0] in product_data:
            return self._format_eol_status(product_data[parts[0]], parts[0])

        return {
            "is_eol": None,
            "eol_date": None,
            "support_status": "unknown",
            "checked_version": normalized_version,
        }

    def check_dependency(
        self, _name: str, version: str, _ecosystem: str
    ) -> dict[str, Any]:
        """
        Check EOL status of a dependency.

        This is a placeholder for dependency-specific EOL checking.
        Most dependencies don't have formal EOL dates, so this returns
        unknown status by default.

        Args:
            name: Dependency name
            version: Version string
            ecosystem: Package ecosystem (npm, pypi, etc.)

        Returns:
            EOL status information
        """
        # For now, dependencies don't have EOL data
        # This could be extended to check specific high-profile packages
        return {
            "is_eol": None,
            "eol_date": None,
            "support_status": "unknown",
            "checked_version": version,
        }

    def check_dependencies(
        self, dependencies: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """
        Check EOL status for a list of dependencies.

        Args:
            dependencies: List of dependencies from DependencyExtractor

        Returns:
            List of dependencies with EOL information added
        """
        results = []

        for dep in dependencies:
            name = dep.get("name", "")
            version = dep.get("version", "")
            ecosystem = dep.get("package_manager", "")

            # Skip dependencies without versions
            if not version or version == "*":
                continue

            eol_status = self.check_dependency(name, version, ecosystem)

            # Only include if we found EOL information
            if eol_status.get("support_status") != "unknown":
                results.append(
                    {
                        "name": name,
                        "version": version,
                        "eol_status": eol_status,
                    }
                )

        return results

    def _normalize_version(self, version: str) -> str:
        """Normalize version string for matching."""
        # Remove common prefixes
        version = version.lstrip("^~>=<v")

        # Remove pre-release suffixes for matching
        for sep in ["-", "+", "a", "b", "rc"]:
            if sep in version:
                version = version.split(sep)[0]

        return version.strip()

    def _format_eol_status(
        self, status_data: dict[str, Any], matched_version: str
    ) -> dict[str, Any]:
        """Format EOL status for output."""
        eol_date_str = status_data.get("eol")
        eol_date = None
        is_eol = None

        if eol_date_str:
            try:
                eol_date = datetime.strptime(eol_date_str, "%Y-%m-%d").date()
                is_eol = eol_date < date.today()
            except ValueError:
                pass

        return {
            "is_eol": is_eol,
            "eol_date": eol_date_str,
            "support_status": status_data.get("support_status", "unknown"),
            "checked_version": matched_version,
        }

    @property
    def data_version(self) -> str:
        """Get the version of the loaded EOL data."""
        return self._eol_data.get("version", "unknown")
