"""Tests for EOL checker."""

import pytest

from src.analyzers.eol_checker import EOLChecker


@pytest.fixture
def checker():
    """Create EOL checker instance with fallback data."""
    return EOLChecker()


class TestEOLChecker:
    """Test cases for EOLChecker."""

    def test_check_python_eol(self, checker):
        """Test checking Python EOL status."""
        # Python 2.7 should be EOL
        result = checker.check_runtime("python", "2.7")
        assert result["is_eol"] is True
        assert result["support_status"] == "eol"

    def test_check_python_active(self, checker):
        """Test checking active Python version."""
        # Python 3.12 should be active
        result = checker.check_runtime("python", "3.12")
        assert result["is_eol"] is False
        assert result["support_status"] == "active"

    def test_check_node_eol(self, checker):
        """Test checking Node.js EOL status."""
        # Node 14 should be EOL
        result = checker.check_runtime("node", "14")
        assert result["is_eol"] is True
        assert result["support_status"] == "eol"

    def test_check_node_active(self, checker):
        """Test checking active Node.js version."""
        # Node 20 should be active
        result = checker.check_runtime("node", "20")
        assert result["is_eol"] is False
        assert result["support_status"] == "active"

    def test_check_unknown_runtime(self, checker):
        """Test checking unknown runtime."""
        result = checker.check_runtime("unknown_runtime", "1.0")
        assert result["is_eol"] is None
        assert result["support_status"] == "unknown"

    def test_check_unknown_version(self, checker):
        """Test checking unknown version of known runtime."""
        result = checker.check_runtime("python", "99.99")
        assert result["is_eol"] is None
        assert result["support_status"] == "unknown"

    def test_version_normalization(self, checker):
        """Test version string normalization."""
        # Should match despite version prefix
        result = checker.check_runtime("python", "^3.11")
        assert result["support_status"] in ["active", "security_only"]

        # Should match with v prefix
        result = checker.check_runtime("node", "v20")
        assert result["support_status"] == "active"

    def test_major_minor_matching(self, checker):
        """Test that major.minor versions match."""
        # 3.11.5 should match 3.11 data
        result = checker.check_runtime("python", "3.11.5")
        assert result["support_status"] == "active"
        assert result["checked_version"] == "3.11"

    def test_check_java_lts(self, checker):
        """Test Java LTS versions."""
        # Java 17 should be active
        result = checker.check_runtime("java", "17")
        assert result["is_eol"] is False
        assert result["support_status"] == "active"

    def test_check_go_version(self, checker):
        """Test Go version checking."""
        # Go 1.22 should be active
        result = checker.check_runtime("go", "1.22")
        assert result["support_status"] == "active"

    def test_data_version(self, checker):
        """Test data version is available."""
        version = checker.data_version
        assert version is not None
        assert version != "unknown"

    def test_check_dependencies_filters_unknown(self, checker):
        """Test that unknown dependencies are filtered out."""
        deps = [
            {"name": "some-package", "version": "1.0.0", "package_manager": "npm"},
            {"name": "another-package", "version": "*", "package_manager": "pip"},
        ]

        result = checker.check_dependencies(deps)

        # Should return empty since dependencies don't have EOL data
        assert result == []
