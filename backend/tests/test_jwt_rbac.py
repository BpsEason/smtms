from collections.abc import Generator
from datetime import timedelta

import pytest
from app.core import redis_client as redis_module
from app.core.security import (
    AuthenticatedUser,
    create_access_token,
    get_password_hash,
    require_permission,
    require_role,
)
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.user import PermissionORM, RoleORM, RolePermissionORM, UserORM, UserRoleORM
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool


class FakeRedis:
    def __init__(self) -> None:
        self.revoked: set[str] = set()

    def exists(self, key: str) -> int:
        return int(key in self.revoked)

    def set(self, key: str, value: str, ex: int) -> bool:
        assert value == "1"
        assert ex > 0
        self.revoked.add(key)
        return True


@pytest.fixture
def auth_environment(
    monkeypatch,
) -> Generator[tuple[TestClient, sessionmaker, FakeRedis], None, None]:
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(test_engine)
    TestSession = sessionmaker(bind=test_engine, expire_on_commit=False)
    fake_redis = FakeRedis()
    monkeypatch.setattr(redis_module, "get_redis_client", lambda: fake_redis)

    def override_get_db() -> Generator[Session, None, None]:
        with TestSession() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    with TestSession.begin() as session:
        qa_role = RoleORM(name="Quality Assurance", description="QA testing role")
        receiver_role = RoleORM(name="Receiving", description="Receiving testing role")
        read_permission = PermissionORM(code="iqc:read", name="Read IQC")
        write_permission = PermissionORM(code="iqc:write", name="Manage IQC")
        denied_permission = PermissionORM(code="users:manage", name="Manage users")
        user = UserORM(
            username="qa.tester",
            email="qa.tester@example.test",
            password_hash=get_password_hash("Correct-Test-Password-2026!"),
            is_active=True,
        )
        disabled = UserORM(
            username="disabled.tester",
            email="disabled.tester@example.test",
            password_hash=get_password_hash("Correct-Test-Password-2026!"),
            is_active=False,
        )
        session.add_all(
            [
                qa_role,
                receiver_role,
                read_permission,
                write_permission,
                denied_permission,
                user,
                disabled,
            ]
        )
        session.flush()
        session.add_all(
            [
                UserRoleORM(user_id=user.id, role_id=qa_role.id),
                UserRoleORM(user_id=user.id, role_id=receiver_role.id),
                RolePermissionORM(role_id=qa_role.id, permission_id=read_permission.id),
                RolePermissionORM(role_id=qa_role.id, permission_id=write_permission.id),
            ]
        )

    client = TestClient(app)
    try:
        yield client, TestSession, fake_redis
    finally:
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(test_engine)
        test_engine.dispose()


def test_login_and_me_resolve_database_roles_and_permissions(auth_environment) -> None:
    client, _, _ = auth_environment
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "qa.tester", "password": "Correct-Test-Password-2026!"},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]

    profile = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert profile.status_code == 200, profile.text
    assert profile.json()["roles"] == ["Quality Assurance", "Receiving"]
    assert profile.json()["permissions"] == ["iqc:read", "iqc:write"]


def test_wrong_password_is_rejected(auth_environment) -> None:
    client, _, _ = auth_environment
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "qa.tester", "password": "Wrong-Password"},
    )
    assert response.status_code == 401


def test_disabled_account_cannot_login(auth_environment) -> None:
    client, _, _ = auth_environment
    response = client.post(
        "/api/v1/auth/login",
        json={"username": "disabled.tester", "password": "Correct-Test-Password-2026!"},
    )
    assert response.status_code == 401


def test_me_requires_valid_token(auth_environment) -> None:
    client, _, _ = auth_environment
    assert client.get("/api/v1/auth/me").status_code == 401
    assert (
        client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer not-a-valid-token"},
        ).status_code
        == 401
    )


def test_logout_revokes_token(auth_environment) -> None:
    client, _, fake_redis = auth_environment
    token = client.post(
        "/api/v1/auth/login",
        json={"username": "qa.tester", "password": "Correct-Test-Password-2026!"},
    ).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    logout = client.post("/api/v1/auth/logout", headers=headers)
    assert logout.status_code == 200
    assert fake_redis.revoked
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401


