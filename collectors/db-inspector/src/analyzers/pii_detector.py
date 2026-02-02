"""PII (Personally Identifiable Information) detection in database schemas."""

import re
from typing import List, Tuple


class PIIDetector:
    """Detect PII by column names and data patterns."""

    # Column name patterns that suggest PII
    COLUMN_NAME_PATTERNS: dict[str, List[str]] = {
        "email": [
            r"email",
            r"e_mail",
            r"mail_address",
            r"email_address",
            r"user_email",
            r"contact_email",
        ],
        "phone": [
            r"phone",
            r"tel",
            r"telephone",
            r"mobile",
            r"cell",
            r"fax",
            r"phone_number",
            r"contact_number",
        ],
        "ssn": [
            r"ssn",
            r"social_security",
            r"social_sec",
            r"ss_number",
            r"tax_id",
            r"sin",  # Social Insurance Number (Canada)
            r"national_id",
        ],
        "credit_card": [
            r"credit_card",
            r"card_number",
            r"cc_number",
            r"card_num",
            r"pan",  # Primary Account Number
            r"payment_card",
        ],
        "address": [
            r"address",
            r"street",
            r"city",
            r"state",
            r"zip",
            r"postal",
            r"country",
            r"addr",
            r"location",
        ],
        "name": [
            r"first_name",
            r"last_name",
            r"full_name",
            r"fname",
            r"lname",
            r"given_name",
            r"surname",
            r"family_name",
            r"middle_name",
        ],
        "dob": [
            r"dob",
            r"birth",
            r"birthday",
            r"date_of_birth",
            r"birthdate",
            r"born",
        ],
        "ip_address": [
            r"^ip$",  # Exact match only
            r"ip_address",
            r"ipaddr",
            r"client_ip",
            r"remote_addr",
            r"_ip$",  # Ends with _ip
        ],
        "passport": [
            r"passport",
            r"passport_number",
            r"passport_no",
        ],
        "driver_license": [
            r"driver_license",
            r"license_number",
            r"dl_number",
            r"drivers_license",
        ],
    }

    # Data patterns for PII detection - ordered by specificity
    # SSN must come before phone as SSN format can match phone patterns
    DATA_PATTERNS: dict[str, re.Pattern] = {
        "email": re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"),
        # SSN: exactly 3 digits, dash, 2 digits, dash, 4 digits
        "ssn": re.compile(r"^\d{3}-\d{2}-\d{4}$"),
        # IP address before phone
        "ip_address": re.compile(
            r"^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$"
        ),
        # Phone pattern - must have parentheses or + prefix, or spaces/dashes with longer segments
        "phone": re.compile(
            r"^(?:\+\d{1,4}[-\s]?)?(?:\(\d{1,4}\)[-\s]?)?\d{3}[-\s\.]\d{3}[-\s\.]\d{4}$"
        ),
        "credit_card": re.compile(
            r"^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})$"
        ),
        "zip_code": re.compile(r"^\d{5}(?:[-\s]\d{4})?$"),
    }

    def detect_by_column_name(self, column_name: str) -> List[Tuple[str, float]]:
        """
        Detect PII type based on column name.

        Args:
            column_name: The name of the database column

        Returns:
            List of (pii_type, confidence) tuples
        """
        findings: List[Tuple[str, float]] = []
        normalized_name = column_name.lower().replace("-", "_")

        for pii_type, patterns in self.COLUMN_NAME_PATTERNS.items():
            for pattern in patterns:
                # Exact match gets high confidence
                if normalized_name == pattern:
                    findings.append((pii_type, 0.95))
                    break
                # Partial match gets medium confidence
                elif re.search(pattern, normalized_name):
                    findings.append((pii_type, 0.75))
                    break

        return findings

    def detect_by_data(self, values: List[str]) -> List[Tuple[str, float]]:
        """
        Detect PII type based on sampled data values.

        Args:
            values: List of sampled string values from the column

        Returns:
            List of (pii_type, confidence) tuples
        """
        if not values:
            return []

        findings: List[Tuple[str, float]] = []
        matched_values: set = set()  # Track values already matched to avoid duplicates

        # Process patterns in order (ip_address before phone due to ordering)
        for pii_type, pattern in self.DATA_PATTERNS.items():
            unmatched_values = [v for v in values if v not in matched_values]
            if not unmatched_values:
                continue

            matches = 0
            newly_matched = []
            for v in unmatched_values:
                if pattern.match(v.strip()):
                    matches += 1
                    newly_matched.append(v)

            if matches > 0:
                # Mark values as matched to prevent double-counting
                matched_values.update(newly_matched)

                # Calculate confidence based on match rate
                match_rate = matches / len(values)
                if match_rate >= 0.8:
                    confidence = 0.95
                elif match_rate >= 0.5:
                    confidence = 0.80
                elif match_rate >= 0.2:
                    confidence = 0.60
                else:
                    confidence = 0.40

                if confidence >= 0.40:  # Only report if reasonably confident
                    findings.append((pii_type, confidence))

        return findings

    def get_pii_types(self) -> List[str]:
        """Get all supported PII types."""
        return list(self.COLUMN_NAME_PATTERNS.keys())
