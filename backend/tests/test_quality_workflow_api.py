from collections.abc import Generator
from datetime import datetime

import pytest
from app.core import redis_client as redis_module
from app.core.security import get_password_hash
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.quality import (
    InternalMaterialLotORM,
    MaterialORM,
    MaterialReceiptORM,
    SupplierLotORM,
    SupplierMaterialORM,
    SupplierORM,
)
from app.models.user import PermissionORM, RoleORM, RolePermissionORM, UserORM, UserRoleORM
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool


class FakeRedis:
    def exists(self, key: str) -> int:
        return 0


def _headers(client: TestClient, username: str, password: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def quality_environment(monkeypatch) -> Generator[tuple[TestClient, sessionmaker], None, None]:
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
        ]
        admin_role = RoleORM(name="quality-admin")
        user = UserORM(
            username="quality-admin",
            email="quality-admin@example.test",
            password_hash=get_password_hash("Quality-Test-Password-2026!"),
            is_active=True,
        )
        session.add_all([*permissions, admin_role, user])
        session.flush()
        session.add_all(
            [
                UserRoleORM(user_id=user.id, role_id=admin_role.id),
                *[
                    RolePermissionORM(role_id=admin_role.id, permission_id=permission.id)
                    for permission in permissions
                ],
            ]
        )
        supplier = SupplierORM(
            supplier_code="SUP-100",
            supplier_name="Harbor Industrial",
            status="active",
            country="Taiwan",
        )
        material = MaterialORM(
            material_code="MAT-100",
            material_name="Copper Busbar",
            material_type="metal",
            spec="C1100",
            uom="pcs",
            status="active",
        )
        session.add_all([supplier, material])
        session.flush()
        session.add_all(
            [
                SupplierMaterialORM(
                    supplier_id=supplier.id,
                    material_id=material.id,
                    supplier_material_code="HB-CU-100",
                    is_preferred=True,
                ),
                SupplierLotORM(
                    supplier_id=supplier.id,
                    material_id=material.id,
                    supplier_lot_no="LOT-100",
                    qty_received=50,
                    uom="pcs",
                    qc_status="received",
                    manufacturing_date=datetime(2026, 8, 1),
                    expiry_date=datetime(2027, 8, 1),
                ),
            ]
        )
        session.flush()
        receipt = MaterialReceiptORM(
            supplier_id=supplier.id,
            material_id=material.id,
            supplier_lot_id=session.query(SupplierLotORM).filter_by(supplier_lot_no="LOT-100").one().id,
            receipt_no="REC-100",
            received_at=datetime(2026, 10, 1, 9, 30),
            received_by_user_id=user.id,
            qty_received=50,
            qty_remaining=50,
            status="received",
        )
        session.add(receipt)
        session.flush()
        session.add(
            InternalMaterialLotORM(
                material_id=material.id,
                supplier_lot_id=receipt.supplier_lot_id,
                receipt_id=receipt.id,
                internal_lot_no="ILT-100",
                qty_on_hand=50,
                qty_reserved=0,
                uom="pcs",
                lot_status="available",
            )
        )
        session.flush()

    client = TestClient(app)
    try:
        yield client, TestSession
    finally:
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(test_engine)
        test_engine.dispose()


def test_receipt_and_iqc_flow_quality_environment(quality_environment) -> None:
    client, _ = quality_environment
    headers = _headers(client, "quality-admin", "Quality-Test-Password-2026!")

    listing = client.get("/api/v1/receipts?status=received", headers=headers)
    assert listing.status_code == 200, listing.text
    assert listing.json()["total"] >= 1

    created = client.post(
        "/api/v1/receipts",
        json={
            "supplier_id": 1,
            "material_id": 1,
            "supplier_lot_id": 1,
            "receipt_no": "REC-200",
            "qty_received": "12.5000",
            "received_at": "2026-10-19T09:00:00Z",
            "notes": "test receipt",
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    assert created.json()["qty_remaining"] == "12.5000"

    split = client.post(
        f"/api/v1/receipts/{created.json()['id']}/internal-lots",
        json={"internal_lot_no": "ILT-200", "qty": "8.5000"},
        headers=headers,
    )
    assert split.status_code == 201, split.text
    assert split.json()["qty_on_hand"] == "8.5000"

    iqc = client.post(
        "/api/v1/iqc",
        json={
            "internal_lot_id": split.json()["id"],
            "sample_qty": "1.0000",
            "inspection_result": "passed",
            "inspection_date": "2026-10-19T10:00:00Z",
            "release_status": "released",
            "remarks": "accepted",
        },
        headers=headers,
    )
    assert iqc.status_code == 201, iqc.text
    assert iqc.json()["inspector_user_id"] == 1

    detail = client.get("/api/v1/internal-lots/2", headers=headers)
    assert detail.status_code == 200, detail.text
    assert detail.json()["lot_status"] == "available"

    patch = client.patch(
        f"/api/v1/iqc/{iqc.json()['id']}",
        json={"inspection_result": "failed", "release_status": "rejected"},
        headers=headers,
    )
    assert patch.status_code == 200, patch.text
    assert patch.json()["inspection_result"] == "failed"
    assert patch.json()["release_status"] == "rejected"
