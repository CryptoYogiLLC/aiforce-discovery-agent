"""Base connector interface for database schema extraction."""

from abc import ABC, abstractmethod
from typing import Any


class BaseConnector(ABC):
    """Abstract base class for database connectors."""

    @abstractmethod
    async def connect(self) -> None:
        """Establish database connection."""
        pass

    @abstractmethod
    async def close(self) -> None:
        """Close database connection."""
        pass

    @abstractmethod
    async def get_tables(self) -> list[dict[str, Any]]:
        """
        Extract all tables and their columns.

        Returns:
            List of table dictionaries with structure:
            {
                "name": "table_name",
                "schema": "schema_name",
                "columns": [
                    {
                        "name": "column_name",
                        "data_type": "varchar",
                        "nullable": True,
                        "primary_key": False,
                        "default": None,
                    }
                ],
                "indexes": [...],
                "row_count_estimate": 1000,
            }
        """
        pass

    @abstractmethod
    async def get_relationships(self) -> list[dict[str, Any]]:
        """
        Extract foreign key relationships.

        Returns:
            List of relationship dictionaries with structure:
            {
                "name": "fk_constraint_name",
                "source_table": "orders",
                "source_column": "customer_id",
                "target_table": "customers",
                "target_column": "id",
            }
        """
        pass

    @abstractmethod
    async def detect_pii(
        self, sample_size: int = 100, enabled: bool = True
    ) -> list[dict[str, Any]]:
        """
        Detect potential PII in database columns.

        Args:
            sample_size: Number of rows to sample for data-based detection
            enabled: Whether to enable data sampling (column name detection always runs)

        Returns:
            List of PII findings with structure:
            {
                "table": "users",
                "column": "email",
                "pii_type": "email",
                "confidence": 0.95,
                "detection_method": "column_name" | "data_pattern",
            }
        """
        pass
