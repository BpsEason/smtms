import os
import threading
from collections.abc import Generator
from concurrent.futures import ThreadPoolExecutor

import pytest
from app.api.routes import access as access_module
from app.core import redis_client as redis_module
from app.core.security import get_password_hash, verify_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.quality import SupplierORM
from app.models.user import PermissionORM, RoleORM, RolePermissionORM, UserORM, UserRoleORM
from app.services.supplier_import import SUPPLIER_ROLE_NAME
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool, StaticPool

PASSWORD = "Access-Control-2026!"

# Dedicated MySQL database used only by the real multi-connection test below.
MYSQL_TEST_URL = os.getenv("SMTMS_TEST_MYSQL_URL")


class FakeRedis:
    async def exists(self, key: str) -> int:
        return 0

    async def set(self, key: str, value: str, ex: int) -> bool:
        return True


def _headers(client: TestClient, username: str, password: str = PASSWORD) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def access_environment(
    monkeypatch,
) -> Generator[tuple[TestClient, sessionmaker, dict[str, int]], None, None]:
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(test_engine)
    TestSession = sessionmaker(bind=test_engine, expire_on_commit=False)
    monkeypatch.setattr(redis_module, "get_redis_client", lambda: FakeRedis())

    def override_get_db() -> Generator[Session, None, None]:
        with TestSession() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    ids: dict[str, int] = {}
    with TestSession.begin() as session:
        permissions = {
            code: PermissionORM(code=code, name=code)
            for code in ("users:manage", "suppliers:read", "suppliers:write", "iqc:read")
        }
        admin_role = RoleORM(name="access-admin", description="Access administrator")
        reader_role = RoleORM(name="qc-reader", description="Read-only QC")
        portal_role = RoleORM(name=SUPPLIER_ROLE_NAME, description="Supplier portal")
        session.add_all([*permissions.values(), admin_role, reader_role, portal_role])
        session.add(
            SupplierORM(id=1, supplier_code="SUP-A", supplier_name="Supplier A", status="active")
        )
        session.flush()

        users = {
            "admin-one": UserORM(
                username="admin-one",
                email="admin-one@example.test",
                password_hash=get_password_hash(PASSWORD),
                is_active=True,
            ),
            "admin-two": UserORM(
                username="admin-two",
                email="admin-two@example.test",
                password_hash=get_password_hash(PASSWORD),
                is_active=True,
            ),
            "staff": UserORM(
                username="staff",
                email="staff@example.test",
                password_hash=get_password_hash(PASSWORD),
                is_active=True,
            ),
            "portal-user": UserORM(
                username="portal-user",
                email="portal-user@example.test",
                password_hash=get_password_hash(PASSWORD),
                is_active=True,
                supplier_id=1,
                must_change_password=False,
            ),
        }
        session.add_all(list(users.values()))
        session.flush()
        session.add_all(
            [
                UserRoleORM(user_id=users["admin-one"].id, role_id=admin_role.id),
                UserRoleORM(user_id=users["admin-two"].id, role_id=admin_role.id),
                UserRoleORM(user_id=users["staff"].id, role_id=reader_role.id),
                UserRoleORM(user_id=users["portal-user"].id, role_id=portal_role.id),
                RolePermissionORM(
                    role_id=admin_role.id, permission_id=permissions["users:manage"].id
                ),
                RolePermissionORM(
                    role_id=admin_role.id, permission_id=permissions["suppliers:read"].id
                ),
                RolePermissionORM(role_id=reader_role.id, permission_id=permissions["iqc:read"].id),
                RolePermissionORM(
                    role_id=portal_role.id, permission_id=permissions["suppliers:read"].id
                ),
            ]
        )

        ids = {
            "role_admin": admin_role.id,
            "role_reader": reader_role.id,
            "role_portal": portal_role.id,
            "perm_manage": permissions["users:manage"].id,
            "perm_suppliers_read": permissions["suppliers:read"].id,
            "perm_iqc_read": permissions["iqc:read"].id,
            "user_admin_one": users["admin-one"].id,
            "user_admin_two": users["admin-two"].id,
            "user_staff": users["staff"].id,
            "user_portal": users["portal-user"].id,
        }

    client = TestClient(app)
    try:
        yield client, TestSession, ids
    finally:
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(test_engine)
        test_engine.dispose()


