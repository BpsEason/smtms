from fastapi import APIRouter

from app.core.redis_client import ping_redis
from app.db.session import check_database_health

router = APIRouter(tags=["health"])


def database_health_check() -> dict[str, str]:
    try:
        if check_database_health():
            return {"status": "ok"}
        return {"status": "unavailable"}
    except Exception:
        return {"status": "unavailable"}


async def redis_health_check() -> dict[str, str]:
    try:
        if await ping_redis():
            return {"status": "ok"}
        return {"status": "unavailable"}
    except Exception:
        return {"status": "unavailable"}


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "smtms-backend"}


@router.get("/health/live")
def liveness_check() -> dict[str, str]:
    return {"status": "live", "service": "smtms-backend"}


@router.get("/health/ready")
async def readiness_check() -> dict[str, object]:
    db_status = database_health_check()
    redis_status = await redis_health_check()
    ready = db_status["status"] == "ok" and redis_status["status"] == "ok"
    return {
        "status": "ready" if ready else "degraded",
        "checks": {
            "database": db_status,
            "redis": redis_status,
        },
    }


@router.get("/health/database")
def database_status() -> dict[str, str]:
    return database_health_check()


@router.get("/health/redis")
async def redis_status() -> dict[str, str]:
    return await redis_health_check()


@router.get("/ready")
async def readiness_alias() -> dict[str, object]:
    return await readiness_check()
