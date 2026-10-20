from collections.abc import Generator
from io import BytesIO

import pytest
from app.core import redis_client as redis_module
from app.core.security import get_password_hash, verify_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.quality import (
    InternalMaterialLotORM,
    IQCRecordORM,
    MaterialORM,
    MaterialReceiptORM,
    SupplierLotORM,
    SupplierMaterialORM,
    SupplierORM,
    SupplierQualificationDocumentORM,
)
from app.models.user import PermissionORM, RoleORM, RolePermissionORM, UserORM, UserRoleORM
from app.services import supplier_import
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

PASSWORD = "Supplier-Isolation-2026!"
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class FakeRedis:
    def exists(self, key: str) -> int:
        return 0


def _headers(client: TestClient, username: str, password: str = PASSWORD) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _workbook(rows: list[dict[str, object]]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "suppliers"
    sheet.append(list(supplier_import.TEMPLATE_HEADERS))
    for row in rows:
        sheet.append([row.get(column) for column in supplier_import.TEMPLATE_HEADERS])
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


@pytest.fixture
def isolation_environment(monkeypatch) -> Generator[tuple[TestClient, sessionmaker], None, None]:
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
            PermissionORM(code="materials:read", name="Read materials"),
            PermissionORM(code="materials:write", name="Manage materials"),
            PermissionORM(code="receipts:read", name="Read receipts"),
            PermissionORM(code="receipts:write", name="Create receipts"),
            PermissionORM(code="iqc:read", name="Read IQC"),
            PermissionORM(code="iqc:write", name="Manage IQC"),
            PermissionORM(code="supplier-lots:write", name="Create supplier lots"),
        ]
        admin_role = RoleORM(name="isolation-admin")
        portal_role = RoleORM(name="isolation-portal")
        session.add_all([*permissions, admin_role, portal_role])
        session.add_all(
            [
                SupplierORM(id=1, supplier_code="SUP-A", supplier_name="Supplier A", status="active"),
                SupplierORM(id=2, supplier_code="SUP-B", supplier_name="Supplier B", status="active"),
                SupplierORM(id=3, supplier_code="SUP-C", supplier_name="Supplier C", status="active"),
            ]
        )
        session.add(MaterialORM(id=1, material_code="MAT-1", material_name="Resin", material_type="raw", uom="kg"))
        session.flush()

        admin = UserORM(
            username="isolation-admin",
            email="isolation-admin@example.test",
            password_hash=get_password_hash(PASSWORD),
            is_active=True,
        )
        portal_a = UserORM(
            username="portal-a",
            email="portal-a@example.test",
            password_hash=get_password_hash(PASSWORD),
            is_active=True,
            supplier_id=1,
            must_change_password=False,
        )
        portal_b = UserORM(
            username="portal-b",
            email="portal-b@example.test",
            password_hash=get_password_hash(PASSWORD),
            is_active=True,
            supplier_id=2,
            must_change_password=False,
        )
        pending = UserORM(
            username="portal-pending",
            email="portal-pending@example.test",
            password_hash=get_password_hash(PASSWORD),
            is_active=True,
            supplier_id=3,
            must_change_password=True,
        )
        session.add_all([admin, portal_a, portal_b, pending])
        session.flush()
        session.add_all(
            [
                UserRoleORM(user_id=admin.id, role_id=admin_role.id),
                UserRoleORM(user_id=portal_a.id, role_id=portal_role.id),
                UserRoleORM(user_id=portal_b.id, role_id=portal_role.id),
                UserRoleORM(user_id=pending.id, role_id=portal_role.id),
                *[
                    RolePermissionORM(role_id=admin_role.id, permission_id=permission.id)
                    for permission in permissions
                ],
                RolePermissionORM(
                    role_id=portal_role.id,
                    permission_id=next(p.id for p in permissions if p.code == "suppliers:read"),
                ),
            ]
        )
        session.add_all(
            [
                SupplierLotORM(id=1, supplier_id=1, material_id=1, supplier_lot_no="LOT-A", uom="kg"),
                SupplierLotORM(id=2, supplier_id=2, material_id=1, supplier_lot_no="LOT-B", uom="kg"),
                SupplierQualificationDocumentORM(supplier_id=2, doc_type="ISO", doc_name="B Certificate"),
            ]
        )

    client = TestClient(app)
    try:
        yield client, TestSession
    finally:
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(test_engine)
        test_engine.dispose()


def test_internal_admin_still_sees_everything(isolation_environment) -> None:
    client, _ = isolation_environment
    headers = _headers(client, "isolation-admin")
    listing = client.get("/api/v1/suppliers", headers=headers)
    assert listing.status_code == 200
    assert listing.json()["total"] == 3
    assert client.get("/api/v1/suppliers/2", headers=headers).status_code == 200


