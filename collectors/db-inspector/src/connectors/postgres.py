"""PostgreSQL connector for schema extraction."""

import logging
from typing import Any

import asyncpg

from .base import BaseConnector
from ..analyzers.pii_detector import PIIDetector

logger = logging.getLogger(__name__)


class PostgresConnector(BaseConnector):
    """PostgreSQL database connector."""

    def __init__(
        self,
        host: str,
        port: int,
        user: str,
        password: str,
        database: str,
    ):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.database = database
        self.pool: asyncpg.Pool | None = None
        self.pii_detector = PIIDetector()

    async def connect(self) -> None:
        """Establish database connection pool."""
        logger.info(
            f"Connecting to PostgreSQL at {self.host}:{self.port}/{self.database}"
        )
        self.pool = await asyncpg.create_pool(
            host=self.host,
            port=self.port,
            user=self.user,
            password=self.password,
            database=self.database,
            min_size=1,
            max_size=5,
        )

    async def close(self) -> None:
        """Close database connection pool."""
        if self.pool:
            await self.pool.close()
            self.pool = None

    async def get_tables(self) -> list[dict[str, Any]]:
        """Extract all tables and their columns."""
        if not self.pool:
            raise RuntimeError("Not connected to database")

        tables = []
        async with self.pool.acquire() as conn:
            # Get all tables
            table_rows = await conn.fetch("""
                SELECT
                    t.table_schema,
                    t.table_name,
                    pg_stat_get_tuples_ins(c.oid) - pg_stat_get_tuples_del(c.oid) AS row_estimate
                FROM information_schema.tables t
                JOIN pg_class c ON c.relname = t.table_name
                JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
                WHERE t.table_type = 'BASE TABLE'
                AND t.table_schema NOT IN ('pg_catalog', 'information_schema')
                ORDER BY t.table_schema, t.table_name
            """)

            for table_row in table_rows:
                schema = table_row["table_schema"]
                name = table_row["table_name"]

                # Get columns for this table
                columns = await self._get_columns(conn, schema, name)

                # Get indexes for this table
                indexes = await self._get_indexes(conn, schema, name)

                tables.append(
                    {
                        "name": name,
                        "schema": schema,
                        "columns": columns,
                        "indexes": indexes,
                        "row_count_estimate": table_row["row_estimate"] or 0,
                    }
                )

        return tables

    async def _get_columns(
        self, conn: asyncpg.Connection, schema: str, table: str
    ) -> list[dict[str, Any]]:
        """Get columns for a specific table."""
        rows = await conn.fetch(
            """
            SELECT
                c.column_name,
                c.data_type,
                c.is_nullable = 'YES' AS nullable,
                c.column_default,
                COALESCE(
                    (SELECT true FROM information_schema.table_constraints tc
                     JOIN information_schema.constraint_column_usage ccu
                        ON tc.constraint_name = ccu.constraint_name
                     WHERE tc.constraint_type = 'PRIMARY KEY'
                        AND tc.table_schema = c.table_schema
                        AND tc.table_name = c.table_name
                        AND ccu.column_name = c.column_name
                     LIMIT 1),
                    false
                ) AS primary_key
            FROM information_schema.columns c
            WHERE c.table_schema = $1 AND c.table_name = $2
            ORDER BY c.ordinal_position
        """,
            schema,
            table,
        )

        return [
            {
                "name": row["column_name"],
                "data_type": row["data_type"],
                "nullable": row["nullable"],
                "primary_key": row["primary_key"],
                "default": row["column_default"],
            }
            for row in rows
        ]

    async def _get_indexes(
        self, conn: asyncpg.Connection, schema: str, table: str
    ) -> list[dict[str, Any]]:
        """Get indexes for a specific table."""
        rows = await conn.fetch(
            """
            SELECT
                i.relname AS index_name,
                am.amname AS index_type,
                ix.indisunique AS is_unique,
                array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) AS columns
            FROM pg_index ix
            JOIN pg_class t ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_am am ON am.oid = i.relam
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
            WHERE n.nspname = $1 AND t.relname = $2
            GROUP BY i.relname, am.amname, ix.indisunique
        """,
            schema,
            table,
        )

        return [
            {
                "name": row["index_name"],
                "type": row["index_type"],
                "unique": row["is_unique"],
                "columns": list(row["columns"]),
            }
            for row in rows
        ]

    async def get_relationships(self) -> list[dict[str, Any]]:
        """Extract foreign key relationships."""
        if not self.pool:
            raise RuntimeError("Not connected to database")

        relationships = []
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT
                    tc.constraint_name,
                    tc.table_schema AS source_schema,
                    tc.table_name AS source_table,
                    kcu.column_name AS source_column,
                    ccu.table_schema AS target_schema,
                    ccu.table_name AS target_table,
                    ccu.column_name AS target_column
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                    ON ccu.constraint_name = tc.constraint_name
                WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
            """)

            for row in rows:
                relationships.append(
                    {
                        "name": row["constraint_name"],
                        "source_table": f"{row['source_schema']}.{row['source_table']}",
                        "source_column": row["source_column"],
                        "target_table": f"{row['target_schema']}.{row['target_table']}",
                        "target_column": row["target_column"],
                    }
                )

        return relationships

    async def detect_pii(
        self, sample_size: int = 100, enabled: bool = True
    ) -> list[dict[str, Any]]:
        """Detect potential PII in database columns."""
        if not self.pool:
            raise RuntimeError("Not connected to database")

        findings = []
        tables = await self.get_tables()

        for table in tables:
            for column in table["columns"]:
                # Column name-based detection (always runs)
                name_findings = self.pii_detector.detect_by_column_name(column["name"])
                for pii_type, confidence in name_findings:
                    findings.append(
                        {
                            "table": f"{table['schema']}.{table['name']}",
                            "column": column["name"],
                            "pii_type": pii_type,
                            "confidence": confidence,
                            "detection_method": "column_name",
                        }
                    )

                # Data sampling-based detection (optional)
                if enabled and column["data_type"] in (
                    "character varying",
                    "varchar",
                    "text",
                    "char",
                    "character",
                ):
                    async with self.pool.acquire() as conn:
                        try:
                            samples = await conn.fetch(f"""
                                SELECT "{column["name"]}"
                                FROM "{table["schema"]}"."{table["name"]}"
                                WHERE "{column["name"]}" IS NOT NULL
                                LIMIT {sample_size}
                            """)
                            values = [str(row[0]) for row in samples if row[0]]
                            data_findings = self.pii_detector.detect_by_data(values)
                            for pii_type, confidence in data_findings:
                                # Avoid duplicates with column name detection
                                existing = any(
                                    f["table"] == f"{table['schema']}.{table['name']}"
                                    and f["column"] == column["name"]
                                    and f["pii_type"] == pii_type
                                    for f in findings
                                )
                                if not existing:
                                    findings.append(
                                        {
                                            "table": f"{table['schema']}.{table['name']}",
                                            "column": column["name"],
                                            "pii_type": pii_type,
                                            "confidence": confidence,
                                            "detection_method": "data_pattern",
                                        }
                                    )
                        except Exception as e:
                            logger.warning(
                                f"Failed to sample {table['schema']}.{table['name']}.{column['name']}: {e}"
                            )

        return findings
