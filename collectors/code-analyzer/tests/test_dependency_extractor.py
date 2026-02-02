"""Tests for dependency extraction."""

from src.analyzers.dependency_extractor import DependencyExtractor


class TestDependencyExtractor:
    """Tests for DependencyExtractor."""

    def test_extract_npm_dependencies(self, temp_repo):
        """Should extract npm dependencies from package.json."""
        extractor = DependencyExtractor()
        result = extractor.extract(temp_repo)

        npm_deps = [d for d in result if d["package_manager"] == "npm"]
        names = [d["name"] for d in npm_deps]

        assert "react" in names
        assert "react-dom" in names
        assert "typescript" in names

    def test_extract_pip_dependencies(self, temp_repo):
        """Should extract pip dependencies from requirements.txt."""
        extractor = DependencyExtractor()
        result = extractor.extract(temp_repo)

        pip_deps = [d for d in result if d["package_manager"] == "pip"]
        names = [d["name"] for d in pip_deps]

        assert "fastapi" in names
        assert "uvicorn" in names
        assert "pydantic" in names

    def test_extract_go_dependencies(self, temp_go_repo):
        """Should extract Go dependencies from go.mod."""
        extractor = DependencyExtractor()
        result = extractor.extract(temp_go_repo)

        go_deps = [d for d in result if d["package_manager"] == "go"]
        names = [d["name"] for d in go_deps]

        assert "github.com/gin-gonic/gin" in names

    def test_dev_dependency_flag(self, temp_repo):
        """Should flag dev dependencies correctly."""
        extractor = DependencyExtractor()
        result = extractor.extract(temp_repo)

        # typescript is a devDependency in package.json
        typescript = next((d for d in result if d["name"] == "typescript"), None)
        assert typescript is not None
        assert typescript["dev_dependency"] is True

        # react is not a devDependency
        react = next((d for d in result if d["name"] == "react"), None)
        assert react is not None
        assert react["dev_dependency"] is False

    def test_version_extraction(self, temp_repo):
        """Should extract version information."""
        extractor = DependencyExtractor()
        result = extractor.extract(temp_repo)

        react = next((d for d in result if d["name"] == "react"), None)
        assert react is not None
        assert react["version"] == "^18.2.0"

    def test_source_file_tracking(self, temp_repo):
        """Should track source file for each dependency."""
        extractor = DependencyExtractor()
        result = extractor.extract(temp_repo)

        for dep in result:
            assert "source_file" in dep
            assert dep["source_file"] != ""

    def test_language_tracking(self, temp_repo):
        """Should track language for each dependency."""
        extractor = DependencyExtractor()
        result = extractor.extract(temp_repo)

        for dep in result:
            assert "language" in dep
            assert dep["language"] in [
                "JavaScript",
                "Python",
                "Go",
                "Java",
                "Ruby",
                "Rust",
                "PHP",
            ]
