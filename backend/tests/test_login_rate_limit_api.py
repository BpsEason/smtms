import os

os.environ["SECRET_KEY"] = "a" * 32
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"

import pytest
from app.core import config
from app.core import redis_client as redis_module
from app.core.security import get_password_hash
from app.db.session import get_db
from app.main import app
from app.models.user import RefreshTokenORM, UserORM
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker


class FakeEvalRedis:
    """Redis mock with atomic INCR+EXPIRE behavior via eval for rate limit tests."""

    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.ttl: dict[str, int] = {}
        self.eval_calls: list[str] = []

    async def exists(self, key: str) -> int:
        return 1 if key in self.store else 0

    async def set(self, key: str, value: str, ex: int) -> bool:
        self.store[key] = value
        self.ttl[key] = ex
        return True

    async def eval(self, script: str, numkeys: int, key: str, limit: int, ttl: int):
        assert numkeys == 1
        self.eval_calls.append(script)
        current = int(self.store.get(key, "0"))
        if current == 0:
            self.ttl[key] = int(ttl)
        count = current + 1
        self.store[key] = str(count)
        return [count, self.ttl.get(key, int(ttl))]

    async def close(self) -> None:
        return None

    async def aclose(self) -> None:
        return None


class BrokenEvalRedis(FakeEvalRedis):
    async def eval(self, script: str, numkeys: int, key: str, limit: int, ttl: int):
        raise OSError("redis unavailable")


@pytest.fixture(scope="session")
def test_password_hash() -> str:
    return get_password_hash("Password123!")


@pytest.fixture
def rate_limit_env(db_session: Session, monkeypatch, test_password_hash: str):
    monkeypatch.setattr(
        config,
        "get_settings",
        lambda: config.Settings(
            secret_key="a" * 32,
            login_rate_limit_window_seconds=60,
            login_rate_limit_cooldown_seconds=60,
            login_rate_limit_ip_max_attempts=20,
            login_rate_limit_account_max_attempts=5,
        ),
    )

    fake_redis = FakeEvalRedis()
    monkeypatch.setattr(redis_module, "get_redis_client", lambda: fake_redis)

    TestSession = sessionmaker(
        bind=db_session.connection(),
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )

    def override_get_db():
        with TestSession() as session:
            yield session

    original_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestSession() as session:
            session.add(
                UserORM(
                    username="test.user",
                    email="test@example.com",
                    password_hash=test_password_hash,
                    is_active=True,
                )
            )
            session.commit()

        with TestClient(app) as client:
            yield client, fake_redis
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(original_overrides)


def _login(client: TestClient, username="test.user", password="Password123!", ip="10.0.0.1"):
    return client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
        headers={"x-forwarded-for": ip},
    )


def test_login_rate_limit_allows_normal_login(rate_limit_env):
    client, _ = rate_limit_env
    resp = _login(client)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_login_rate_limit_counts_wrong_password(rate_limit_env):
    client, _ = rate_limit_env
    for _ in range(5):
        assert _login(client, password="WrongPassword!").status_code == 401
    resp = _login(client, password="WrongPassword!")
    assert resp.status_code == 429
    assert resp.headers.get("retry-after") == "60"
    assert resp.json()["detail"] == "Too many login attempts. Please try again later."


def test_login_rate_limit_counts_unknown_account(rate_limit_env):
    client, _ = rate_limit_env
    for _ in range(5):
        assert _login(client, username="missing.user").status_code == 401
    resp = _login(client, username="missing.user")
    assert resp.status_code == 429
    assert resp.headers.get("retry-after") is not None


def test_login_rate_limit_unknown_and_known_accounts_share_normalized_account_key(rate_limit_env):
    client, fake_redis = rate_limit_env
    # Mix attempts for same normalized identifier (unknown and existing treated consistently)
    for _ in range(5):
        assert _login(client, username="Test.User", password="WrongPassword!").status_code == 401
    resp = _login(client, username=" test.user ", password="Password123!")
    assert resp.status_code == 429
    account_keys = [k for k in fake_redis.store if "auth:login_rate_limit:account:" in k]
    assert len(account_keys) == 1


def test_login_rate_limit_ip_dimension_independent(rate_limit_env):
    client, _ = rate_limit_env
    for _ in range(5):
        assert _login(client, username="user-a", password="bad", ip="10.0.0.10").status_code == 401
    # Same account attempts from different IP should not be IP-limited by previous IP
    resp = _login(client, username="user-a", password="bad", ip="10.0.0.11")
    assert resp.status_code == 429  # account limit reached (6th)
    # Different account from first IP still allowed by account counter
    resp2 = _login(client, username="user-b", password="bad", ip="10.0.0.10")
    assert resp2.status_code == 401


def test_login_rate_limit_different_accounts_independent(rate_limit_env):
    client, _ = rate_limit_env
    for _ in range(5):
        assert _login(client, username="acct-a", password="bad", ip="10.0.0.20").status_code == 401
    assert _login(client, username="acct-a", password="bad", ip="10.0.0.20").status_code == 429
    assert _login(client, username="acct-b", password="bad", ip="10.0.0.21").status_code == 401


def test_login_rate_limit_blocks_before_password_verification_on_429(rate_limit_env, monkeypatch):
    client, _ = rate_limit_env
    for _ in range(6):
        _login(client, password="WrongPassword!")
    import app.api.routes.auth as auth_routes

    def boom(*args, **kwargs):
        raise AssertionError("verify_password should not run when rate limited")

    monkeypatch.setattr(auth_routes, "verify_password", boom)
    resp = _login(client, password="WrongPassword!")
    assert resp.status_code == 429


def test_login_rate_limit_does_not_create_tokens_on_429(rate_limit_env, db_session: Session):
    client, _ = rate_limit_env
    for _ in range(6):
        _login(client, password="WrongPassword!")
    resp = _login(client, password="WrongPassword!")
    assert resp.status_code == 429
    count = db_session.query(RefreshTokenORM).count()
    assert count == 0


def test_login_rate_limit_redis_failure_returns_503_not_401(rate_limit_env, monkeypatch):
    client, _ = rate_limit_env
    monkeypatch.setattr(redis_module, "get_redis_client", lambda: BrokenEvalRedis())

    resp = client.post(
        "/api/v1/auth/login",
        json={"username": "test.user", "password": "Password123!"},
        headers={"x-forwarded-for": "10.0.0.1"},
    )
    assert resp.status_code == 503
    assert resp.json()["detail"] == "Authentication service unavailable"
    assert resp.status_code != 401


def test_login_rate_limit_redis_failure_does_not_verify_password(rate_limit_env, monkeypatch):
    client, _ = rate_limit_env
    monkeypatch.setattr(redis_module, "get_redis_client", lambda: BrokenEvalRedis())
    import app.api.routes.auth as auth_routes

    def boom(*args, **kwargs):
        raise AssertionError("verify_password should not run when Redis fails closed")

    monkeypatch.setattr(auth_routes, "verify_password", boom)
    resp = client.post(
        "/api/v1/auth/login",
        json={"username": "test.user", "password": "Password123!"},
        headers={"x-forwarded-for": "10.0.0.1"},
    )
    assert resp.status_code == 503


def test_login_rate_limit_uses_atomic_eval(rate_limit_env):
    client, fake_redis = rate_limit_env
    resp = _login(client)
    assert resp.status_code == 200
    assert fake_redis.eval_calls, "expected Lua eval to be used for atomic counters"
    script = fake_redis.eval_calls[0]
    assert "INCR" in script and "EXPIRE" in script
