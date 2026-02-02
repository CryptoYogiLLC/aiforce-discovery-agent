"""Tests for the FastAPI API endpoints."""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from src.main import app


@pytest_asyncio.fixture
async def client():
    """Create an async test client."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health_endpoint(client):
    """Should return healthy status."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "db-inspector"


@pytest.mark.asyncio
async def test_ready_endpoint(client):
    """Should return ready status."""
    response = await client.get("/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["service"] == "db-inspector"
    assert "rabbitmq" in data


@pytest.mark.asyncio
async def test_inspect_invalid_db_type(client):
    """Should reject invalid database type."""
    response = await client.post(
        "/api/v1/inspect",
        json={
            "db_type": "invalid",
            "host": "localhost",
            "port": 5432,
            "user": "test",
            "password": "test",
            "database": "test",
        },
    )
    assert response.status_code == 400
    assert "Unsupported database type" in response.json()["detail"]


@pytest.mark.asyncio
async def test_inspect_missing_fields(client):
    """Should require all connection fields."""
    response = await client.post(
        "/api/v1/inspect",
        json={
            "db_type": "postgres",
            "host": "localhost",
        },
    )
    assert response.status_code == 422  # Validation error
