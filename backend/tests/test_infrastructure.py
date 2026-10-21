from app.api.routes.health import database_health_check, redis_health_check
from app.core.redis_client import get_redis_client, ping_redis
from app.db.session import SessionLocal, engine
from app.main import app
from fastapi.testclient import TestClient


def test_database_session_factory_imports() -> None:
    assert engine is not None
    assert SessionLocal is not None


def test_redis_client_can_ping(monkeypatch) -> None:
    class FakeRedis:
        def ping(self):
            return True

    fake_client = FakeRedis()
    monkeypatch.setattr(
        "app.core.redis_client.redis.Redis.from_url", lambda *args, **kwargs: fake_client
    )
    client = get_redis_client()
    assert client is fake_client
    assert ping_redis() is True


def test_health_routes_are_available() -> None:
    client = TestClient(app)

    assert client.get("/api/v1/health/live").status_code == 200
    assert client.get("/api/v1/health/ready").status_code == 200
    assert client.get("/api/v1/health/database").status_code == 200
    assert client.get("/api/v1/health/redis").status_code == 200

    database_status = database_health_check()
    redis_status = redis_health_check()
    assert "status" in database_status
    assert "status" in redis_status


def test_database_health_reports_unavailable_without_breaking_liveness(monkeypatch) -> None:
    def database_down() -> bool:
        raise OSError("database connection refused")

    monkeypatch.setattr("app.api.routes.health.check_database_health", database_down)
    client = TestClient(app)
    database = client.get("/api/v1/health/database")
    ready = client.get("/api/v1/health/ready")
    live = client.get("/api/v1/health/live")
    assert database.status_code == 200
    assert database.json() == {"status": "unavailable"}
    assert ready.status_code == 200
    assert ready.json()["status"] == "degraded"
    assert ready.json()["checks"]["database"]["status"] == "unavailable"
    assert live.status_code == 200
    assert live.json()["status"] == "live"
