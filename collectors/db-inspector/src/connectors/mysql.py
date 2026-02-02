"""MySQL connector for schema extraction."""

import logging
from typing import Any

import aiomysql

from .base import BaseConnector
from ..analyzers.pii_detector import PIIDetector

logger = logging.getLogger(__name__)


class MySQLConnector(BaseConnector):
    """MySQL database connector."""

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
        self.pool: aiomysql.Pool | None = None
        self.pii_detector = PIIDetector()

    async def connect(self) -> None:
        """Establish database connection pool."""
        logger.info(f"Connecting to MySQL at {self.host}:{self.port}/{self.database}")
        self.pool = await aiomysql.create_pool(
            host=self.host,
            port=self.port,
            user=self.user,
            password=self.password,
            db=self.database,
            minsize=1,
            maxsize=5,
            autocommit=True,
        )

    async def close(self) -> None:
        """Close database connection pool."""
        if self.pool:
            self.pool.close()
            await self.pool.wait_closed()
            self.pool = None

    async def get_tables(self) -> list[dict[str, Any]]:
        """Extract all tables and their columns."""
        if not self.pool:
            raise RuntimeError("Not connected to database")

        tables = []
        async with self.pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                # Get all tables with row estimates
                await cursor.execute(
                    """
                    SELECT
                        TABLE_SCHEMA,
                        TABLE_NAME,
                        TABLE_ROWS
                    FROM information_schema.TABLES
                    WHERE TABLE_TYPE = 'BASE TABLE'
                    AND TABLE_SCHEMA = %s
                    ORDER BY TABLE_NAME
                """,
                    (self.database,),
                )
                table_rows = await cursor.fetchall()

                for table_row in table_rows:
                    schema = table_row["TABLE_SCHEMA"]
                    name = table_row["TABLE_NAME"]

                    # Get columns for this table
                    columns = await self._get_columns(cursor, schema, name)

                    # Get indexes for this table
                    indexes = await self._get_indexes(cursor, schema, name)

                    tables.append(
                        {
                            "name": name,
                            "schema": schema,
                            "columns": columns,
                            "indexes": indexes,
                            "row_count_estimate": table_row["TABLE_ROWS"] or 0,
                        }
                    )

        return tables

    async def _get_columns(
        self, cursor: aiomysql.Cursor, schema: str, table: str
    ) -> list[dict[str, Any]]:
        """Get columns for a specific table."""
        await cursor.execute(
            """
            SELECT
                COLUMN_NAME,
                DATA_TYPE,
                IS_NULLABLE = 'YES' AS nullable,
                COLUMN_DEFAULT,
                COLUMN_KEY = 'PRI' AS primary_key
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
            ORDER BY ORDINAL_POSITION
        """,
            (schema, table),
        )
        rows = await cursor.fetchall()

        return [
            {
                "name": row["COLUMN_NAME"],
                "data_type": row["DATA_TYPE"],
                "nullable": bool(row["nullable"]),
                "primary_key": bool(row["primary_key"]),
                "default": row["COLUMN_DEFAULT"],
            }
            for row in rows
        ]

    async def _get_indexes(
        self, cursor: aiomysql.Cursor, schema: str, table: str
    ) -> list[dict[str, Any]]:
        """Get indexes for a specific table."""
        await cursor.execute(
            """
            SELECT
                INDEX_NAME,
                INDEX_TYPE,
                NOT NON_UNIQUE AS is_unique,
                GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s
            GROUP BY INDEX_NAME, INDEX_TYPE, NON_UNIQUE
        """,
            (schema, table),
        )
        rows = await cursor.fetchall()

        return [
            {
                "name": row["INDEX_NAME"],
                "type": row["INDEX_TYPE"],
                "unique": bool(row["is_unique"]),
                "columns": row["columns"].split(",") if row["columns"] else [],
            }
            for row in rows
        ]

    async def get_relationships(self) -> list[dict[str, Any]]:
        """Extract foreign key relationships."""
        if not self.pool:
            raise RuntimeError("Not connected to database")

        relationships = []
        async with self.pool.acquire() as conn:
            async with conn.cursor(aiomysql.DictCursor) as cursor:
                await cursor.execute(
                    """
                    SELECT
                        CONSTRAINT_NAME,
                        TABLE_SCHEMA AS source_schema,
                        TABLE_NAME AS source_table,
                        COLUMN_NAME AS source_column,
                        REFERENCED_TABLE_SCHEMA AS target_schema,
                        REFERENCED_TABLE_NAME AS target_table,
                        REFERENCED_COLUMN_NAME AS target_column
                    FROM information_schema.KEY_COLUMN_USAGE
                    WHERE REFERENCED_TABLE_NAME IS NOT NULL
                    AND TABLE_SCHEMA = %s
                """,
                    (self.database,),
                )
                rows = await cursor.fetchall()

                for row in rows:
                    relationships.append(
                        {
                            "name": row["CONSTRAINT_NAME"],
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
                    "varchar",
                    "text",
                    "char",
                    "tinytext",
                    "mediumtext",
                    "longtext",
                ):
                    async with self.pool.acquire() as conn:
                        async with conn.cursor() as cursor:
                            try:
                                await cursor.execute(f"""
                                    SELECT `{column["name"]}`
                                    FROM `{table["schema"]}`.`{table["name"]}`
                                    WHERE `{column["name"]}` IS NOT NULL
                                    LIMIT {sample_size}
                                """)
                                samples = await cursor.fetchall()
                                values = [str(row[0]) for row in samples if row[0]]
                                data_findings = self.pii_detector.detect_by_data(values)
                                for pii_type, confidence in data_findings:
                                    # Avoid duplicates with column name detection
                                    existing = any(
                                        f["table"]
                                        == f"{table['schema']}.{table['name']}"
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
