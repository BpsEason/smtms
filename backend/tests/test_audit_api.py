import csv
import io
from collections.abc import Generator

import pytest
from app.api.routes.audit import _audit_csv, _filtered_statement
from app.core import redis_client
from app.core.security import get_password_hash
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.audit import AuditLogORM
from app.models.quality import MaterialORM
from app.models.user import PermissionORM, RoleORM, RolePermissionORM, UserORM, UserRoleORM
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool


class FakeRedis:
    def exists(self, _key: str) -> int:
        return 0


@pytest.fixture
def audit_environment(monkeypatch) -> Generator[tuple[TestClient, sessionmaker], None, None]:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(redis_client, "get_redis_client", lambda: FakeRedis())

    def override_db() -> Generator[Session, None, None]:
        with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    with sessions.begin() as db:
        permission = PermissionORM(code="audit:read", name="Read audit logs")
        write_permission = PermissionORM(code="materials:write", name="Write materials")
        supplier_write_permission = PermissionORM(code="suppliers:write", name="Write suppliers")
        role = RoleORM(name="auditor")
        writer_role = RoleORM(name="writer")
        db.add_all([permission, write_permission, supplier_write_permission, role, writer_role])
        db.flush()
        user = UserORM(
            username="auditor",
            password_hash=get_password_hash("Audit-Test-Password!"),
            is_active=True,
        )
        writer = UserORM(
            username="writer",
            password_hash=get_password_hash("Writer-Test-Password!"),
            is_active=True,
        )
        db.add_all([user, writer])
        db.flush()
        db.add_all(
            [
                UserRoleORM(user_id=user.id, role_id=role.id),
                UserRoleORM(user_id=writer.id, role_id=writer_role.id),
                RolePermissionORM(role_id=role.id, permission_id=permission.id),
                RolePermissionORM(role_id=writer_role.id, permission_id=write_permission.id),
                RolePermissionORM(
                    role_id=writer_role.id, permission_id=supplier_write_permission.id
                ),
            ]
        )
    client = TestClient(app)
    yield client, sessions
    client.close()
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(engine)
    engine.dispose()


