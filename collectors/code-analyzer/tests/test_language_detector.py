"""Tests for language detection."""

from src.analyzers.language_detector import LanguageDetector


class TestLanguageDetector:
    """Tests for LanguageDetector."""

    def test_detect_python(self, temp_repo):
        """Should detect Python files."""
        detector = LanguageDetector()
        result = detector.detect(temp_repo)

        assert "Python" in result["languages"]
        assert result["languages"]["Python"]["files"] >= 2

    def test_detect_javascript(self, temp_repo):
        """Should detect JavaScript files."""
        detector = LanguageDetector()
        result = detector.detect(temp_repo)

        assert "JavaScript" in result["languages"]

    def test_detect_json(self, temp_repo):
        """Should detect JSON files."""
        detector = LanguageDetector()
        result = detector.detect(temp_repo)

        assert "JSON" in result["languages"]

    def test_excluded_directories(self, temp_repo):
        """Should respect excluded directories."""
        # Create node_modules (should be excluded)
        node_modules = temp_repo / "node_modules"
        node_modules.mkdir()
        (node_modules / "package.json").write_text("{}")

        detector = LanguageDetector(excluded_dirs=["node_modules"])
        result = detector.detect(temp_repo)

        # The node_modules/package.json should not be counted
        # Only frontend/package.json should be counted
        json_files = result["languages"].get("JSON", {}).get("files", 0)
        assert json_files == 1

    def test_total_counts(self, temp_repo):
        """Should calculate totals correctly."""
        detector = LanguageDetector()
        result = detector.detect(temp_repo)

        assert result["total_files"] > 0
        assert result["total_lines"] > 0
        assert result["total_bytes"] > 0

    def test_percentage_calculation(self, temp_repo):
        """Should calculate percentages correctly."""
        detector = LanguageDetector()
        result = detector.detect(temp_repo)

        total_percentage = sum(
            lang["percentage"] for lang in result["languages"].values()
        )
        # Allow small floating point errors
        assert 99.9 <= total_percentage <= 100.1