def test_expired_token_is_rejected(auth_environment) -> None:
    client, _, _ = auth_environment
    token = create_access_token(
        "qa.tester",
        payload={"user_id": 1},
        expires_delta=-timedelta(minutes=1),
    )
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_permission_and_role_dependencies_use_resolved_database_grants(auth_environment) -> None:
    client, _, _ = auth_environment
    token = client.post(
        "/api/v1/auth/login",
        json={"username": "qa.tester", "password": "Correct-Test-Password-2026!"},
    ).json()["access_token"]
    protected_app = FastAPI()
    protected_app.dependency_overrides[get_db] = app.dependency_overrides[get_db]

    @protected_app.get("/iqc")
    def read_iqc(
        user: AuthenticatedUser = Depends(require_permission("iqc:read")),
    ) -> dict[str, str]:
        return {"username": user.username}

    @protected_app.get("/users")
    def manage_users(
        user: AuthenticatedUser = Depends(require_permission("users:manage")),
    ) -> dict[str, str]:
        return {"username": user.username}

    @protected_app.get("/qa")
    def qa_only(
        user: AuthenticatedUser = Depends(require_role("Quality Assurance")),
    ) -> dict[str, str]:
        return {"username": user.username}

    protected_client = TestClient(protected_app)
    headers = {"Authorization": f"Bearer {token}"}
    assert protected_client.get("/iqc", headers=headers).status_code == 200
    assert protected_client.get("/users", headers=headers).status_code == 403
    assert protected_client.get("/qa", headers=headers).status_code == 200


def test_seed_permission_codes_are_normalized_for_profile_and_access_checks(
    auth_environment,
) -> None:
    client, session_factory, _ = auth_environment
    with session_factory() as session:
        seed_user = UserORM(
            username="seed_admin_regression",
            email="seed_admin_regression@example.test",
            password_hash=get_password_hash("Correct-Test-Password-2026!"),
            is_active=True,
        )
        seed_role = RoleORM(name="SMTMS Seed Administrator", description="seed admin role")
        seed_permission = PermissionORM(code="seed:suppliers:read", name="Read suppliers")
        session.add_all([seed_user, seed_role, seed_permission])
        session.flush()
        session.add_all(
            [
                UserRoleORM(user_id=seed_user.id, role_id=seed_role.id),
                RolePermissionORM(role_id=seed_role.id, permission_id=seed_permission.id),
            ]
        )
        session.commit()

    response = client.post(
        "/api/v1/auth/login",
        json={"username": "seed_admin_regression", "password": "Correct-Test-Password-2026!"},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]

    profile = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert profile.status_code == 200, profile.text
    assert profile.json()["permissions"] == ["suppliers:read"]

    protected_app = FastAPI()
    protected_app.dependency_overrides[get_db] = app.dependency_overrides[get_db]

    @protected_app.get("/suppliers")
    def suppliers_read(
        user: AuthenticatedUser = Depends(require_permission("suppliers:read")),
    ) -> dict[str, str]:
        return {"username": user.username}

    protected_client = TestClient(protected_app)
    assert (
        protected_client.get("/suppliers", headers={"Authorization": f"Bearer {token}"}).status_code
        == 200
    )


def test_redis_outage_fails_closed_and_health_remains_available(auth_environment, monkeypatch) -> None:
    client, _, _ = auth_environment
    login = client.post(
        "/api/v1/auth/login",
        json={"username": "qa.tester", "password": "Correct-Test-Password-2026!"},
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    class BrokenRedis:
        def exists(self, key: str) -> int:
            raise OSError("redis connection refused")

        def ping(self) -> bool:
            raise OSError("redis connection refused")

    monkeypatch.setattr(redis_module, "get_redis_client", lambda: BrokenRedis())
    protected = client.get("/api/v1/auth/me", headers=headers)
    assert protected.status_code == 503
    assert protected.json()["detail"] == "Authentication service unavailable"
    redis_health = client.get("/api/v1/health/redis")
    assert redis_health.status_code == 200
    assert redis_health.json() == {"status": "unavailable"}
    ready = client.get("/api/v1/health/ready")
    assert ready.status_code == 200
    assert ready.json()["status"] == "degraded"
    assert ready.json()["checks"]["redis"]["status"] == "unavailable"
    assert client.get("/api/v1/health/live").json()["status"] == "live"
