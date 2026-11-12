import os

os.environ["SECRET_KEY"] = "a" * 32
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"

import app.api.routes.auth as auth_routes
import pytest
from app.core import config
from app.core import redis_client as redis_module
from app.core.security import get_password_hash
from app.db.session import get_db
from app.main import app
from app.models.user import UserORM
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker


@pytest.fixture(scope="session")
def test_password_hash() -> str:
    return get_password_hash("Password123!")


@pytest.fixture
def auth_test_client(
    db_session: Session,
    monkeypatch,
    test_password_hash: str,
    fake_redis,
):
    monkeypatch.setattr(
        config,
        "get_settings",
        lambda: config.Settings(secret_key="a" * 32),
    )

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
            yield client, TestSession
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(original_overrides)


def _login(client, username="test.user", password="Password123!"):
    resp = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_logout_redis_failure_returns_503_and_does_not_revoke_refresh(
    auth_test_client, monkeypatch
):
    client, _ = auth_test_client
    tokens = _login(client)
    rt = tokens["refresh_token"]
    at = tokens["access_token"]

    async def broken_revoke(_claims):
        raise HTTPException(status_code=503, detail="Authentication service unavailable")

    monkeypatch.setattr(auth_routes, "revoke_access_token", broken_revoke)

    resp = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {at}"},
        json={"refresh_token": rt},
    )
    assert resp.status_code == 503
    assert resp.json()["detail"] == "Authentication service unavailable"

    refresh_resp = client.post("/api/v1/auth/refresh", json={"refresh_token": rt})
    assert refresh_resp.status_code == 200


def test_logout_without_refresh_token_does_not_revoke_other_devices(auth_test_client):
    client, _ = auth_test_client
    t1 = _login(client)
    t2 = _login(client)

    resp = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {t1['access_token']}"},
    )
    assert resp.status_code == 200

    assert (
        client.post("/api/v1/auth/refresh", json={"refresh_token": t2["refresh_token"]}).status_code
        == 200
    )


def test_logout_refresh_only_invalid_token_is_idempotent(auth_test_client):
    client, _ = auth_test_client
    resp = client.post("/api/v1/auth/logout", json={"refresh_token": "not-a-jwt"})
    assert resp.status_code == 200
    assert resp.json()["message"] == "Successfully logged out"


def test_logout_unauthenticated_without_payload_returns_401(auth_test_client):
    client, _ = auth_test_client
    resp = client.post("/api/v1/auth/logout")
    assert resp.status_code == 401


def test_change_password_revokes_current_access_token_and_all_refresh_tokens(auth_test_client):
    client, _ = auth_test_client
    t1 = _login(client)
    t2 = _login(client)

    resp = client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {t1['access_token']}"},
        json={"current_password": "Password123!", "new_password": "NewPassword123!"},
    )
    assert resp.status_code == 200

    assert (
        client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {t1['access_token']}"}
        ).status_code
        == 401
    )
    assert (
        client.post("/api/v1/auth/refresh", json={"refresh_token": t1["refresh_token"]}).status_code
        == 401
    )
    assert (
        client.post("/api/v1/auth/refresh", json={"refresh_token": t2["refresh_token"]}).status_code
        == 401
    )

    assert (
        client.post(
            "/api/v1/auth/login", json={"username": "test.user", "password": "Password123!"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/auth/login", json={"username": "test.user", "password": "NewPassword123!"}
        ).status_code
        == 200
    )


def test_change_password_redis_failure_fails_closed(auth_test_client, monkeypatch):
    client, _ = auth_test_client
    tokens = _login(client)

    async def broken_revoke(_claims):
        raise HTTPException(status_code=503, detail="Authentication service unavailable")

    monkeypatch.setattr(auth_routes, "revoke_access_token", broken_revoke)

    resp = client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
        json={"current_password": "Password123!", "new_password": "NewPassword123!"},
    )
    assert resp.status_code == 503

    assert (
        client.post(
            "/api/v1/auth/login", json={"username": "test.user", "password": "Password123!"}
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        ).status_code
        == 200
    )


def test_refresh_invalid_jwt_returns_401(auth_test_client):
    client, _ = auth_test_client
    resp = client.post("/api/v1/auth/refresh", json={"refresh_token": "invalid.token.value"})
    assert resp.status_code == 401


def test_refresh_reuse_revokes_all_account_refresh_tokens(auth_test_client):
    client, _ = auth_test_client
    t1 = _login(client)
    t2 = _login(client)

    first = client.post("/api/v1/auth/refresh", json={"refresh_token": t1["refresh_token"]})
    assert first.status_code == 200
    reused = client.post("/api/v1/auth/refresh", json={"refresh_token": t1["refresh_token"]})
    assert reused.status_code == 401

    assert (
        client.post("/api/v1/auth/refresh", json={"refresh_token": t2["refresh_token"]}).status_code
        == 401
    )


def test_logout_with_access_token_only_does_not_revoke_refresh_tokens_but_revokes_access(
    auth_test_client,
):
    client, _ = auth_test_client
    t1 = _login(client)
    t2 = _login(client)

    resp = client.post(
        "/api/v1/auth/logout", headers={"Authorization": f"Bearer {t1['access_token']}"}
    )
    assert resp.status_code == 200

    assert (
        client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {t1['access_token']}"}
        ).status_code
        == 401
    )
    assert (
        client.post("/api/v1/auth/refresh", json={"refresh_token": t2["refresh_token"]}).status_code
        == 200
    )