def test_access_endpoints_require_auth_and_manage_permission(access_environment) -> None:
    client, _, _ = access_environment
    for path in ("/api/v1/roles", "/api/v1/permissions", "/api/v1/users"):
        assert client.get(path).status_code == 401, path

    staff_headers = _headers(client, "staff")
    for path in ("/api/v1/roles", "/api/v1/permissions", "/api/v1/users"):
        assert client.get(path, headers=staff_headers).status_code == 403, path
        assert (
            client.post(
                "/api/v1/roles",
                json={"name": "Unauthorized Role"},
                headers=staff_headers,
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/api/v1/users",
                json={"username": "unauthorized-user", "password": PASSWORD},
                headers=staff_headers,
            ).status_code
            == 403
        )


def test_admin_can_manage_roles_permissions_and_internal_user_roles(access_environment) -> None:
    client, _, ids = access_environment
    headers = _headers(client, "admin-one")

    roles = client.get("/api/v1/roles", headers=headers)
    assert roles.status_code == 200, roles.text
    admin_role = next(item for item in roles.json() if item["name"] == "access-admin")
    assert admin_role["permissions"] == ["suppliers:read", "users:manage"]
    assert admin_role["user_count"] == 2

    def test_admin_can_create_internal_user_with_persisted_roles(access_environment) -> None:
        client, TestSession, ids = access_environment
        headers = _headers(client, "admin-one")
        payload = {
            "username": "new.internal-user",
            "email": "new.internal-user@example.test",
            "password": "New-Internal-Password-2026!",
            "role_ids": [ids["role_reader"]],
        }

        created = client.post("/api/v1/users", json=payload, headers=headers)
        assert created.status_code == 201, created.text
        assert created.json()["username"] == payload["username"]
        assert created.json()["email"] == payload["email"]
        assert created.json()["roles"] == ["qc-reader"]

        with TestSession() as session:
            user = session.scalar(select(UserORM).where(UserORM.username == payload["username"]))
            assert user is not None
            assert user.supplier_id is None
            assert user.password_hash != payload["password"]
            assert verify_password(payload["password"], user.password_hash)
            role_links = session.scalars(
                select(UserRoleORM).where(UserRoleORM.user_id == user.id)
            ).all()
            assert [link.role_id for link in role_links] == [ids["role_reader"]]

        listed = client.get("/api/v1/users", headers=headers)
        assert listed.status_code == 200
        created_user = next(item for item in listed.json() if item["id"] == created.json()["id"])
        assert created_user["roles"] == ["qc-reader"]
        login = client.post(
            "/api/v1/auth/login",
            json={"username": payload["username"], "password": payload["password"]},
        )
        assert login.status_code == 200, login.text

    def test_internal_user_creation_rejects_duplicates_supplier_identity_and_invalid_roles(
        access_environment,
    ) -> None:
        client, _, ids = access_environment
        headers = _headers(client, "admin-one")
        payload = {"username": "new.internal-user", "password": "New-Internal-Password-2026!"}

        created = client.post("/api/v1/users", json=payload, headers=headers)
        assert created.status_code == 201, created.text
        duplicate = client.post("/api/v1/users", json=payload, headers=headers)
        assert duplicate.status_code == 409

        assert (
            client.post(
                "/api/v1/users",
                json={**payload, "username": "supplier-in-disguise", "supplier_id": 1},
                headers=headers,
            ).status_code
            == 422
        )
        assert (
            client.post(
                "/api/v1/users",
                json={
                    **payload,
                    "username": "supplier-role-user",
                    "role_ids": [ids["role_portal"]],
                },
                headers=headers,
            ).status_code
            == 409
        )
        assert (
            client.post(
                "/api/v1/users",
                json={**payload, "username": "unknown-role-user", "role_ids": [99999]},
                headers=headers,
            ).status_code
            == 404
        )
        assert (
            client.post(
                "/api/v1/users",
                json={**payload, "username": "invalid user"},
                headers=headers,
            ).status_code
            == 422
        )

    permissions = client.get("/api/v1/permissions", headers=headers)
    assert permissions.status_code == 200
    assert "users:manage" in {item["code"] for item in permissions.json()}

    users = client.get("/api/v1/users", headers=headers)
    assert users.status_code == 200
    usernames = {item["username"] for item in users.json()}
    assert {"admin-one", "admin-two", "staff"} <= usernames
    assert "portal-user" not in usernames

    created = client.post(
        "/api/v1/roles",
        json={"name": "qc-lead", "description": "Quality lead"},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    new_role_id = created.json()["id"]
    assert (
        client.post(
            "/api/v1/roles",
            json={"name": "qc-lead"},
            headers=headers,
        ).status_code
        == 409
    )

    updated = client.patch(
        f"/api/v1/roles/{new_role_id}",
        json={"description": "Quality lead updated"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["description"] == "Quality lead updated"

    assigned = client.put(
        f"/api/v1/roles/{new_role_id}/permissions",
        json={"permission_ids": [ids["perm_iqc_read"]]},
        headers=headers,
    )
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["permissions"] == ["iqc:read"]

    user_roles = client.put(
        f"/api/v1/users/{ids['user_staff']}/roles",
        json={"role_ids": [new_role_id]},
        headers=headers,
    )
    assert user_roles.status_code == 200, user_roles.text
    assert user_roles.json()["roles"] == ["qc-lead"]

    staff_headers = _headers(client, "staff")
    staff_profile = client.get("/api/v1/auth/me", headers=staff_headers)
    assert staff_profile.json()["permissions"] == ["iqc:read"]


def test_unknown_role_permission_and_user_ids_are_rejected(access_environment) -> None:
    client, _, ids = access_environment
    headers = _headers(client, "admin-one")

    assert (
        client.patch("/api/v1/roles/99999", json={"description": "x"}, headers=headers).status_code
        == 404
    )
    assert (
        client.put(
            "/api/v1/roles/99999/permissions",
            json={"permission_ids": []},
            headers=headers,
        ).status_code
        == 404
    )
    assert (
        client.put(
            f"/api/v1/roles/{ids['role_reader']}/permissions",
            json={"permission_ids": [99999]},
            headers=headers,
        ).status_code
        == 404
    )
    assert (
        client.put("/api/v1/users/99999/roles", json={"role_ids": []}, headers=headers).status_code
        == 404
    )
    assert (
        client.put(
            f"/api/v1/users/{ids['user_staff']}/roles",
            json={"role_ids": [99999]},
            headers=headers,
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/v1/roles",
            json={"name": "   "},
            headers=headers,
        ).status_code
        == 422
    )
    assert (
        client.put(
            f"/api/v1/roles/{ids['role_reader']}/permissions",
            json={"unexpected": 1},
            headers=headers,
        ).status_code
        == 422
    )


def test_last_management_administrator_cannot_be_removed(access_environment) -> None:
    client, _, ids = access_environment
    headers = _headers(client, "admin-one")

    # Removing one of two managers is allowed.
    assert (
        client.put(
            f"/api/v1/users/{ids['user_admin_two']}/roles",
            json={"role_ids": []},
            headers=headers,
        ).status_code
        == 200
    )

    # Only one manager remains, so the last grant cannot be dropped.
    assert (
        client.put(
            f"/api/v1/users/{ids['user_admin_one']}/roles",
            json={"role_ids": []},
            headers=headers,
        ).status_code
        == 409
    )
    assert (
        client.put(
            f"/api/v1/roles/{ids['role_admin']}/permissions",
            json={"permission_ids": [ids["perm_suppliers_read"]]},
            headers=headers,
        ).status_code
        == 409
    )

    # The refusal must roll back the pending change.
    roles = client.get("/api/v1/roles", headers=headers)
    admin_role = next(item for item in roles.json() if item["name"] == "access-admin")
    assert "users:manage" in admin_role["permissions"]
    users = client.get("/api/v1/users", headers=headers)
    admin_one = next(item for item in users.json() if item["username"] == "admin-one")
    assert admin_one["roles"] == ["access-admin"]


def test_supplier_portal_accounts_cannot_gain_internal_access(access_environment) -> None:
    client, _, ids = access_environment
    headers = _headers(client, "admin-one")

    assert (
        client.put(
            f"/api/v1/users/{ids['user_portal']}/roles",
            json={"role_ids": [ids["role_admin"]]},
            headers=headers,
        ).status_code
        == 409
    )
    assert (
        client.put(
            f"/api/v1/roles/{ids['role_portal']}/permissions",
            json={"permission_ids": [ids["perm_manage"]]},
            headers=headers,
        ).status_code
        == 409
    )
    assert (
        client.put(
            f"/api/v1/roles/{ids['role_portal']}/permissions",
            json={"permission_ids": [ids["perm_suppliers_read"]]},
            headers=headers,
        ).status_code
        == 200
    )

    # The portal account itself never holds the management permission.
    portal_headers = _headers(client, "portal-user")
    assert client.get("/api/v1/roles", headers=portal_headers).status_code == 403


def test_role_deletion_is_blocked_while_referenced(access_environment) -> None:
    client, _, ids = access_environment
    headers = _headers(client, "admin-one")

    assert client.delete(f"/api/v1/roles/{ids['role_admin']}", headers=headers).status_code == 409
    assert client.delete(f"/api/v1/roles/{ids['role_portal']}", headers=headers).status_code == 409

    created = client.post("/api/v1/roles", json={"name": "temp-role"}, headers=headers)
    temp_id = created.json()["id"]
    assert client.delete(f"/api/v1/roles/{temp_id}", headers=headers).status_code == 204
    assert client.delete("/api/v1/roles/99999", headers=headers).status_code == 404


def test_permission_changes_apply_to_existing_tokens_immediately(access_environment) -> None:
    client, _, ids = access_environment
    admin_headers = _headers(client, "admin-one")
    staff_headers = _headers(client, "staff")

    assert client.get("/api/v1/roles", headers=staff_headers).status_code == 403

    granted = client.put(
        f"/api/v1/users/{ids['user_staff']}/roles",
        json={"role_ids": [ids["role_admin"]]},
        headers=admin_headers,
    )
    assert granted.status_code == 200, granted.text
    assert client.get("/api/v1/roles", headers=staff_headers).status_code == 200

    revoked = client.put(
        f"/api/v1/users/{ids['user_staff']}/roles",
        json={"role_ids": [ids["role_reader"]]},
        headers=admin_headers,
    )
    assert revoked.status_code == 200
    assert client.get("/api/v1/roles", headers=staff_headers).status_code == 403


def test_management_guard_reads_current_committed_state_for_mysql() -> None:
    """Application-logic test: the guard must not rely on the transaction snapshot.

    SQLite ignores ``FOR UPDATE``, so this asserts the statement the guard
    issues on MySQL is a locking (current) read rather than a snapshot read.
    """
    sql = str(access_module._management_grants_statement().compile(dialect=mysql.dialect()))
    assert "FOR UPDATE" in sql.upper()


@pytest.mark.skipif(
    not MYSQL_TEST_URL,
    reason="set SMTMS_TEST_MYSQL_URL to a dedicated *_test database to run the real MySQL test",
)
def test_concurrent_management_removals_cannot_leave_zero_administrators_mysql() -> None:
    """Real MySQL multi-connection test: two parallel removals must not both win."""
    assert MYSQL_TEST_URL is not None
    assert "test" in MYSQL_TEST_URL.lower(), "refusing to run against a non-test database"

    engine = create_engine(MYSQL_TEST_URL, poolclass=NullPool)
    mysql_session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    try:
        with mysql_session.begin() as session:
            manage = PermissionORM(code="users:manage", name="users:manage")
            admin_role = RoleORM(name="concurrency-admin", description="Concurrency admin")
            session.add_all([manage, admin_role])
            session.flush()
            admins = [
                UserORM(
                    username=f"mysql-admin-{index}",
                    email=f"mysql-admin-{index}@example.test",
                    password_hash=get_password_hash(PASSWORD),
                    is_active=True,
                )
                for index in (1, 2)
            ]
            session.add_all(admins)
            session.flush()
            session.add_all(
                [UserRoleORM(user_id=user.id, role_id=admin_role.id) for user in admins]
                + [RolePermissionORM(role_id=admin_role.id, permission_id=manage.id)]
            )
            admin_ids = [user.id for user in admins]

        barrier = threading.Barrier(2)

        def remove_own_grant(user_id: int) -> str:
            session = mysql_session()
            try:
                link = session.scalars(
                    select(UserRoleORM).where(UserRoleORM.user_id == user_id)
                ).one()
                session.delete(link)
                barrier.wait(timeout=15)
                access_module._commit_keeping_one_manager(session)
                return "committed"
            except HTTPException as exc:
                return f"rejected:{exc.status_code}"
            finally:
                session.close()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = sorted(pool.map(remove_own_grant, admin_ids))

        assert results == ["committed", "rejected:409"], results
        with mysql_session() as session:
            assert access_module._management_grants(session), "no administrator left behind"
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()
