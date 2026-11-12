import hashlib
import os
from datetime import datetime, timedelta, timezone

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

from conftest import _FakeRedis


@pytest.fixture(scope="session")
def test_password_hash() -> str:
    """整個測試執行期間共用密碼雜湊，避免重複計算。"""
    return get_password_hash("Password123!")


@pytest.fixture
def auth_test_client(
    db_session: Session,
    monkeypatch,
    test_password_hash: str,
):
    """使用共用測試資料庫，確保認證測試資料可在測試結束後回滾。"""

    # Mock settings，避免測試環境設定驗證錯誤。
    monkeypatch.setattr(
        config,
        "get_settings",
        lambda: config.Settings(secret_key="a" * 32),
    )
    _FakeRedis._shared_store.clear()
    _FakeRedis._shared_ttl.clear()
    monkeypatch.setattr(
        redis_module,
        "get_redis_client",
        lambda: _FakeRedis(),
    )

    # 所有 Session 共用 db_session 的外層交易。
    # 每個 Session 的 commit() 只會提交 SAVEPOINT，
    # 最終仍由 conftest.py 的 db_session fixture 負責 rollback。
    TestSession = sessionmaker(
        bind=db_session.connection(),
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )

    def override_get_db():
        with TestSession() as session:
            yield session

    # 保留原有 Dependency Overrides，避免污染其他測試。
    original_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = override_get_db

    try:
        # 建立測試使用者。
        with TestSession() as session:
            user = UserORM(
                username="test.user",
                email="test@example.com",
                password_hash=test_password_hash,
                is_active=True,
            )
            session.add(user)
            session.commit()

        with TestClient(app) as client:
            yield client, TestSession

    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(original_overrides)


def test_refresh_token_success(auth_test_client):
    client, _ = auth_test_client

    # Login to get initial tokens
    login_resp = client.post(
        "/api/v1/auth/login",
        json={
            "username": "test.user",
            "password": "Password123!",
        },
    )
    assert login_resp.status_code == 200

    tokens = login_resp.json()
    refresh_token = tokens["refresh_token"]

    # Refresh
    refresh_resp = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refresh_resp.status_code == 200

    new_tokens = refresh_resp.json()
    assert "access_token" in new_tokens
    assert "refresh_token" in new_tokens
    assert new_tokens["refresh_token"] != refresh_token

    # New refresh token is usable
    second_refresh = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": new_tokens["refresh_token"]},
    )
    assert second_refresh.status_code == 200


def test_refresh_token_reuse_fails(auth_test_client):
    client, _ = auth_test_client

    login_resp = client.post(
        "/api/v1/auth/login",
        json={
            "username": "test.user",
            "password": "Password123!",
        },
    )
    refresh_token = login_resp.json()["refresh_token"]

    # First refresh
    client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )

    # Try to reuse old refresh token
    reuse_resp = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert reuse_resp.status_code == 401


def test_refresh_expired_token_fails(auth_test_client):
    client, session_factory = auth_test_client

    login_resp = client.post(
        "/api/v1/auth/login",
        json={
            "username": "test.user",
            "password": "Password123!",
        },
    )
    refresh_token = login_resp.json()["refresh_token"]

    with session_factory() as session:
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()

        token = session.query(RefreshTokenORM).filter_by(token_hash=token_hash).first()

        token.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        session.commit()

    resp = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert resp.status_code == 401


def test_refresh_tokens_different_users_isolated(
    auth_test_client,
    test_password_hash,
):
    client, session_factory = auth_test_client

    # Create second user
    with session_factory() as session:
        session.add(
            UserORM(
                username="other.user",
                email="other@example.com",
                password_hash=test_password_hash,
                is_active=True,
            )
        )
        session.commit()

    l1 = client.post(
        "/api/v1/auth/login",
        json={
            "username": "test.user",
            "password": "Password123!",
        },
    )

    l2 = client.post(
        "/api/v1/auth/login",
        json={
            "username": "other.user",
            "password": "Password123!",
        },
    )

    rt1 = l1.json()["refresh_token"]
    rt2 = l2.json()["refresh_token"]

    # Revoke user1's token manually
    with session_factory() as session:
        token_hash = hashlib.sha256(rt1.encode()).hexdigest()

        token = session.query(RefreshTokenORM).filter_by(token_hash=token_hash).first()
        token.revoked = True
        session.commit()

    # User2's token should still be valid
    resp2 = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": rt2},
    )
    assert resp2.status_code == 200


def test_refresh_token_revoked_fails(auth_test_client):
    client, session_factory = auth_test_client

    login_resp = client.post(
        "/api/v1/auth/login",
        json={
            "username": "test.user",
            "password": "Password123!",
        },
    )
    refresh_token = login_resp.json()["refresh_token"]

    # Revoke it manually
    with session_factory() as session:
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()

        token = session.query(RefreshTokenORM).filter_by(token_hash=token_hash).first()
        token.revoked = True
        session.commit()

    resp = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert resp.status_code == 401


def test_refresh_tokens_independent_per_device(auth_test_client):
    client, _ = auth_test_client

    # Login 1
    login1 = client.post(
        "/api/v1/auth/login",
        json={
            "username": "test.user",
            "password": "Password123!",
        },
    )
    rt1 = login1.json()["refresh_token"]

    # Login 2
    login2 = client.post(
        "/api/v1/auth/login",
        json={
            "username": "test.user",
            "password": "Password123!",
        },
    )
    rt2 = login2.json()["refresh_token"]

    assert rt1 != rt2

    # Refresh RT1
    resp1 = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": rt1},
    )
    assert resp1.status_code == 200

    # RT2 should still be valid
    resp2 = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": rt2},
    )
    assert resp2.status_code == 200


def test_logout_only_revokes_current_device(auth_test_client):
    client, _ = auth_test_client

    l1 = client.post(
        "/api/v1/auth/login",
        json={
            "username": "test.user",
            "password": "Password123!",
        },
    )

    l2 = client.post(
        "/api/v1/auth/login",
        json={
            "username": "test.user",
            "password": "Password123!",
        },
    )

    rt1 = l1.json()["refresh_token"]
    rt2 = l2.json()["refresh_token"]
    at1 = l1.json()["access_token"]

    # Logout device 1, passing its refresh token
    client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {at1}"},
        json={"refresh_token": rt1},
    )

    resp1 = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": rt1},
    )
    assert resp1.status_code == 401

    resp2 = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": rt2},
    )
    assert resp2.status_code == 200


def test_logout_does_not_revoke_other_user(
    auth_test_client,
    test_password_hash,
):
    client, session_factory = auth_test_client

    with session_factory() as session:
        session.add(
            UserORM(
                username="other.user3",
                email="other3@example.com",
                password_hash=test_password_hash,
                is_active=True,
            )
        )
        session.commit()

    l1 = client.post(
        "/api/v1/auth/login",
        json={
            "username": "test.user",
            "password": "Password123!",
        },
    )

    l2 = client.post(
        "/api/v1/auth/login",
        json={
            "username": "other.user3",
            "password": "Password123!",
        },
    )

    rt2 = l2.json()["refresh_token"]
    at1 = l1.json()["access_token"]
    rt1 = l1.json()["refresh_token"]

    client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {at1}"},
        json={"refresh_token": rt1},
    )

    resp2 = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": rt2},
    )
    assert resp2.status_code == 200
