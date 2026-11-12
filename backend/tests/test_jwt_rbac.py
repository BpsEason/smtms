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
from app.db.session import get_db
from app.models.user import (
    PermissionORM,
    RoleORM,
    RolePermissionORM,
    UserORM,
    UserRoleORM,
)
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker


class FakeRedis:
    """測試用 Redis Mock，支援 Token 撤銷狀態。"""

    def __init__(self) -> None:
        self.revoked: set[str] = set()
        self.store: dict[str, str] = {}
        self.ttl: dict[str, int] = {}

    async def exists(self, key: str) -> int:
        if key in self.revoked:
            return 1
        return 1 if key in self.store else 0

    async def set(self, key: str, value: str, ex: int) -> bool:
        if value == "1" and key.startswith("auth:revoked:"):
            assert ex > 0
            self.revoked.add(key)
            return True
        self.store[key] = value
        self.ttl[key] = ex
        return True

    async def eval(self, script: str, numkeys: int, key: str, *args):
        assert numkeys == 1
        ttl = int(args[1]) if len(args) > 1 else 0
        current = int(self.store.get(key, "0"))
        if current == 0:
            self.ttl[key] = ttl
        count = current + 1
        self.store[key] = str(count)
        remaining = self.ttl.get(key, ttl)
        if remaining < 0:
            self.ttl[key] = ttl
            remaining = ttl
        return [count, remaining]

    async def close(self) -> None:
        return None

    async def aclose(self) -> None:
        return None


@pytest.fixture
def auth_environment(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> Generator[tuple[TestClient, sessionmaker, FakeRedis], None, None]:
    """使用共用資料庫交易、TestClient 與 Redis Mock。"""

    fake_redis = FakeRedis()
    monkeypatch.setattr(
        redis_module,
        "get_redis_client",
        lambda: fake_redis,
    )

    # 綁定共用 db_session 的 Connection，
    # 確保額外建立的 Session 仍受外層交易 rollback 管理。
    TestSession = sessionmaker(
        bind=db_session.connection(),
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )

    # 建立測試所需的角色、權限及使用者。
    with TestSession.begin() as session:
        qa_role = RoleORM(
            name="Quality Assurance",
            description="QA testing role",
        )
        receiver_role = RoleORM(
            name="Receiving",
            description="Receiving testing role",
        )

        read_permission = PermissionORM(
            code="iqc:read",
            name="Read IQC",
        )
        write_permission = PermissionORM(
            code="iqc:write",
            name="Manage IQC",
        )
        denied_permission = PermissionORM(
            code="users:manage",
            name="Manage users",
        )

        password_hash = get_password_hash("Correct-Test-Password-2026!")

        user = UserORM(
            username="qa.tester",
            email="qa.tester@example.test",
            password_hash=password_hash,
            is_active=True,
        )
        disabled = UserORM(
            username="disabled.tester",
            email="disabled.tester@example.test",
            password_hash=password_hash,
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
                RolePermissionORM(
                    role_id=qa_role.id,
                    permission_id=read_permission.id,
                ),
                RolePermissionORM(
                    role_id=qa_role.id,
                    permission_id=write_permission.id,
                ),
            ]
        )

    yield client, TestSession, fake_redis


def test_login_and_me_resolve_database_roles_and_permissions(auth_environment) -> None:
    client, _, _ = auth_environment

    response = client.post(
        "/api/v1/auth/login",
        json={
            "username": "qa.tester",
            "password": "Correct-Test-Password-2026!",
        },
    )
    assert response.status_code == 200, response.text

    token = response.json()["access_token"]

    profile = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert profile.status_code == 200, profile.text
    assert profile.json()["roles"] == ["Quality Assurance", "Receiving"]
    assert profile.json()["permissions"] == ["iqc:read", "iqc:write"]


def test_wrong_password_is_rejected(auth_environment) -> None:
    client, _, _ = auth_environment

    response = client.post(
        "/api/v1/auth/login",
        json={
            "username": "qa.tester",
            "password": "Wrong-Password",
        },
    )

    assert response.status_code == 401


