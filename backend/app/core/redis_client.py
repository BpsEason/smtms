import redis

from app.core.config import get_settings

settings = get_settings()
_redis_client: redis.Redis | None = None


def init_redis_client() -> redis.Redis:
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
    return _redis_client or init_redis_client()


def close_redis_client() -> None:
    global _redis_client
    if _redis_client is not None:
        _redis_client.close()
        _redis_client = None


def ping_redis() -> bool:
    client = get_redis_client()
    return bool(client.ping())
