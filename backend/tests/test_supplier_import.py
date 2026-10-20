from collections.abc import Generator
from io import BytesIO

import pytest
from app.core import redis_client as redis_module
from app.core.security import get_password_hash, verify_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.quality import SupplierORM
from app.models.user import PermissionORM, RoleORM, RolePermissionORM, UserORM, UserRoleORM
from app.services import supplier_import
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy import create_engine, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
IMPORT_PASSWORD = "Import-Test-Password-2026!"
FILE_URL = "/api/v1/suppliers/import/preview"


class FakeRedis:
    def exists(self, key: str) -> int:
        return 0


def workbook_bytes(rows: list[dict[str, object]], headers: tuple[str, ...] | None = None) -> bytes:
    columns = headers or supplier_import.TEMPLATE_HEADERS
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "suppliers"
    sheet.append(list(columns))
    for row in rows:
        sheet.append([row.get(column) for column in columns])
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _headers(client: TestClient, username: str, password: str = IMPORT_PASSWORD) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _files(content: bytes, name: str = "suppliers.xlsx") -> dict[str, tuple[str, bytes, str]]:
    return {"file": (name, content, XLSX_MEDIA_TYPE)}


@pytest.fixture
def import_environment(monkeypatch) -> Generator[tuple[TestClient, sessionmaker], None, None]:
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
    with TestSession.begin() as session:
        permissions = [
            PermissionORM(code="suppliers:read", name="Read suppliers"),
            PermissionORM(code="suppliers:write", name="Manage suppliers"),
        ]
        admin_role = RoleORM(name="import-admin")
        reader_role = RoleORM(name="import-reader")
        admin = UserORM(
            username="import-admin",
            email="import-admin@example.test",
            password_hash=get_password_hash(IMPORT_PASSWORD),
            is_active=True,
        )
        reader = UserORM(
            username="import-reader",
            email="import-reader@example.test",
            password_hash=get_password_hash(IMPORT_PASSWORD),
            is_active=True,
        )
        existing_user = UserORM(
            username="existing-account",
            email="existing@example.test",
            password_hash=get_password_hash(IMPORT_PASSWORD),
            is_active=True,
        )
        session.add_all([*permissions, admin_role, reader_role, admin, reader, existing_user])
        session.flush()
        session.add_all(
            [
                UserRoleORM(user_id=admin.id, role_id=admin_role.id),
                UserRoleORM(user_id=reader.id, role_id=reader_role.id),
                *[
                    RolePermissionORM(role_id=admin_role.id, permission_id=permission.id)
                    for permission in permissions
                ],
                RolePermissionORM(role_id=reader_role.id, permission_id=permissions[0].id),
            ]
        )
        session.add(
            SupplierORM(
                supplier_code="SUP-001",
                supplier_name="Existing Supplier",
                tax_id="11111111",
                status="active",
            )
        )

    client = TestClient(app)
    try:
        yield client, TestSession
    finally:
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(test_engine)
        test_engine.dispose()


def test_template_download_returns_xlsx(import_environment) -> None:
    client, _ = import_environment
    headers = _headers(client, "import-admin")
    response = client.get("/api/v1/suppliers/import/template", headers=headers)
    assert response.status_code == 200
    assert response.headers["content-type"] == XLSX_MEDIA_TYPE
    assert response.content[:2] == b"PK"
    assert "attachment" in response.headers["content-disposition"]


def test_preview_and_confirm_create_suppliers_and_login_accounts(import_environment) -> None:
    client, TestSession = import_environment
    headers = _headers(client, "import-admin")
    content = workbook_bytes(
        [
            {
                "supplier_code": "SUP-100",
                "supplier_name": "Alpha Materials",
                "tax_id": "22222222",
                "login_username": "alpha-user",
                "login_email": "alpha@example.test",
            },
            {
                "supplier_code": "SUP-101",
                "supplier_name": "Beta Components",
                "tax_id": "33333333",
                "login_username": "beta-user",
                "login_password": IMPORT_PASSWORD,
            },
        ]
    )

    preview = client.post(FILE_URL, files=_files(content), headers=headers)
    assert preview.status_code == 200, preview.text
    assert preview.json()["total_rows"] == 2
    assert preview.json()["valid_rows"] == 2
    assert preview.json()["error_rows"] == 0
    assert len(preview.json()["rows"]) == 2

    confirm = client.post(
        "/api/v1/suppliers/import/confirm", files=_files(content), headers=headers
    )
    assert confirm.status_code == 200, confirm.text
    body = confirm.json()
    assert body["status"] == "completed"
    assert body["created"] == 2
    assert body["failed"] == 0
    assert body["skipped"] == 0
    assert len(body["accounts"]) == 2

    with TestSession() as session:
        assert session.scalar(select(func.count()).select_from(SupplierORM)) == 3
        alpha = session.scalar(select(SupplierORM).where(SupplierORM.supplier_code == "SUP-100"))
        assert alpha is not None and alpha.tax_id == "22222222"
        account = session.scalar(select(UserORM).where(UserORM.username == "alpha-user"))
        assert account is not None
        assert account.supplier_id == alpha.id
        assert account.must_change_password is True
        assert account.password_hash != IMPORT_PASSWORD
        assert verify_password(body["accounts"][0]["initial_password"], account.password_hash)
        role = session.scalar(
            select(RoleORM).where(RoleORM.name == supplier_import.SUPPLIER_ROLE_NAME)
        )
        assert role is not None


