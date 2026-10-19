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


def redis_health_check() -> dict[str, str]:
    try:
        if ping_redis():
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
def readiness_check() -> dict[str, object]:
    db_status = database_health_check()
    redis_status = redis_health_check()
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
def redis_status() -> dict[str, str]:
    return redis_health_check()


@router.get("/ready")
def readiness_alias() -> dict[str, object]:
    return readiness_check()
