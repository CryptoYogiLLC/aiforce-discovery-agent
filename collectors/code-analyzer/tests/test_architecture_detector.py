"""Tests for architecture detector."""

import tempfile
from pathlib import Path

import pytest

from src.analyzers.architecture_detector import ArchitectureDetector


@pytest.fixture
def detector():
    """Create architecture detector instance."""
    return ArchitectureDetector()


@pytest.fixture
def temp_repo():
    """Create a temporary repository directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


class TestArchitectureDetector:
    """Test cases for ArchitectureDetector."""

    def test_detect_microservice(self, detector, temp_repo):
        """Test detection of microservice architecture."""
        # Create multiple Dockerfiles and docker-compose
        (temp_repo / "service-a").mkdir()
        (temp_repo / "service-a" / "Dockerfile").write_text("FROM python:3.11")
        (temp_repo / "service-b").mkdir()
        (temp_repo / "service-b" / "Dockerfile").write_text("FROM node:18")
        (temp_repo / "docker-compose.yml").write_text("""
services:
  service-a:
    build: ./service-a
  service-b:
    build: ./service-b
  rabbitmq:
    image: rabbitmq
""")

        result = detector.detect(temp_repo)

        assert result["architecture_pattern"] == "microservice"
        assert result["confidence"] > 0.5

    def test_detect_serverless(self, detector, temp_repo):
        """Test detection of serverless architecture."""
        # Create serverless.yml
        (temp_repo / "serverless.yml").write_text("""
provider:
  name: aws
  runtime: nodejs18.x
functions:
  hello:
    handler: handler.hello
""")
        (temp_repo / "handler.js").write_text("exports.hello = () => {}")

        dependencies = [{"name": "serverless"}]

        result = detector.detect(temp_repo, dependencies=dependencies)

        assert result["architecture_pattern"] == "serverless"
        assert result["confidence"] > 0.5

    def test_detect_event_driven(self, detector, temp_repo):
        """Test detection of event-driven architecture."""
        # Create event-driven patterns
        (temp_repo / "events").mkdir()
        (temp_repo / "main.py").write_text("""
from event_bus import publish
def handle_order(event):
    publish('order.created', event)
""")

        dependencies = [{"name": "pika"}, {"name": "aio-pika"}]

        result = detector.detect(temp_repo, dependencies=dependencies)

        assert result["architecture_pattern"] == "event_driven"
        assert result["confidence"] > 0

    def test_detect_layered(self, detector, temp_repo):
        """Test detection of layered architecture."""
        # Create layered directory structure
        (temp_repo / "src").mkdir()
        (temp_repo / "src" / "views").mkdir()
        (temp_repo / "src" / "services").mkdir()
        (temp_repo / "src" / "models").mkdir()
        (temp_repo / "src" / "repositories").mkdir()

        result = detector.detect(temp_repo)

        assert result["architecture_pattern"] == "layered"
        assert result["confidence"] > 0

    def test_detect_modular_monolith(self, detector, temp_repo):
        """Test detection of modular monolith."""
        # Create modular structure
        (temp_repo / "modules").mkdir()
        (temp_repo / "modules" / "auth").mkdir()
        (temp_repo / "modules" / "billing").mkdir()
        (temp_repo / "modules" / "users").mkdir()
        (temp_repo / "modules" / "orders").mkdir()

        result = detector.detect(temp_repo)

        assert result["architecture_pattern"] == "modular_monolith"
        assert result["confidence"] > 0

    def test_detect_monorepo_with_lerna(self, detector, temp_repo):
        """Test detection of modular monolith via lerna."""
        # Create lerna monorepo
        (temp_repo / "lerna.json").write_text('{"version": "1.0.0"}')
        (temp_repo / "packages").mkdir()
        (temp_repo / "packages" / "core").mkdir()
        (temp_repo / "packages" / "ui").mkdir()
        (temp_repo / "packages" / "api").mkdir()

        result = detector.detect(temp_repo)

        assert result["architecture_pattern"] == "modular_monolith"
        assert result["confidence"] > 0

    def test_detect_unknown_empty_repo(self, detector, temp_repo):
        """Test classification of empty repo returns unknown."""
        result = detector.detect(temp_repo)

        assert result["architecture_pattern"] == "unknown"
        assert result["confidence"] == 0.0

    def test_all_scores_included(self, detector, temp_repo):
        """Test that all scores are returned."""
        (temp_repo / "docker-compose.yml").write_text("services:\n  app:\n    build: .")

        result = detector.detect(temp_repo)

        assert "all_scores" in result
