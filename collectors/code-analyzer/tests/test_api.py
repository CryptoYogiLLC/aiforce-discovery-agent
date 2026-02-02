"""Tests for Code Analyzer API endpoints."""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


@pytest.fixture
def client():
    """Create test client."""
    # Import app after aio_pika is mocked in conftest.py
    from src.main import app, app_state

    # Mock RabbitMQ connection state
    mock_connection = MagicMock()
    mock_connection.is_closed = False
    mock_channel = MagicMock()
    mock_channel.is_closed = False

    app_state["rabbitmq_connection"] = mock_connection
    app_state["rabbitmq_channel"] = mock_channel

    return TestClient(app, raise_server_exceptions=False)


class TestHealthEndpoints:
    """Tests for health check endpoints."""

    def test_health_endpoint(self, client):
        """Should return healthy status."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

    def test_ready_endpoint_without_rabbitmq(self):
        """Should return 503 when RabbitMQ is not available."""
        from src.main import app, app_state

        # Set connection to None to simulate no RabbitMQ
        original_connection = app_state["rabbitmq_connection"]
        app_state["rabbitmq_connection"] = None

        try:
            with patch("src.main.get_rabbitmq_connection") as mock_conn:
                mock_conn.side_effect = Exception("Connection failed")
                test_client = TestClient(app, raise_server_exceptions=False)
                response = test_client.get("/ready")
                assert response.status_code == 503
        finally:
            app_state["rabbitmq_connection"] = original_connection


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
