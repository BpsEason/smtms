"""Application lifespan management for SMTMS Backend.

Centralizes Redis client initialization and cleanup within the
FastAPI lifespan context manager.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from app.core.redis_client import close_redis_client, init_redis_client
from fastapi import FastAPI


@asynccontextmanager
async def app_lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Initialize Redis on startup and release resources on shutdown.

    Uses try/finally to ensure Redis client is closed even if the
    application encounters an error during startup.
    """
    await init_redis_client()
    try:
        yield
    finally:
        await close_redis_client()
