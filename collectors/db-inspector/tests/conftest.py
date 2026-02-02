"""Pytest configuration and fixtures."""

import sys
from unittest.mock import AsyncMock, MagicMock

import pytest

# Mock aiomysql
mock_aiomysql = MagicMock()
mock_aiomysql.Pool = MagicMock()
mock_aiomysql.Cursor = MagicMock()
mock_aiomysql.DictCursor = MagicMock()
mock_aiomysql.create_pool = AsyncMock()
sys.modules["aiomysql"] = mock_aiomysql

# Mock asyncpg
mock_asyncpg = MagicMock()
mock_asyncpg.Pool = MagicMock()
mock_asyncpg.Connection = MagicMock()
mock_asyncpg.create_pool = AsyncMock()
sys.modules["asyncpg"] = mock_asyncpg

# Mock aio_pika
mock_aio_pika = MagicMock()
mock_aio_pika.connect_robust = AsyncMock()
mock_aio_pika.RobustConnection = MagicMock()
mock_aio_pika.Channel = MagicMock()
mock_aio_pika.Exchange = MagicMock()
mock_aio_pika.ExchangeType = MagicMock()
mock_aio_pika.ExchangeType.TOPIC = "topic"
mock_aio_pika.Message = MagicMock()
sys.modules["aio_pika"] = mock_aio_pika

# Mock tenacity
mock_tenacity = MagicMock()
mock_tenacity.retry = lambda **kwargs: lambda f: f  # No-op decorator
mock_tenacity.stop_after_attempt = MagicMock(return_value=None)
mock_tenacity.wait_exponential = MagicMock(return_value=None)
sys.modules["tenacity"] = mock_tenacity

# Mock prometheus_client
mock_prometheus = MagicMock()
mock_prometheus.CONTENT_TYPE_LATEST = "text/plain; version=0.0.4; charset=utf-8"
mock_prometheus.generate_latest = MagicMock(return_value=b"# HELP test metric\n")
sys.modules["prometheus_client"] = mock_prometheus


@pytest.fixture(scope="session")
def anyio_backend():
    """Use asyncio as the async backend."""
    return "asyncio"