def test_import_rejects_empty_malformed_and_incomplete_files(import_environment) -> None:
    client, _ = import_environment
    headers = _headers(client, "import-admin")

    assert client.post(FILE_URL, files=_files(b""), headers=headers).status_code == 422
    assert (
        client.post(FILE_URL, files=_files(b"not-an-excel-file"), headers=headers).status_code
        == 422
    )
    incomplete = workbook_bytes(
        [{"supplier_code": "SUP-200"}], headers=("supplier_code", "supplier_name")
    )
    assert client.post(FILE_URL, files=_files(incomplete), headers=headers).status_code == 422
    empty_rows = workbook_bytes([])
    assert client.post(FILE_URL, files=_files(empty_rows), headers=headers).status_code == 422


def test_import_reports_duplicates_and_existing_conflicts(import_environment) -> None:
    client, TestSession = import_environment
    headers = _headers(client, "import-admin")
    content = workbook_bytes(
        [
            {
                "supplier_code": "SUP-300",
                "supplier_name": "Gamma",
                "tax_id": "44444444",
                "login_username": "gamma-user",
            },
            {
                "supplier_code": "SUP-300",
                "supplier_name": "Gamma Duplicate Code",
                "tax_id": "55555555",
                "login_username": "gamma-user-2",
            },
            {
                "supplier_code": "SUP-301",
                "supplier_name": "Delta",
                "tax_id": "44444444",
                "login_username": "delta-user",
            },
            {
                "supplier_code": "SUP-001",
                "supplier_name": "Conflicts With Existing Code",
                "login_username": "brand-new-user",
            },
            {
                "supplier_code": "SUP-302",
                "supplier_name": "Duplicate Login",
                "login_username": "existing-account",
            },
        ]
    )

    preview = client.post(FILE_URL, files=_files(content), headers=headers)
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["total_rows"] == 5
    assert body["valid_rows"] == 1
    assert body["error_rows"] == 4
    fields = {error["field"] for error in body["errors"]}
    assert {"supplier_code", "tax_id", "login_username"} <= fields
    assert all(error["row"] >= 2 for error in body["errors"])

    confirm = client.post(
        "/api/v1/suppliers/import/confirm", files=_files(content), headers=headers
    )
    assert confirm.status_code == 200
    result = confirm.json()
    assert result["status"] == "rejected"
    assert result["created"] == 0
    assert result["failed"] == 4
    assert result["errors"]
    with TestSession() as session:
        assert session.scalar(select(func.count()).select_from(SupplierORM)) == 1


def test_reupload_is_idempotent_and_reports_skipped(import_environment) -> None:
    client, TestSession = import_environment
    headers = _headers(client, "import-admin")
    content = workbook_bytes(
        [
            {
                "supplier_code": "SUP-400",
                "supplier_name": "Idempotent Supplier",
                "tax_id": "66666666",
                "login_username": "idem-user",
            }
        ]
    )
    first = client.post("/api/v1/suppliers/import/confirm", files=_files(content), headers=headers)
    assert first.json()["created"] == 1
    preview_again = client.post(FILE_URL, files=_files(content), headers=headers)
    assert preview_again.json()["valid_rows"] == 0
    assert preview_again.json()["skipped_rows"] == 1
    second = client.post("/api/v1/suppliers/import/confirm", files=_files(content), headers=headers)
    assert second.json()["status"] == "completed"
    assert second.json()["created"] == 0
    assert second.json()["skipped"] == 1
    assert second.json()["accounts"] == []
    with TestSession() as session:
        assert session.scalar(select(func.count()).select_from(SupplierORM)) == 2
        assert session.scalar(select(func.count()).select_from(UserORM)) == 4


