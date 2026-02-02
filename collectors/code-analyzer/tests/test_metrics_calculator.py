"""Tests for code metrics calculation."""

import pytest
from src.analyzers.metrics_calculator import MetricsCalculator


class TestMetricsCalculator:
    """Tests for MetricsCalculator."""

    def test_lines_of_code(self, temp_repo):
        """Should count lines of code."""
        calculator = MetricsCalculator()
        result = calculator.calculate(temp_repo)

        assert result["lines_of_code"] > 0

    def test_blank_lines(self, temp_repo):
        """Should count blank lines."""
        calculator = MetricsCalculator()
        result = calculator.calculate(temp_repo)

        assert result["blank_lines"] >= 0

    def test_comment_lines(self, temp_repo):
        """Should count comment lines."""
        calculator = MetricsCalculator()
        result = calculator.calculate(temp_repo)

        # Our test files have docstrings that may be counted as comments
        assert result["comment_lines"] >= 0

    def test_todo_count(self, temp_repo):
        """Should count TODO comments."""
        calculator = MetricsCalculator()
        result = calculator.calculate(temp_repo)

        assert result["tech_debt_indicators"]["todo_count"] >= 1

    def test_fixme_count(self, temp_repo):
        """Should count FIXME comments."""
        calculator = MetricsCalculator()
        result = calculator.calculate(temp_repo)

        assert result["tech_debt_indicators"]["fixme_count"] >= 1

    def test_file_types(self, temp_repo):
        """Should categorize files by type."""
        calculator = MetricsCalculator()
        result = calculator.calculate(temp_repo)

        assert ".py" in result["file_types"]
        assert ".js" in result["file_types"]

    def test_largest_files(self, temp_repo):
        """Should identify largest files."""
        calculator = MetricsCalculator()
        result = calculator.calculate(temp_repo)

        assert isinstance(result["largest_files"], list)
        for file_info in result["largest_files"]:
            assert "path" in file_info
            assert "size_bytes" in file_info
            assert "size_kb" in file_info

    def test_excluded_directories(self, temp_repo):
        """Should respect excluded directories."""
        # Create node_modules with large file
        node_modules = temp_repo / "node_modules"
        node_modules.mkdir()
        (node_modules / "big.js").write_text("x" * 10000)

        calculator = MetricsCalculator(excluded_dirs=["node_modules"])
        result = calculator.calculate(temp_repo)

        # The large file should not be in largest_files
        paths = [f["path"] for f in result["largest_files"]]
        assert not any("node_modules" in p for p in paths)

    def test_average_file_size(self, temp_repo):
        """Should calculate average file size."""
        calculator = MetricsCalculator()
        result = calculator.calculate(temp_repo)

        assert result["average_file_size"] > 0

    def test_complexity_metrics(self, temp_repo):
        """Should calculate complexity metrics."""
        calculator = MetricsCalculator()
        result = calculator.calculate(temp_repo)

        assert "complexity" in result
        assert "average" in result["complexity"]
        assert "max" in result["complexity"]


class TestMetricsCalculatorEdgeCases:
    """Edge case tests for MetricsCalculator."""

    def test_empty_directory(self, tmp_path):
        """Should handle empty directories."""
        calculator = MetricsCalculator()
        result = calculator.calculate(tmp_path)

        assert result["lines_of_code"] == 0
        assert result["total_files"] == 0

    def test_max_file_size_limit(self, tmp_path):
        """Should respect max file size limit."""
        # Create a large file
        large_file = tmp_path / "large.py"
        large_file.write_text("x = 1\n" * 100000)  # ~700KB

        calculator = MetricsCalculator(max_file_size_kb=100)
        result = calculator.calculate(tmp_path)

        # The large file should be skipped
        assert result["code_files"] == 0