def test_supplier_list_is_scoped_to_own_supplier(isolation_environment) -> None:
    client, _ = isolation_environment
    headers = _headers(client, "portal-a")
    listing = client.get("/api/v1/suppliers", headers=headers)
    assert listing.status_code == 200
    body = listing.json()
    assert body["total"] == 1
    assert [item["id"] for item in body["items"]] == [1]


def test_supplier_cannot_read_other_supplier_records(isolation_environment) -> None:
    client, _ = isolation_environment
    headers = _headers(client, "portal-a")
    assert client.get("/api/v1/suppliers/1", headers=headers).status_code == 200
    assert client.get("/api/v1/suppliers/2", headers=headers).status_code == 403
    assert client.get("/api/v1/suppliers/1/documents", headers=headers).status_code == 200
    assert client.get("/api/v1/suppliers/2/documents", headers=headers).status_code == 403
    assert client.get("/api/v1/suppliers/2/documents/1", headers=headers).status_code == 403
    assert (
        client.get(
            "/api/v1/suppliers/2/documents/1/attachments",
            headers=headers,
        ).status_code
        == 403
    )
    assert (
        client.get(
            "/api/v1/suppliers/2/documents/1/attachments/1/download",
            headers=headers,
        ).status_code
        == 403
    )
    assert client.post(
        "/api/v1/suppliers/1/documents",
        json={"doc_type": "ISO", "doc_name": "Portal should not create"},
        headers=headers,
    ).status_code == 403


def test_supplier_lot_writer_is_still_limited_to_own_supplier(isolation_environment) -> None:
    client, TestSession = isolation_environment
    with TestSession.begin() as session:
        portal_role = session.scalar(select(RoleORM).where(RoleORM.name == "isolation-portal"))
        lot_write = session.scalar(
            select(PermissionORM).where(PermissionORM.code == "supplier-lots:write")
        )
        session.add(RolePermissionORM(role_id=portal_role.id, permission_id=lot_write.id))
        session.add(SupplierMaterialORM(supplier_id=1, material_id=1))

    headers = _headers(client, "portal-a")
    own_lot = client.post(
        "/api/v1/supplier-lots",
        json={
            "supplier_id": 1,
            "material_id": 1,
            "supplier_lot_no": "PORTAL-OWN-LOT",
            "qty_received": "1.0000",
        },
        headers=headers,
    )
    assert own_lot.status_code == 201, own_lot.text
    cross_supplier_lot = client.post(
        "/api/v1/supplier-lots",
        json={
            "supplier_id": 2,
            "material_id": 1,
            "supplier_lot_no": "PORTAL-CROSS-LOT",
            "qty_received": "1.0000",
        },
        headers=headers,
    )
    assert cross_supplier_lot.status_code == 403
    assert client.post(
        "/api/v1/supplier-lots",
        json={"supplier_id": 1, "material_id": 1, "supplier_lot_no": "PORTAL-NO-LOT", "qty_received": "1"},
        headers=headers,
    ).status_code == 403


def test_supplier_document_and_traceability_operations_remain_scoped(isolation_environment) -> None:
    client, TestSession = isolation_environment
    with TestSession.begin() as session:
        portal_role = session.scalar(select(RoleORM).where(RoleORM.name == "isolation-portal"))
        permissions = {item.code: item for item in session.scalars(select(PermissionORM)).all()}
        for code in ("materials:read", "receipts:read", "iqc:read"):
            session.add(RolePermissionORM(role_id=portal_role.id, permission_id=permissions[code].id))
        session.add_all(
            [
                MaterialReceiptORM(
                    supplier_id=1,
                    material_id=1,
                    supplier_lot_id=1,
                    receipt_no="TRACE-SCOPE-A",
                    received_at=__import__("datetime").datetime(2026, 10, 1, 9, 0),
                    qty_received=5,
                    qty_remaining=5,
                ),
                MaterialReceiptORM(
                    supplier_id=2,
                    material_id=1,
                    supplier_lot_id=2,
                    receipt_no="TRACE-SCOPE-B",
                    received_at=__import__("datetime").datetime(2026, 10, 1, 9, 0),
                    qty_received=5,
                    qty_remaining=5,
                ),
            ]
        )

    headers = _headers(client, "portal-a")
    assert client.get("/api/v1/traceability?receipt_no=TRACE-SCOPE-A", headers=headers).status_code == 200
    assert client.get("/api/v1/traceability?receipt_no=TRACE-SCOPE-B", headers=headers).status_code == 404
    assert client.get("/api/v1/traceability?material_code=MAT-1", headers=headers).json()["total"] == 1