def test_import_requires_write_permission(import_environment) -> None:
    client, _ = import_environment
    content = workbook_bytes(
        [{"supplier_code": "SUP-500", "supplier_name": "Nope", "login_username": "nope-user"}]
    )
    reader = _headers(client, "import-reader")
    assert client.get("/api/v1/suppliers/import/template", headers=reader).status_code == 403
    assert client.post(FILE_URL, files=_files(content), headers=reader).status_code == 403
    assert (
        client.post(
            "/api/v1/suppliers/import/confirm", files=_files(content), headers=reader
        ).status_code
        == 403
    )
    assert client.post(FILE_URL, files=_files(content)).status_code == 401


def test_import_rolls_back_when_account_creation_fails(import_environment, monkeypatch) -> None:
    client, TestSession = import_environment
    headers = _headers(client, "import-admin")
    content = workbook_bytes(
        [
            {
                "supplier_code": "SUP-600",
                "supplier_name": "Rollback Supplier",
                "login_username": "rollback-user",
            }
        ]
    )

    def boom(password: str) -> str:
        raise IntegrityError("insert", {}, Exception("simulated failure"))

    monkeypatch.setattr(supplier_import, "get_password_hash", boom)
    confirm = client.post(
        "/api/v1/suppliers/import/confirm", files=_files(content), headers=headers
    )
    assert confirm.status_code == 200
    result = confirm.json()
    assert result["status"] == "rejected"
    assert result["created"] == 0
    assert result["accounts"] == []

    with TestSession() as session:
        assert session.scalar(select(func.count()).select_from(SupplierORM)) == 1
        assert session.scalar(select(UserORM).where(UserORM.username == "rollback-user")) is None


def test_password_is_hashed_and_never_leaked(import_environment) -> None:
    client, TestSession = import_environment
    headers = _headers(client, "import-admin")
    chosen_password = "Explicit-Password-2026!"
    content = workbook_bytes(
        [
            {
                "supplier_code": "SUP-700",
                "supplier_name": "Secret Supplier",
                "login_username": "secret-user",
                "login_password": chosen_password,
            }
        ]
    )
    confirm = client.post(
        "/api/v1/suppliers/import/confirm", files=_files(content), headers=headers
    )
    assert confirm.status_code == 200
    raw = confirm.text
    assert "password_hash" not in raw
    with TestSession() as session:
        user = session.scalar(select(UserORM).where(UserORM.username == "secret-user"))
        assert user is not None
        assert user.password_hash != chosen_password
        assert chosen_password not in user.password_hash
        assert verify_password(chosen_password, user.password_hash)

    rejected = client.post(
        "/api/v1/suppliers/import/confirm",
        files=_files(
            workbook_bytes(
                [
                    {
                        "supplier_code": "SUP-700",
                        "supplier_name": "Secret Supplier",
                        "login_username": "secret-user-2",
                        "login_password": chosen_password,
                    }
                ]
            )
        ),
        headers=headers,
    )
    assert rejected.json()["status"] == "rejected"
    assert chosen_password not in rejected.text
    assert "password_hash" not in rejected.text


def test_first_login_password_change_flow(import_environment) -> None:
    client, _ = import_environment
    headers = _headers(client, "import-admin")
    initial_password = "Initial-Password-2026!"
    content = workbook_bytes(
        [
            {
                "supplier_code": "SUP-800",
                "supplier_name": "Portal Supplier",
                "login_username": "portal-user",
                "login_password": initial_password,
            }
        ]
    )
    assert (
        client.post(
            "/api/v1/suppliers/import/confirm", files=_files(content), headers=headers
        ).json()["created"]
        == 1
    )

    portal = _headers(client, "portal-user", initial_password)
    profile = client.get("/api/v1/auth/me", headers=portal)
    assert profile.status_code == 200
    assert profile.json()["must_change_password"] is True
    assert "suppliers:read" in profile.json()["permissions"]

    assert (
        client.post(
            "/api/v1/auth/change-password",
            json={"current_password": initial_password, "new_password": initial_password},
            headers=portal,
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "wrong-password", "new_password": "Another-Password-2026!"},
            headers=portal,
        ).status_code
        == 400
    )
    changed = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": initial_password, "new_password": "Another-Password-2026!"},
        headers=portal,
    )
    assert changed.status_code == 200
    assert client.get("/api/v1/auth/me", headers=portal).json()["must_change_password"] is False
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"username": "portal-user", "password": "Another-Password-2026!"},
        ).status_code
        == 200
    )
