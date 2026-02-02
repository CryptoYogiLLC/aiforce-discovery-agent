"""Tests for the enrichment module."""

import pytest
from src.modules.enrichment import EnrichmentModule


@pytest.fixture
def enrichment():
    """Create an enrichment module instance."""
    return EnrichmentModule()


@pytest.mark.asyncio
async def test_enrich_server_data(enrichment):
    """Test enrichment of server discovery data."""
    data = {
        "hostname": "prod-web-01.example.com",
        "ip_address": "10.0.1.10",
        "os": {"name": "Ubuntu 22.04"},
    }

    result = await enrichment.process(data)

    assert "enrichment" in result
    assert result["enrichment"]["applied"] is True
    assert result["enrichment"]["environment"] == "production"
    assert result["enrichment"]["os_family"] == "linux"


@pytest.mark.asyncio
async def test_enrich_service_data(enrichment):
    """Test enrichment of service discovery data."""
    data = {
        "hostname": "db-staging-01.example.com",
        "port": 5432,
    }

    result = await enrichment.process(data)

    assert result["enrichment"]["technology"] == "PostgreSQL"
    assert result["enrichment"]["category"] == "database"
    assert result["enrichment"]["environment"] == "staging"


@pytest.mark.asyncio
async def test_enrich_database_data(enrichment):
    """Test enrichment of database discovery data."""
    data = {
        "connection_string": "postgres://db-prod.example.com:5432/mydb",
        "database_type": "postgresql",
    }

    result = await enrichment.process(data)

    assert result["enrichment"]["db_category"] == "relational"
    assert result["enrichment"]["environment"] == "production"


@pytest.mark.asyncio
async def test_enrich_repository_data(enrichment):
    """Test enrichment of repository discovery data."""
    data = {
        "repository_url": "https://github.com/example/app",
        "language": "Python",
        "dependencies": ["django", "celery", "redis"],
    }

    result = await enrichment.process(data)

    assert result["enrichment"]["language_category"] == "backend"
    assert "Django" in result["enrichment"]["frameworks"]


@pytest.mark.asyncio
async def test_detect_environment_patterns(enrichment):
    """Test environment detection from various patterns."""
    assert enrichment._detect_environment("app-prod-01") == "production"
    assert enrichment._detect_environment("app-staging-01") == "staging"
    assert enrichment._detect_environment("app-dev-01") == "development"
    assert enrichment._detect_environment("app-unknown-01") == "unknown"


@pytest.mark.asyncio
async def test_classify_os(enrichment):
    """Test OS classification."""
    assert enrichment._classify_os({"name": "Windows Server 2019"}) == "windows"
    assert enrichment._classify_os({"name": "Ubuntu 22.04"}) == "linux"
    assert enrichment._classify_os({"name": "CentOS 7"}) == "linux"
    assert enrichment._classify_os({"name": "macOS Ventura"}) == "macos"
    assert enrichment._classify_os({"name": "FreeBSD"}) == "unknown"
