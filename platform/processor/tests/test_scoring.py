"""Tests for the scoring module."""

import pytest
from src.modules.scoring import ScoringModule


@pytest.fixture
def scoring():
    """Create a scoring module instance."""
    return ScoringModule()


@pytest.mark.asyncio
async def test_score_basic_data(scoring):
    """Test scoring with basic data."""
    data = {
        "enrichment": {
            "technology": "PostgreSQL",
            "category": "database",
            "environment": "production",
        }
    }

    result = await scoring.process(data)

    assert "scoring" in result
    assert "complexity_score" in result["scoring"]
    assert "risk_score" in result["scoring"]
    assert "effort_score" in result["scoring"]
    assert "overall_score" in result["scoring"]
    assert 1 <= result["scoring"]["complexity_score"] <= 10
    assert 1 <= result["scoring"]["risk_score"] <= 10


@pytest.mark.asyncio
async def test_production_increases_risk(scoring):
    """Test that production environment increases risk score."""
    prod_data = {
        "enrichment": {
            "environment": "production",
            "category": "web",
        }
    }

    dev_data = {
        "enrichment": {
            "environment": "development",
            "category": "web",
        }
    }

    prod_result = await scoring.process(prod_data)
    dev_result = await scoring.process(dev_data)

    assert prod_result["scoring"]["risk_score"] > dev_result["scoring"]["risk_score"]


@pytest.mark.asyncio
async def test_database_high_risk(scoring):
    """Test that database category has higher risk."""
    db_data = {
        "enrichment": {
            "category": "database",
            "db_category": "relational",
            "environment": "staging",
        }
    }

    web_data = {
        "enrichment": {
            "category": "web",
            "environment": "staging",
        }
    }

    db_result = await scoring.process(db_data)
    web_result = await scoring.process(web_data)

    assert db_result["scoring"]["risk_score"] >= web_result["scoring"]["risk_score"]


@pytest.mark.asyncio
async def test_legacy_tech_high_effort(scoring):
    """Test that legacy technologies increase effort score."""
    legacy_data = {
        "enrichment": {
            "technology": "Oracle",
            "environment": "production",
        }
    }

    modern_data = {
        "enrichment": {
            "technology": "PostgreSQL",
            "environment": "production",
        }
    }

    legacy_result = await scoring.process(legacy_data)
    modern_result = await scoring.process(modern_data)

    assert legacy_result["scoring"]["effort_score"] >= modern_result["scoring"]["effort_score"]


@pytest.mark.asyncio
async def test_many_dependencies_increase_complexity(scoring):
    """Test that many dependencies increase complexity."""
    many_deps = {
        "enrichment": {"environment": "staging"},
        "dependencies": ["dep" + str(i) for i in range(60)],
    }

    few_deps = {
        "enrichment": {"environment": "staging"},
        "dependencies": ["dep1", "dep2", "dep3"],
    }

    many_result = await scoring.process(many_deps)
    few_result = await scoring.process(few_deps)

    assert many_result["scoring"]["complexity_score"] > few_result["scoring"]["complexity_score"]


@pytest.mark.asyncio
async def test_pii_presence_increases_risk(scoring):
    """Test that PII presence (indicated by redaction) increases risk."""
    with_pii = {
        "enrichment": {"environment": "staging"},
        "redaction": {"applied": True},
    }

    without_pii = {
        "enrichment": {"environment": "staging"},
    }

    pii_result = await scoring.process(with_pii)
    no_pii_result = await scoring.process(without_pii)

    assert pii_result["scoring"]["risk_score"] >= no_pii_result["scoring"]["risk_score"]


@pytest.mark.asyncio
async def test_scoring_factors_populated(scoring):
    """Test that scoring factors are populated."""
    data = {
        "enrichment": {
            "technology": "Redis",
            "environment": "production",
            "frameworks": ["Spring Framework", "React"],
        },
        "dependencies": ["dep" + str(i) for i in range(25)],
        "redaction": {"applied": True},
    }

    result = await scoring.process(data)

    factors = result["scoring"]["factors"]
    assert len(factors) > 0
    assert any("Production" in f for f in factors)
    assert any("Technology" in f for f in factors)


@pytest.mark.asyncio
async def test_overall_score_weighted(scoring):
    """Test that overall score is a weighted combination."""
    data = {
        "enrichment": {
            "technology": "PostgreSQL",
            "environment": "production",
            "db_category": "relational",
        }
    }

    result = await scoring.process(data)

    # Overall should be between min and max of individual scores
    scores = result["scoring"]
    individual = [scores["complexity_score"], scores["risk_score"], scores["effort_score"]]

    assert min(individual) <= scores["overall_score"] <= max(individual)


@pytest.mark.asyncio
async def test_score_bounds(scoring):
    """Test that all scores are within bounds (1-10)."""
    data = {
        "enrichment": {
            "technology": "Kafka",
            "environment": "production",
            "db_category": "relational",
            "frameworks": ["Spring Framework", "React", "Angular"],
        },
        "dependencies": ["dep" + str(i) for i in range(100)],
        "redaction": {"applied": True},
    }

    result = await scoring.process(data)

    assert 1 <= result["scoring"]["complexity_score"] <= 10
    assert 1 <= result["scoring"]["risk_score"] <= 10
    assert 1 <= result["scoring"]["effort_score"] <= 10
    assert 1 <= result["scoring"]["overall_score"] <= 10