def test_supplier_lots_are_scoped_to_own_supplier(isolation_environment) -> None:
    client, _ = isolation_environment
    headers = _headers(client, "portal-a")
    listing = client.get("/api/v1/supplier-lots", headers=headers)
    assert listing.status_code == 200
    body = listing.json()
    assert body["total"] == 1
    assert {item["supplier_id"] for item in body["items"]} == {1}

    admin_headers = _headers(client, "isolation-admin")
    admin_listing = client.get("/api/v1/supplier-lots", headers=admin_headers)
    assert admin_listing.json()["total"] == 2


def test_supplier_cannot_reach_internal_admin_endpoints(isolation_environment) -> None:
    client, _ = isolation_environment
    headers = _headers(client, "portal-a")
    for path in ("/api/v1/materials", "/api/v1/receipts", "/api/v1/internal-lots", "/api/v1/iqc"):
        assert client.get(path, headers=headers).status_code == 403, path
    assert (
        client.post(
            "/api/v1/suppliers",
            json={"supplier_code": "SUP-X", "supplier_name": "Nope"},
            headers=headers,
        ).status_code
        == 403
    )


def test_supplier_cannot_read_internal_records_by_id(isolation_environment) -> None:
    client, _ = isolation_environment
    headers = _headers(client, "portal-a")
    for path in (
        "/api/v1/materials/1/suppliers",
        "/api/v1/materials/1",
        "/api/v1/receipts/1",
        "/api/v1/internal-lots/1",
        "/api/v1/iqc/1",
    ):
        assert client.get(path, headers=headers).status_code == 403, path


def test_must_change_password_blocks_protected_endpoints(isolation_environment) -> None:
    client, _ = isolation_environment
    headers = _headers(client, "portal-pending")
    profile = client.get("/api/v1/auth/me", headers=headers)
    assert profile.status_code == 200
    assert profile.json()["must_change_password"] is True

    blocked = client.get("/api/v1/suppliers", headers=headers)
    assert blocked.status_code == 403
    assert "Password change required" in blocked.json()["detail"]

    changed = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": PASSWORD, "new_password": "Brand-New-Password-2026!"},
        headers=headers,
    )
    assert changed.status_code == 200
    assert client.get("/api/v1/suppliers", headers=headers).status_code == 200


def test_change_password_only_affects_the_caller(isolation_environment) -> None:
    client, TestSession = isolation_environment
    headers = _headers(client, "portal-a")
    new_password = "Portal-A-New-Password-2026!"
    changed = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": PASSWORD, "new_password": new_password},
        headers=headers,
    )
    assert changed.status_code == 200
    assert _headers(client, "portal-a", new_password)
    assert client.post(
        "/api/v1/auth/login", json={"username": "portal-a", "password": PASSWORD}
    ).status_code == 401
    assert client.post(
        "/api/v1/auth/login", json={"username": "portal-b", "password": PASSWORD}
    ).status_code == 200


def test_supplier_portal_requires_supplier_scope_on_material_and_receipt_detail_ids(
    isolation_environment,
) -> None:
    client, TestSession = isolation_environment

    with TestSession.begin() as session:
        portal_role = session.scalar(select(RoleORM).where(RoleORM.name == "isolation-portal"))
        permissions = session.scalars(select(PermissionORM)).all()
        material_read = next(item for item in permissions if item.code == "materials:read")
        receipts_read = next(item for item in permissions if item.code == "receipts:read")
        session.add_all(
            [
                SupplierMaterialORM(
                    supplier_id=1,
                    material_id=1,
                    supplier_material_code="SUP-A-MAT-1",
                    is_preferred=True,
                ),
                MaterialReceiptORM(
                    supplier_id=1,
                    material_id=1,
                    supplier_lot_id=1,
                    receipt_no="REC-SUP-A-1",
                    received_at=__import__("datetime").datetime(2026, 10, 1, 9, 0),
                    received_by_user_id=1,
                    qty_received=5,
                    qty_remaining=5,
                    status="received",
                ),
                RolePermissionORM(role_id=portal_role.id, permission_id=material_read.id),
                RolePermissionORM(role_id=portal_role.id, permission_id=receipts_read.id),
            ]
        )

    portal_a = _headers(client, "portal-a")
    portal_b = _headers(client, "portal-b")

    assert client.get("/api/v1/materials/1", headers=portal_a).status_code == 200
    assert client.get("/api/v1/materials/1", headers=portal_b).status_code == 403

    assert client.get("/api/v1/receipts/1", headers=portal_a).status_code == 200
    assert client.get("/api/v1/receipts/1", headers=portal_b).status_code == 403
    with TestSession() as session:
        portal_b = session.scalar(select(UserORM).where(UserORM.username == "portal-b"))
        assert portal_b is not None
        assert verify_password(PASSWORD, portal_b.password_hash)


