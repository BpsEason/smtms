import redis.asyncio as redis
from app.core.config import get_settings

settings = get_settings()
_redis_client: redis.Redis | None = None


async def init_redis_client() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
            health_check_interval=30,
        )
    return _redis_client


def get_redis_client() -> redis.Redis:
    if _redis_client is None:
        raise RuntimeError("Redis client not initialized. Call init_redis_client first.")
    return _redis_client


async def close_redis_client() -> None:
    global _redis_client
    if _redis_client is not None:
        await _redis_client.close()
        _redis_client = None


async def ping_redis() -> bool:
    client = get_redis_client()
    return bool(await client.ping())
