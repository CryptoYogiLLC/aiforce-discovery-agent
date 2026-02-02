"""Tests for Code Analyzer API endpoints."""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch


@pytest.fixture
def client():
    """Create test client."""
    # Mock RabbitMQ connection for testing
    with patch("src.main.get_rabbitmq_connection", new_callable=AsyncMock):
        from src.main import app
        return TestClient(app)


class TestHealthEndpoints:
    """Tests for health check endpoints."""

    def test_health_endpoint(self, client):
        """Should return healthy status."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

    def test_ready_endpoint_without_rabbitmq(self):
        """Should return 503 when RabbitMQ is not available."""
        with patch("src.main.get_rabbitmq_connection") as mock_conn:
            mock_conn.side_effect = Exception("Connection failed")
            from src.main import app
            client = TestClient(app)
            response = client.get("/ready")
            assert response.status_code == 503


class TestStatsEndpoint:
    """Tests for stats endpoint."""

    def test_stats_endpoint(self, client):
        """Should return service stats."""
        response = client.get("/api/v1/stats")
        assert response.status_code == 200

        data = response.json()
        assert data["service"] == "code-analyzer"
        assert "config" in data
        assert "max_repo_size_mb" in data["config"]


class TestMetricsEndpoint:
    """Tests for Prometheus metrics endpoint."""

    def test_metrics_endpoint(self, client):
        """Should return Prometheus metrics."""
        response = client.get("/metrics")
        assert response.status_code == 200
        assert "text/plain" in response.headers.get("content-type", "")