def _login(client: TestClient, username: str, password: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_audit_api_requires_permission_and_returns_filtered_events(audit_environment) -> None:
    client, _sessions = audit_environment
    writer = _login(client, "writer", "Writer-Test-Password!")
    denied = client.get("/api/v1/audit-logs", headers=writer)
    assert denied.status_code == 403

    headers = _login(client, "auditor", "Audit-Test-Password!")
    response = client.post(
        "/api/v1/materials",
        headers=writer,
        json={
            "material_code": "AUDIT-MAT",
            "material_name": "Audit material",
            "material_type": "metal",
            "uom": "pcs",
        },
    )
    assert response.status_code == 201, response.text
    filtered = client.get(
        "/api/v1/audit-logs",
        headers=headers,
        params={
            "resource_type": "materials",
            "resource_id": str(response.json()["id"]),
            "action": "CREATE",
        },
    )
    assert filtered.status_code == 200
    event = filtered.json()["items"][0]
    assert event["actor_user_id"] is not None
    assert event["after_data"]["material_code"] == "AUDIT-MAT"
    assert event["created_at"]
    assert client.delete("/api/v1/audit-logs", headers=headers).status_code == 405

    suppliers = []
    for code in ("AUDIT-SUP-1", "AUDIT-SUP-2"):
        created_supplier = client.post(
            "/api/v1/suppliers",
            headers=writer,
            json={"supplier_code": code, "supplier_name": code},
        )
        assert created_supplier.status_code == 201, created_supplier.text
        suppliers.append(created_supplier.json())
    first_link = client.post(
        f"/api/v1/suppliers/{suppliers[0]['id']}/materials",
        headers=writer,
        json={"material_id": response.json()["id"], "is_preferred": True},
    )
    assert first_link.status_code == 201, first_link.text
    second_link = client.post(
        f"/api/v1/suppliers/{suppliers[1]['id']}/materials",
        headers=writer,
        json={"material_id": response.json()["id"], "is_preferred": True},
    )
    assert second_link.status_code == 201, second_link.text
    cleared_preferred = client.get(
        "/api/v1/audit-logs",
        headers=headers,
        params={
            "resource_type": "supplier_materials",
            "resource_id": str(first_link.json()["id"]),
            "action": "UPDATE",
        },
    )
    assert cleared_preferred.status_code == 200
    assert cleared_preferred.json()["items"][0]["before_data"]["is_preferred"] is True
    assert cleared_preferred.json()["items"][0]["after_data"]["is_preferred"] is False
    login_events = client.get(
        "/api/v1/audit-logs",
        headers=headers,
        params={"resource_type": "users", "action": "LOGIN"},
    )
    assert login_events.status_code == 200
    assert any(item["after_data"]["result"] == "success" for item in login_events.json()["items"])


def test_audit_commit_rolls_back_with_business_change_and_secrets_are_filtered(
    audit_environment,
) -> None:
    _client, sessions = audit_environment
    with sessions() as db:
        db.info["audit_actor_id"] = 8
        material = MaterialORM(
            material_code="ROLLBACK", material_name="Will roll back", material_type="raw", uom="pcs"
        )
        db.add(material)
        db.flush()
        db.add(
            MaterialORM(
                material_code="ROLLBACK", material_name="Duplicate", material_type="raw", uom="pcs"
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
        valid_after_failure = MaterialORM(
            material_code="AFTER-ROLLBACK",
            material_name="Valid after rollback",
            material_type="raw",
            uom="pcs",
        )
        db.add(valid_after_failure)
        db.commit()
        valid_id = valid_after_failure.id
        valid_after_failure.material_name = "Updated after rollback"
        db.commit()
        db.delete(valid_after_failure)
        db.commit()
    with sessions() as db:
        assert db.scalar(select(MaterialORM).where(MaterialORM.material_code == "ROLLBACK")) is None
        failed_audit = db.scalar(
            select(AuditLogORM).where(
                AuditLogORM.after_data["material_code"].as_string() == "ROLLBACK"
            )
        )
        assert failed_audit is None
        assert (
            db.scalar(select(AuditLogORM).where(AuditLogORM.resource_id == str(valid_id)))
            is not None
        )
        update_audit = db.scalar(
            select(AuditLogORM).where(
                AuditLogORM.resource_id == str(valid_id), AuditLogORM.action == "UPDATE"
            )
        )
        assert update_audit is not None
        assert update_audit.before_data == {"material_name": "Valid after rollback"}
        assert update_audit.after_data == {"material_name": "Updated after rollback"}
        delete_audit = db.scalar(
            select(AuditLogORM).where(
                AuditLogORM.resource_id == str(valid_id), AuditLogORM.action == "DELETE"
            )
        )
        assert delete_audit is not None
        assert delete_audit.before_data["material_name"] == "Updated after rollback"

        db.info["audit_actor_id"] = 8
        secret_user = UserORM(
            username="secret-check", password_hash="password-hash-value", is_active=True
        )
        db.add(secret_user)
        db.commit()
        log = db.scalar(select(AuditLogORM).where(AuditLogORM.resource_id == str(secret_user.id)))
        assert log is not None
        assert "password_hash" not in (log.after_data or {})


def test_audit_csv_export_quotes_content_and_neutralizes_formula_injection(
    audit_environment,
) -> None:
    _client, sessions = audit_environment
    with sessions.begin() as db:
        db.add(
            AuditLogORM(
                actor_user_id=None,
                action="CREATE",
                resource_type="=2+3",
                resource_id='row,"quoted"',
                before_data=None,
                after_data={"name": '=HYPERLINK("https://example.test")'},
            )
        )
    with sessions() as db:
        statement = _filtered_statement(
            resource_type=None,
            resource_id=None,
            actor_user_id=None,
            actor_username=None,
            action=None,
            start_at=None,
            end_at=None,
        )
        contents = "".join(_audit_csv(db, statement))
    rows = list(csv.reader(io.StringIO(contents.lstrip("\ufeff"))))
    assert rows[0] == ["操作時間", "操作者", "操作類型", "資源類型", "資源 ID", "異動前", "異動後"]
    exported = next(row for row in rows[1:] if row[2] == "CREATE")
    assert exported[3] == "'=2+3"
    assert exported[4] == 'row,"quoted"'
    assert exported[6].startswith("{")
    assert "=HYPERLINK" in exported[6]
