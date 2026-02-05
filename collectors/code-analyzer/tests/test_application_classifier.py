"""Tests for application classifier."""

import tempfile
from pathlib import Path

import pytest

from src.analyzers.application_classifier import ApplicationClassifier


@pytest.fixture
def classifier():
    """Create application classifier instance."""
    return ApplicationClassifier()


@pytest.fixture
def temp_repo():
    """Create a temporary repository directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


class TestApplicationClassifier:
    """Test cases for ApplicationClassifier."""

    def test_classify_web_application(self, classifier, temp_repo):
        """Test detection of web application."""
        # Create React-like structure
        (temp_repo / "src").mkdir()
        (temp_repo / "public").mkdir()
        (temp_repo / "public" / "index.html").write_text("<html></html>")
        (temp_repo / "package.json").write_text(
            '{"dependencies": {"react-dom": "^18.0.0"}}'
        )

        frameworks = [{"name": "React"}]
        dependencies = [{"name": "react-dom"}]

        result = classifier.classify(temp_repo, frameworks, dependencies)

        assert result["application_type"] == "web_application"
        assert result["confidence"] > 0.5

    def test_classify_api_service(self, classifier, temp_repo):
        """Test detection of API service."""
        # Create FastAPI-like structure
        (temp_repo / "routes").mkdir()
        (temp_repo / "main.py").write_text(
            "from fastapi import FastAPI\napp = FastAPI()"
        )
        (temp_repo / "requirements.txt").write_text("fastapi>=0.100.0")

        frameworks = [{"name": "FastAPI"}]
        dependencies = [{"name": "fastapi"}]

        result = classifier.classify(temp_repo, frameworks, dependencies)

        assert result["application_type"] == "api_service"
        assert result["confidence"] > 0.5

    def test_classify_cli_tool(self, classifier, temp_repo):
        """Test detection of CLI tool."""
        # Create CLI-like structure
        (temp_repo / "cmd").mkdir()
        (temp_repo / "main.py").write_text(
            "import click\n@click.command()\ndef main(): pass"
        )

        frameworks = []
        dependencies = [{"name": "click"}]

        result = classifier.classify(temp_repo, frameworks, dependencies)

        assert result["application_type"] == "cli_tool"
        assert result["confidence"] > 0

    def test_classify_batch_job(self, classifier, temp_repo):
        """Test detection of batch job."""
        # Create batch-like structure
        (temp_repo / "jobs").mkdir()
        (temp_repo / "main.py").write_text(
            "from celery import Celery\n@celery.task\ndef job(): pass"
        )

        frameworks = [{"name": "Celery"}]
        dependencies = [{"name": "celery"}]

        result = classifier.classify(temp_repo, frameworks, dependencies)

        assert result["application_type"] == "batch_job"
        assert result["confidence"] > 0

    def test_classify_mobile_app(self, classifier, temp_repo):
        """Test detection of mobile application."""
        # Create React Native structure
        (temp_repo / "android").mkdir()
        (temp_repo / "ios").mkdir()
        (temp_repo / "app.json").write_text('{"name": "app"}')

        dependencies = [{"name": "react-native"}]

        result = classifier.classify(temp_repo, [], dependencies)

        assert result["application_type"] == "mobile_app"
        assert result["confidence"] > 0.5

    def test_classify_unknown_empty_repo(self, classifier, temp_repo):
        """Test classification of empty repo returns unknown."""
        result = classifier.classify(temp_repo, [], [])

        assert result["application_type"] == "unknown"
        assert result["confidence"] == 0.0

    def test_all_scores_included(self, classifier, temp_repo):
        """Test that all scores are returned for debugging."""
        # Create ambiguous structure
        (temp_repo / "routes").mkdir()
        (temp_repo / "cli").mkdir()

        result = classifier.classify(temp_repo, [], [])

        assert "all_scores" in result
