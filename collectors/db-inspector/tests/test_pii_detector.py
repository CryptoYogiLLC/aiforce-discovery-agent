"""Tests for PII detection."""

import pytest

from src.analyzers.pii_detector import PIIDetector


@pytest.fixture
def detector():
    """Create a PIIDetector instance."""
    return PIIDetector()


class TestColumnNameDetection:
    """Tests for column name-based PII detection."""

    def test_detects_email_column(self, detector):
        """Should detect email columns."""
        findings = detector.detect_by_column_name("email")
        assert len(findings) == 1
        assert findings[0][0] == "email"
        assert findings[0][1] >= 0.9

    def test_detects_email_with_prefix(self, detector):
        """Should detect email columns with prefix."""
        findings = detector.detect_by_column_name("user_email")
        assert len(findings) == 1
        assert findings[0][0] == "email"

    def test_detects_phone_column(self, detector):
        """Should detect phone columns."""
        findings = detector.detect_by_column_name("phone_number")
        assert len(findings) == 1
        assert findings[0][0] == "phone"

    def test_detects_ssn_column(self, detector):
        """Should detect SSN columns."""
        findings = detector.detect_by_column_name("ssn")
        assert len(findings) == 1
        assert findings[0][0] == "ssn"

    def test_detects_credit_card_column(self, detector):
        """Should detect credit card columns."""
        findings = detector.detect_by_column_name("credit_card_number")
        assert len(findings) == 1
        assert findings[0][0] == "credit_card"

    def test_detects_name_columns(self, detector):
        """Should detect name columns."""
        for col in ["first_name", "last_name", "full_name"]:
            findings = detector.detect_by_column_name(col)
            assert len(findings) == 1
            assert findings[0][0] == "name"

    def test_detects_dob_column(self, detector):
        """Should detect date of birth columns."""
        findings = detector.detect_by_column_name("date_of_birth")
        assert len(findings) == 1
        assert findings[0][0] == "dob"

    def test_no_detection_for_safe_columns(self, detector):
        """Should not flag non-PII columns."""
        for col in ["id", "created_at", "status", "description", "amount"]:
            findings = detector.detect_by_column_name(col)
            assert len(findings) == 0


class TestDataPatternDetection:
    """Tests for data pattern-based PII detection."""

    def test_detects_email_pattern(self, detector):
        """Should detect email addresses in data."""
        values = [
            "john@example.com",
            "jane.doe@company.org",
            "user123@mail.co.uk",
        ]
        findings = detector.detect_by_data(values)
        assert len(findings) == 1
        assert findings[0][0] == "email"
        assert findings[0][1] >= 0.9

    def test_detects_phone_pattern(self, detector):
        """Should detect phone numbers in data."""
        values = [
            "+1-555-123-4567",
            "(555) 987-6543",
            "555.123.4567",
        ]
        findings = detector.detect_by_data(values)
        assert len(findings) == 1
        assert findings[0][0] == "phone"

    def test_detects_ssn_pattern(self, detector):
        """Should detect SSN patterns in data."""
        values = [
            "123-45-6789",
            "987-65-4321",
            "111-22-3333",
        ]
        findings = detector.detect_by_data(values)
        assert len(findings) == 1
        assert findings[0][0] == "ssn"

    def test_detects_ip_address_pattern(self, detector):
        """Should detect IP addresses in data."""
        values = [
            "192.168.1.1",
            "10.0.0.1",
            "172.16.0.100",
        ]
        findings = detector.detect_by_data(values)
        assert len(findings) == 1
        assert findings[0][0] == "ip_address"

    def test_no_detection_for_random_data(self, detector):
        """Should not flag random non-PII data."""
        values = [
            "apple",
            "banana",
            "cherry",
        ]
        findings = detector.detect_by_data(values)
        assert len(findings) == 0

    def test_empty_values(self, detector):
        """Should handle empty values list."""
        findings = detector.detect_by_data([])
        assert len(findings) == 0

    def test_low_confidence_with_mixed_data(self, detector):
        """Should have lower confidence with mixed data."""
        values = [
            "john@example.com",
            "not an email",
            "random text",
            "another string",
        ]
        findings = detector.detect_by_data(values)
        # Should still detect but with lower confidence
        email_findings = [f for f in findings if f[0] == "email"]
        if email_findings:
            assert email_findings[0][1] < 0.9


class TestPIITypes:
    """Tests for PII type enumeration."""

    def test_get_pii_types(self, detector):
        """Should return all supported PII types."""
        types = detector.get_pii_types()
        assert "email" in types
        assert "phone" in types
        assert "ssn" in types
        assert "credit_card" in types
        assert "address" in types
        assert "name" in types
        assert "dob" in types