def test_supplier_scoped_workflow_ids_and_iqc_lists(isolation_environment) -> None:
    client, TestSession = isolation_environment
    with TestSession.begin() as session:
        portal_role = session.scalar(select(RoleORM).where(RoleORM.name == "isolation-portal"))
        permissions = {item.code: item for item in session.scalars(select(PermissionORM)).all()}
        for code in ("materials:read", "receipts:read", "receipts:write", "iqc:read", "iqc:write"):
            session.add(RolePermissionORM(role_id=portal_role.id, permission_id=permissions[code].id))
        session.add(SupplierMaterialORM(supplier_id=2, material_id=1))
        receipt_a = MaterialReceiptORM(
            supplier_id=1,
            material_id=1,
            supplier_lot_id=1,
            receipt_no="REC-SCOPE-A",
            received_at=__import__("datetime").datetime(2026, 10, 1, 9, 0),
            qty_received=5,
            qty_remaining=5,
            status="received",
        )
        receipt_b = MaterialReceiptORM(
            supplier_id=2,
            material_id=1,
            supplier_lot_id=2,
            receipt_no="REC-SCOPE-B",
            received_at=__import__("datetime").datetime(2026, 10, 1, 9, 0),
            qty_received=5,
            qty_remaining=5,
            status="received",
        )
        session.add_all([receipt_a, receipt_b])
        session.flush()
        lot_a = InternalMaterialLotORM(
            material_id=1, supplier_lot_id=1, receipt_id=receipt_a.id,
            internal_lot_no="ILT-SCOPE-A", qty_on_hand=5, qty_reserved=0,
            uom="kg", lot_status="quarantine",
        )
        lot_b = InternalMaterialLotORM(
            material_id=1, supplier_lot_id=2, receipt_id=receipt_b.id,
            internal_lot_no="ILT-SCOPE-B", qty_on_hand=5, qty_reserved=0,
            uom="kg", lot_status="quarantine",
        )
        session.add_all([lot_a, lot_b])
        session.flush()
        session.add_all([
            IQCRecordORM(internal_lot_id=lot_a.id, sample_qty=1, inspection_result="pending", release_status="hold"),
            IQCRecordORM(internal_lot_id=lot_b.id, sample_qty=1, inspection_result="pending", release_status="hold"),
        ])
        session.flush()
        ids = {"receipt_a": receipt_a.id, "receipt_b": receipt_b.id, "lot_a": lot_a.id, "lot_b": lot_b.id}
        iqc_ids = session.scalars(select(IQCRecordORM.id).order_by(IQCRecordORM.id)).all()
        ids["iqc_a"], ids["iqc_b"] = iqc_ids[-2:]

    portal_a = _headers(client, "portal-a")
    other_receipt = client.post(
        "/api/v1/receipts",
        json={
            "supplier_id": 2, "material_id": 1, "supplier_lot_id": 2,
            "receipt_no": "REC-CROSS-SUPPLIER", "qty_received": "1",
            "received_at": "2026-10-19T09:00:00Z",
        },
        headers=portal_a,
    )
    assert other_receipt.status_code == 403
    assert client.get(f"/api/v1/receipts/{ids['receipt_a']}/trace", headers=portal_a).status_code == 200
    assert client.get(f"/api/v1/receipts/{ids['receipt_b']}/trace", headers=portal_a).status_code == 403

    iqc_list = client.get("/api/v1/iqc", headers=portal_a)
    assert iqc_list.status_code == 200
    assert [item["id"] for item in iqc_list.json()["items"]] == [ids["iqc_a"]]
    assert client.get(f"/api/v1/iqc/{ids['iqc_b']}", headers=portal_a).status_code == 403
    assert client.post(
        "/api/v1/iqc",
        json={"internal_lot_id": ids["lot_b"], "sample_qty": "1", "inspection_result": "pending", "release_status": "hold"},
        headers=portal_a,
    ).status_code == 403
    assert client.patch(
        f"/api/v1/iqc/{ids['iqc_a']}",
        json={"internal_lot_id": ids["lot_b"]},
        headers=portal_a,
    ).status_code == 403


def test_preview_does_not_write_to_database(isolation_environment) -> None:
    client, TestSession = isolation_environment
    headers = _headers(client, "isolation-admin")
    content = _workbook(
        [{"supplier_code": "SUP-900", "supplier_name": "Preview Only", "login_username": "preview-user"}]
    )
    preview = client.post(
        "/api/v1/suppliers/import/preview",
        files={"file": ("suppliers.xlsx", content, XLSX_MEDIA_TYPE)},
        headers=headers,
    )
    assert preview.status_code == 200
    assert preview.json()["valid_rows"] == 1
    with TestSession() as session:
        assert session.scalar(select(func.count()).select_from(SupplierORM)) == 3
        assert session.scalar(select(UserORM).where(UserORM.username == "preview-user")) is None