def test_disabled_account_cannot_login(auth_environment) -> None:
    client, _, _ = auth_environment

    response = client.post(
        "/api/v1/auth/login",
        json={
            "username": "disabled.tester",
            "password": "Correct-Test-Password-2026!",
        },
    )

    assert response.status_code == 401


def test_me_requires_valid_token(auth_environment) -> None:
    client, _, _ = auth_environment

    assert client.get("/api/v1/auth/me").status_code == 401

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not-a-valid-token"},
    )
    assert response.status_code == 401


def test_logout_revokes_token(auth_environment) -> None:
    client, _, fake_redis = auth_environment

    token = client.post(
        "/api/v1/auth/login",
        json={
            "username": "qa.tester",
            "password": "Correct-Test-Password-2026!",
        },
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

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_permission_and_role_dependencies_use_resolved_database_grants(
    auth_environment,
) -> None:
    client, _, _ = auth_environment

    token = client.post(
        "/api/v1/auth/login",
        json={
            "username": "qa.tester",
            "password": "Correct-Test-Password-2026!",
        },
    ).json()["access_token"]

    protected_app = FastAPI()
    protected_app.dependency_overrides[get_db] = app_dependency_override()

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

    headers = {"Authorization": f"Bearer {token}"}

    with TestClient(protected_app) as protected_client:
        assert protected_client.get("/iqc", headers=headers).status_code == 200
        assert protected_client.get("/users", headers=headers).status_code == 403
        assert protected_client.get("/qa", headers=headers).status_code == 200


def test_seed_permission_codes_are_normalized_for_profile_and_access_checks(
    auth_environment,
) -> None:
    client, session_factory, _ = auth_environment

    with session_factory.begin() as session:
        seed_user = UserORM(
            username="seed_admin_regression",
            email="seed_admin_regression@example.test",
            password_hash=get_password_hash("Correct-Test-Password-2026!"),
            is_active=True,
        )
        seed_role = RoleORM(
            name="SMTMS Seed Administrator",
            description="seed admin role",
        )
        seed_permission = PermissionORM(
            code="seed:suppliers:read",
            name="Read suppliers",
        )

        session.add_all([seed_user, seed_role, seed_permission])
        session.flush()

        session.add_all(
            [
                UserRoleORM(
                    user_id=seed_user.id,
                    role_id=seed_role.id,
                ),
                RolePermissionORM(
                    role_id=seed_role.id,
                    permission_id=seed_permission.id,
                ),
            ]
        )

    response = client.post(
        "/api/v1/auth/login",
        json={
            "username": "seed_admin_regression",
            "password": "Correct-Test-Password-2026!",
        },
    )
    assert response.status_code == 200, response.text

    token = response.json()["access_token"]

    profile = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert profile.status_code == 200, profile.text
    assert profile.json()["permissions"] == ["suppliers:read"]

    protected_app = FastAPI()
    protected_app.dependency_overrides[get_db] = app_dependency_override()

    @protected_app.get("/suppliers")
    def suppliers_read(
        user: AuthenticatedUser = Depends(require_permission("suppliers:read")),
    ) -> dict[str, str]:
        return {"username": user.username}

    with TestClient(protected_app) as protected_client:
        response = protected_client.get(
            "/suppliers",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200


def app_dependency_override():
    """取得目前共用測試 App 的資料庫 Dependency Override。"""
    from app.main import app

    return app.dependency_overrides[get_db]


def test_redis_outage_fails_closed_and_health_remains_available(
    auth_environment,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, _, _ = auth_environment

    login = client.post(
        "/api/v1/auth/login",
        json={
            "username": "qa.tester",
            "password": "Correct-Test-Password-2026!",
        },
    )
    assert login.status_code == 200, login.text

    headers = {
        "Authorization": f"Bearer {login.json()['access_token']}",
    }

    class BrokenRedis:
        async def exists(self, key: str) -> int:
            raise OSError("redis connection refused")

        async def ping(self) -> bool:
            raise OSError("redis connection refused")

        async def close(self) -> None:
            return None

    monkeypatch.setattr(
        redis_module,
        "get_redis_client",
        lambda: BrokenRedis(),
    )

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
