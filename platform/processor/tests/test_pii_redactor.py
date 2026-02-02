"""Tests for the PII redactor module."""

import pytest
from src.modules.pii_redactor import PIIRedactorModule


@pytest.fixture
def redactor():
    """Create a PII redactor instance with default settings."""
    return PIIRedactorModule(
        redact_emails=True,
        redact_ips=True,
        redact_hostnames=False,
        redact_usernames=True,
    )


@pytest.mark.asyncio
async def test_redact_email(redactor):
    """Test email redaction."""
    data = {
        "admin_email": "admin@example.com",
        "contact": "support@company.org",
    }

    result = await redactor.process(data)

    assert "[REDACTED_EMAIL]" in result["admin_email"]
    assert "[REDACTED_EMAIL]" in result["contact"]
    assert "admin@example.com" not in result["admin_email"]


@pytest.mark.asyncio
async def test_redact_ip_address(redactor):
    """Test IP address redaction."""
    data = {
        "server_ip": "192.168.1.100",
        "gateway": "10.0.0.1",
    }

    result = await redactor.process(data)

    assert "[REDACTED_IP]" in result["server_ip"]
    assert "[REDACTED_IP]" in result["gateway"]


@pytest.mark.asyncio
async def test_redact_ssn(redactor):
    """Test SSN redaction (always redacted)."""
    data = {
        "employee_id": "123-45-6789",
    }

    result = await redactor.process(data)

    assert "[REDACTED_SSN]" in result["employee_id"]
    assert "123-45-6789" not in result["employee_id"]


@pytest.mark.asyncio
async def test_redact_credit_card(redactor):
    """Test credit card redaction (always redacted)."""
    data = {
        "payment_card": "4111111111111111",
    }

    result = await redactor.process(data)

    assert "[REDACTED_CC]" in result["payment_card"]


@pytest.mark.asyncio
async def test_redact_nested_data(redactor):
    """Test redaction in nested dictionaries."""
    data = {
        "server": {
            "admin": {
                "email": "admin@test.com",
                "ip": "192.168.1.1",
            }
        }
    }

    result = await redactor.process(data)

    assert "[REDACTED_EMAIL]" in result["server"]["admin"]["email"]
    assert "[REDACTED_IP]" in result["server"]["admin"]["ip"]


@pytest.mark.asyncio
async def test_redact_list_data(redactor):
    """Test redaction in lists."""
    data = {
        "emails": ["user1@test.com", "user2@test.com"],
        "ips": ["10.0.0.1", "10.0.0.2"],
    }

    result = await redactor.process(data)

    for email in result["emails"]:
        assert "[REDACTED_EMAIL]" in email
    for ip in result["ips"]:
        assert "[REDACTED_IP]" in ip


@pytest.mark.asyncio
async def test_redaction_metadata_added(redactor):
    """Test that redaction metadata is added."""
    data = {"field": "value"}

    result = await redactor.process(data)

    assert "redaction" in result
    assert result["redaction"]["applied"] is True
    assert result["redaction"]["version"] == "1.0.0"


def test_detect_pii(redactor):
    """Test PII detection without redaction."""
    text = "Contact admin@test.com at 192.168.1.1"

    findings = redactor.detect_pii(text)

    types_found = [f["type"] for f in findings]
    assert "email" in types_found
    assert "ip_address" in types_found


@pytest.mark.asyncio
async def test_preserve_non_pii_data(redactor):
    """Test that non-PII data is preserved."""
    data = {
        "hostname": "server-01",
        "port": 8080,
        "active": True,
        "count": 42,
    }

    result = await redactor.process(data)

    assert result["hostname"] == "server-01"
    assert result["port"] == 8080
    assert result["active"] is True
    assert result["count"] == 42


@pytest.mark.asyncio
async def test_disabled_email_redaction():
    """Test with email redaction disabled."""
    redactor = PIIRedactorModule(
        redact_emails=False,
        redact_ips=True,
        redact_hostnames=False,
        redact_usernames=True,
    )

    data = {"email": "test@example.com", "ip": "10.0.0.1"}

    result = await redactor.process(data)

    # Email should be preserved
    assert result["email"] == "test@example.com"
    # IP should still be redacted
    assert "[REDACTED_IP]" in result["ip"]
