"""Pytest configuration and fixtures for processor tests."""

import sys
from pathlib import Path

import pytest

# Add src directory to path for imports
src_path = Path(__file__).parent.parent
sys.path.insert(0, str(src_path))


@pytest.fixture
def sample_server_event():
    """Sample server discovery event data."""
    return {
        "_event_metadata": {
            "id": "test-event-001",
            "type": "discovery.server.discovered",
            "source": "/collectors/network-scanner",
            "time": "2026-01-15T10:00:00Z",
        },
        "hostname": "prod-app-01.example.com",
        "ip_address": "10.0.1.50",
        "os": {"name": "Ubuntu 22.04 LTS", "version": "22.04"},
        "ports": [80, 443, 8080],
    }


@pytest.fixture
def sample_database_event():
    """Sample database discovery event data."""
    return {
        "_event_metadata": {
            "id": "test-event-002",
            "type": "discovery.database.discovered",
            "source": "/collectors/db-inspector",
            "time": "2026-01-15T10:00:00Z",
        },
        "hostname": "db-prod-01.example.com",
        "database_type": "postgresql",
        "connection_string": "postgres://admin:pass@db-prod-01:5432/app_db",
        "tables": [
            {"name": "users", "row_count": 10000},
            {"name": "orders", "row_count": 50000},
        ],
    }


@pytest.fixture
def sample_repository_event():
    """Sample repository discovery event data."""
    return {
        "_event_metadata": {
            "id": "test-event-003",
            "type": "discovery.repository.discovered",
            "source": "/collectors/code-analyzer",
            "time": "2026-01-15T10:00:00Z",
        },
        "repository_url": "https://github.com/example/webapp",
        "language": "Python",
        "dependencies": [
            "django>=4.0",
            "celery>=5.0",
            "redis>=4.0",
            "psycopg2>=2.9",
        ],
        "loc": 15000,
    }
