"""RabbitMQ connection management for the Code Analyzer service."""

import logging
from contextlib import asynccontextmanager
from typing import Any

import aio_pika
from fastapi import FastAPI

from .config import settings

logger = logging.getLogger(__name__)

# Global state
app_state: dict[str, Any] = {
    "rabbitmq_connection": None,
    "rabbitmq_channel": None,
}


async def get_rabbitmq_connection() -> aio_pika.RobustConnection:
    """Get or create RabbitMQ connection."""
    if (
        app_state["rabbitmq_connection"] is None
        or app_state["rabbitmq_connection"].is_closed
    ):
        app_state["rabbitmq_connection"] = await aio_pika.connect_robust(
            settings.rabbitmq_url
        )
    return app_state["rabbitmq_connection"]


async def get_rabbitmq_channel() -> aio_pika.Channel:
    """Get or create RabbitMQ channel."""
    connection = await get_rabbitmq_connection()
    if app_state["rabbitmq_channel"] is None or app_state["rabbitmq_channel"].is_closed:
        app_state["rabbitmq_channel"] = await connection.channel()
    return app_state["rabbitmq_channel"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    logger.info("Starting Code Analyzer service...")

    try:
        connection = await get_rabbitmq_connection()
        channel = await connection.channel()
        await channel.declare_exchange(
            settings.rabbitmq_exchange,
            aio_pika.ExchangeType.TOPIC,
            durable=True,
        )
        logger.info("RabbitMQ connection established")
    except Exception as e:
        logger.warning(f"Failed to connect to RabbitMQ: {e}")

    yield

    # Cleanup
    if app_state["rabbitmq_channel"]:
        await app_state["rabbitmq_channel"].close()
    if app_state["rabbitmq_connection"]:
        await app_state["rabbitmq_connection"].close()
    logger.info("Code Analyzer service stopped")
