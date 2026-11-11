from collections.abc import Generator
from datetime import datetime

import pytest
from app.core import redis_client as redis_module
from app.core.security import get_password_hash
from app.db.session import get_db
from app.main import app
from app.models.quality import (
    InternalMaterialLotORM,
    IQCRecordORM,
    MaterialORM,
    MaterialReceiptORM,
    NonconformanceORM,
    SupplierLotORM,
    SupplierMaterialORM,
    SupplierORM,
)
from app.models.user import PermissionORM, RoleORM, RolePermissionORM, UserORM, UserRoleORM
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session, sessionmaker


class FakeRedis:
    async def exists(self, key: str) -> int:
        return 0

    async def set(self, key: str, value: str, ex: int) -> bool:
        return True

    async def close(self) -> None:
        return None

    async def aclose(self) -> None:
        return None


def _headers(client: TestClient, username: str, password: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def dashboard_environment(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> Generator[tuple[TestClient, sessionmaker], None, None]:
    TestSession = sessionmaker(
        bind=db_session.connection(),
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    monkeypatch.setattr(redis_module, "get_redis_client", lambda: FakeRedis())

    def override_get_db() -> Generator[Session, None, None]:
        with TestSession() as session:
            yield session

    original_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestSession.begin() as session:
            admin_role = RoleORM(name="dashboard-admin")
            supplier_role = RoleORM(name="dashboard-supplier")
            no_perm_role = RoleORM(name="dashboard-noperm")

            perm_codes = [
                "suppliers:read",
                "materials:read",
                "receipts:read",
                "iqc:read",
                "quality:review",
                "nonconformance:read",
                "nonconformance:write",
            ]
            permissions = {code: PermissionORM(code=code, name=code) for code in perm_codes}
            session.add_all([admin_role, supplier_role, no_perm_role, *permissions.values()])

            sup_a = SupplierORM(supplier_code="SUP-A", supplier_name="Supplier A", status="active")
            sup_b = SupplierORM(supplier_code="SUP-B", supplier_name="Supplier B", status="active")
            mat = MaterialORM(
                material_code="MAT-1",
                material_name="Material 1",
                material_type="raw",
                uom="pcs",
                status="active",
            )
            session.add_all([sup_a, sup_b, mat])
            session.flush()

            admin_user = UserORM(
                username="dash-admin",
                email="dash-admin@example.test",
                password_hash=get_password_hash("Dash-Password-2026!"),
                is_active=True,
            )
            supplier_user = UserORM(
                username="dash-supplier-a",
                email="dash-supplier-a@example.test",
                password_hash=get_password_hash("Dash-Password-2026!"),
                is_active=True,
                supplier_id=sup_a.id,
            )
            no_perm_user = UserORM(
                username="dash-noperm",
                email="dash-noperm@example.test",
                password_hash=get_password_hash("Dash-Password-2026!"),
                is_active=True,
            )
            session.add_all([admin_user, supplier_user, no_perm_user])
            session.flush()

            session.add_all(
                [
                    UserRoleORM(user_id=admin_user.id, role_id=admin_role.id),
                    UserRoleORM(user_id=supplier_user.id, role_id=supplier_role.id),
                    UserRoleORM(user_id=no_perm_user.id, role_id=no_perm_role.id),
                ]
            )
            for perm in permissions.values():
                session.add(RolePermissionORM(role_id=admin_role.id, permission_id=perm.id))
            for code in (
                "suppliers:read",
                "materials:read",
                "receipts:read",
                "iqc:read",
                "nonconformance:read",
            ):
                session.add(
                    RolePermissionORM(role_id=supplier_role.id, permission_id=permissions[code].id)
                )

            session.add_all(
                [
                    SupplierMaterialORM(supplier_id=sup_a.id, material_id=mat.id),
                    SupplierMaterialORM(supplier_id=sup_b.id, material_id=mat.id),
                ]
            )
            lot_a = SupplierLotORM(
                supplier_id=sup_a.id,
                material_id=mat.id,
                supplier_lot_no="LOT-A",
                qty_received=100,
                uom="pcs",
                qc_status="received",
            )
            lot_b = SupplierLotORM(
                supplier_id=sup_b.id,
                material_id=mat.id,
                supplier_lot_no="LOT-B",
                qty_received=100,
                uom="pcs",
                qc_status="received",
            )
            session.add_all([lot_a, lot_b])
            session.flush()

            rec_a1 = MaterialReceiptORM(
                supplier_id=sup_a.id,
                material_id=mat.id,
                supplier_lot_id=lot_a.id,
                receipt_no="REC-A-1",
                received_at=datetime(2026, 10, 1, 9, 0),
                received_by_user_id=admin_user.id,
                qty_received=10,
                qty_remaining=10,
                status="received",
            )
            rec_a2 = MaterialReceiptORM(
                supplier_id=sup_a.id,
                material_id=mat.id,
                supplier_lot_id=lot_a.id,
                receipt_no="REC-A-2",
                received_at=datetime(2026, 10, 2, 9, 0),
                received_by_user_id=admin_user.id,
                qty_received=20,
                qty_remaining=20,
                status="received",
            )
            rec_b1 = MaterialReceiptORM(
                supplier_id=sup_b.id,
                material_id=mat.id,
                supplier_lot_id=lot_b.id,
                receipt_no="REC-B-1",
                received_at=datetime(2026, 10, 3, 9, 0),
                received_by_user_id=admin_user.id,
                qty_received=30,
                qty_remaining=30,
                status="received",
            )
            session.add_all([rec_a1, rec_a2, rec_b1])
            session.flush()

            ilot_a_receipt = InternalMaterialLotORM(
                material_id=mat.id,
                supplier_lot_id=lot_a.id,
                receipt_id=rec_a1.id,
                internal_lot_no="ILOT-A-REC",
                qty_on_hand=10,
                qty_reserved=0,
                uom="pcs",
                lot_status="available",
            )
            ilot_a_lotonly = InternalMaterialLotORM(
                material_id=mat.id,
                supplier_lot_id=lot_a.id,
                receipt_id=None,
                internal_lot_no="ILOT-A-LOT",
                qty_on_hand=5,
                qty_reserved=0,
                uom="pcs",
                lot_status="quarantine",
            )
            ilot_b_receipt = InternalMaterialLotORM(
                material_id=mat.id,
                supplier_lot_id=lot_b.id,
                receipt_id=rec_b1.id,
                internal_lot_no="ILOT-B-REC",
                qty_on_hand=30,
                qty_reserved=0,
                uom="pcs",
                lot_status="rejected",
            )
            session.add_all([ilot_a_receipt, ilot_a_lotonly, ilot_b_receipt])
            session.flush()

            iqc_a1 = IQCRecordORM(
                receipt_id=rec_a1.id,
                internal_lot_id=ilot_a_receipt.id,
                sample_qty=1,
                inspection_result="pending",
                release_status="hold",
                review_status="pending",
            )
            iqc_a2 = IQCRecordORM(
                receipt_id=rec_a2.id,
                internal_lot_id=None,
                sample_qty=1,
                inspection_result="failed",
                release_status="rejected",
                review_status="pending",
            )
            iqc_a3 = IQCRecordORM(
                receipt_id=None,
                internal_lot_id=ilot_a_lotonly.id,
                sample_qty=1,
                inspection_result="passed",
                release_status="released",
                review_status="approved",
            )
            iqc_a4 = IQCRecordORM(
                receipt_id=rec_a1.id,
                internal_lot_id=ilot_a_receipt.id,
                sample_qty=1,
                inspection_result="passed",
                release_status="released",
                review_status="pending",
            )
            iqc_b1 = IQCRecordORM(
                receipt_id=rec_b1.id,
                internal_lot_id=ilot_b_receipt.id,
                sample_qty=1,
                inspection_result="passed",
                release_status="released",
                review_status="pending",
            )
            session.add_all([iqc_a1, iqc_a2, iqc_a3, iqc_a4, iqc_b1])

            nc_a_open = NonconformanceORM(
                case_no="NC-A-OPEN",
                title="A open",
                description="desc",
                source="iqc",
                severity="low",
                status="open",
                found_at=datetime(2026, 10, 1),
                found_by_user_id=admin_user.id,
                supplier_id=sup_a.id,
            )
            nc_a_closed = NonconformanceORM(
                case_no="NC-A-CLOSED",
                title="A closed",
                description="desc",
                source="iqc",
                severity="low",
                status="closed",
                found_at=datetime(2026, 10, 1),
                found_by_user_id=admin_user.id,
                supplier_id=sup_a.id,
                closed_at=datetime(2026, 10, 5),
            )
            nc_b_open = NonconformanceORM(
                case_no="NC-B-OPEN",
                title="B open",
                description="desc",
                source="iqc",
                severity="low",
                status="investigating",
                found_at=datetime(2026, 10, 1),
                found_by_user_id=admin_user.id,
                supplier_id=sup_b.id,
            )
            session.add_all([nc_a_open, nc_a_closed, nc_b_open])

        with TestClient(app) as client:
            yield client, TestSession
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(original_overrides)


def _make_single_perm_user(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    username: str,
    permission_code: str,
) -> tuple[TestClient, dict[str, str]]:
    TestSession = sessionmaker(
        bind=db_session.connection(),
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    monkeypatch.setattr(redis_module, "get_redis_client", lambda: FakeRedis())

    def override_get_db() -> Generator[Session, None, None]:
        with TestSession() as session:
            yield session

    app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = override_get_db

    with TestSession.begin() as session:
        role = RoleORM(name=f"{username}-role")
        perm = PermissionORM(code=permission_code, name=permission_code)
        user = UserORM(
            username=username,
            email=f"{username}@example.test",
            password_hash=get_password_hash("Dash-Password-2026!"),
            is_active=True,
        )
        session.add_all([role, perm, user])
        session.flush()
        session.add_all(
            [
                UserRoleORM(user_id=user.id, role_id=role.id),
                RolePermissionORM(role_id=role.id, permission_id=perm.id),
            ]
        )

    client = TestClient(app)
    headers = _headers(client, username, "Dash-Password-2026!")
    return client, headers


def test_dashboard_summary_internal_admin_sees_all(dashboard_environment) -> None:
    client, _ = dashboard_environment
    headers = _headers(client, "dash-admin", "Dash-Password-2026!")

    response = client.get("/api/v1/dashboard/summary", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["receipts"]["total"] == 3
    assert body["internal_lots"]["total"] == 3
    assert body["internal_lots"]["by_lot_status"]["available"] == 1
    assert body["internal_lots"]["by_lot_status"]["quarantine"] == 1
    assert body["internal_lots"]["by_lot_status"]["rejected"] == 1
    assert body["iqc"]["total"] == 5
    assert body["iqc"]["passed"] == 3
    assert body["iqc"]["failed"] == 1
    assert body["iqc"]["pending_review"] == 4
    assert body["nonconformances"]["total"] == 3
    assert body["nonconformances"]["closed"] == 1
    assert body["nonconformances"]["open"] == 2


def test_dashboard_summary_supplier_scoped_and_no_leak(dashboard_environment) -> None:
    client, _ = dashboard_environment
    headers = _headers(client, "dash-supplier-a", "Dash-Password-2026!")

    response = client.get("/api/v1/dashboard/summary", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["receipts"]["total"] == 2
    assert body["internal_lots"]["total"] == 2
    assert body["internal_lots"]["by_lot_status"] == {"available": 1, "quarantine": 1}
    assert body["iqc"]["total"] == 4
    assert body["iqc"]["passed"] == 2
    assert body["iqc"]["failed"] == 1
    assert body["iqc"]["pending_review"] == 3
    assert body["nonconformances"]["total"] == 2
    assert body["nonconformances"]["closed"] == 1
    assert body["nonconformances"]["open"] == 1


def test_dashboard_summary_only_receipts_permission(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    client, headers = _make_single_perm_user(
        db_session, monkeypatch, "only-receipts", "receipts:read"
    )
    try:
        response = client.get("/api/v1/dashboard/summary", headers=headers)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body == {"receipts": {"total": 0}}
    finally:
        app.dependency_overrides.clear()


def test_dashboard_summary_only_materials_permission(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    client, headers = _make_single_perm_user(
        db_session, monkeypatch, "only-materials", "materials:read"
    )
    try:
        response = client.get("/api/v1/dashboard/summary", headers=headers)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body == {"internal_lots": {"total": 0, "by_lot_status": {}}}
    finally:
        app.dependency_overrides.clear()


def test_dashboard_summary_only_iqc_permission(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    client, headers = _make_single_perm_user(db_session, monkeypatch, "only-iqc", "iqc:read")
    try:
        response = client.get("/api/v1/dashboard/summary", headers=headers)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body == {"iqc": {"total": 0, "pending_review": 0, "passed": 0, "failed": 0}}
    finally:
        app.dependency_overrides.clear()


def test_dashboard_summary_only_nonconformance_permission(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    client, headers = _make_single_perm_user(
        db_session, monkeypatch, "only-nc", "nonconformance:read"
    )
    try:
        response = client.get("/api/v1/dashboard/summary", headers=headers)
        assert response.status_code == 200, response.text
        body = response.json()
        assert body == {"nonconformances": {"total": 0, "open": 0, "closed": 0}}
    finally:
        app.dependency_overrides.clear()


def test_dashboard_summary_unauthorized(dashboard_environment) -> None:
    client, _ = dashboard_environment

    assert client.get("/api/v1/dashboard/summary").status_code == 401

    headers = _headers(client, "dash-noperm", "Dash-Password-2026!")
    assert client.get("/api/v1/dashboard/summary", headers=headers).status_code == 403


def test_dashboard_summary_does_not_query_unauthorized_blocks(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    client, headers = _make_single_perm_user(
        db_session, monkeypatch, "only-receipts-q", "receipts:read"
    )
    statements: list[str] = []

    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(db_session.bind, "before_cursor_execute", before_cursor_execute)
    try:
        response = client.get("/api/v1/dashboard/summary", headers=headers)
        assert response.status_code == 200, response.text
        joined = "\n".join(statements).lower()
        assert "material_receipts" in joined
        assert "internal_material_lots" not in joined
        assert "iqc_records" not in joined
        assert "nonconformances" not in joined
    finally:
        event.remove(db_session.bind, "before_cursor_execute", before_cursor_execute)
        app.dependency_overrides.clear()
