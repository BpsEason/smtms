from collections.abc import Generator
from datetime import datetime, timezone

import pytest
from app.core import redis_client as redis_module
from app.core.security import get_password_hash
from app.db.session import get_db
from app.main import app
from app.models.quality import (
    IQCRecordORM,
    MaterialORM,
    MaterialReceiptORM,
    SupplierLotORM,
    SupplierMaterialORM,
    SupplierORM,
)
from app.models.user import PermissionORM, RoleORM, RolePermissionORM, UserORM, UserRoleORM
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

UTC = timezone.utc


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
def quality_trend_environment(
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
            admin_role = RoleORM(name="trend-admin")
            supplier_role = RoleORM(name="trend-supplier")
            no_perm_role = RoleORM(name="trend-noperm")
            iqc_only_role = RoleORM(name="trend-iqc-only")

            perm_codes = ["suppliers:read", "materials:read", "receipts:read", "iqc:read"]
            permissions = {code: PermissionORM(code=code, name=code) for code in perm_codes}
            session.add_all(
                [
                    admin_role,
                    supplier_role,
                    no_perm_role,
                    iqc_only_role,
                    *permissions.values(),
                ]
            )

            sup_a = SupplierORM(
                supplier_code="TREND-A", supplier_name="Trend Supplier A", status="active"
            )
            sup_b = SupplierORM(
                supplier_code="TREND-B", supplier_name="Trend Supplier B", status="active"
            )
            mat = MaterialORM(
                material_code="TREND-MAT",
                material_name="Trend Material",
                material_type="raw",
                uom="pcs",
                status="active",
            )
            session.add_all([sup_a, sup_b, mat])
            session.flush()

            admin_user = UserORM(
                username="trend-admin",
                email="trend-admin@example.test",
                password_hash=get_password_hash("Trend-Password-2026!"),
                is_active=True,
            )
            supplier_user = UserORM(
                username="trend-supplier-a",
                email="trend-supplier-a@example.test",
                password_hash=get_password_hash("Trend-Password-2026!"),
                is_active=True,
                supplier_id=sup_a.id,
            )
            no_perm_user = UserORM(
                username="trend-noperm",
                email="trend-noperm@example.test",
                password_hash=get_password_hash("Trend-Password-2026!"),
                is_active=True,
            )
            iqc_only_user = UserORM(
                username="trend-iqc-only",
                email="trend-iqc-only@example.test",
                password_hash=get_password_hash("Trend-Password-2026!"),
                is_active=True,
            )
            session.add_all([admin_user, supplier_user, no_perm_user, iqc_only_user])
            session.flush()

            session.add_all(
                [
                    UserRoleORM(user_id=admin_user.id, role_id=admin_role.id),
                    UserRoleORM(user_id=supplier_user.id, role_id=supplier_role.id),
                    UserRoleORM(user_id=no_perm_user.id, role_id=no_perm_role.id),
                    UserRoleORM(user_id=iqc_only_user.id, role_id=iqc_only_role.id),
                ]
            )
            for perm in permissions.values():
                session.add(RolePermissionORM(role_id=admin_role.id, permission_id=perm.id))
            for code in ("suppliers:read", "materials:read", "receipts:read", "iqc:read"):
                session.add(
                    RolePermissionORM(role_id=supplier_role.id, permission_id=permissions[code].id)
                )
            session.add(
                RolePermissionORM(
                    role_id=iqc_only_role.id, permission_id=permissions["iqc:read"].id
                )
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
                supplier_lot_no="TREND-LOT-A",
                qty_received=100,
                uom="pcs",
                qc_status="received",
            )
            lot_b = SupplierLotORM(
                supplier_id=sup_b.id,
                material_id=mat.id,
                supplier_lot_no="TREND-LOT-B",
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
                receipt_no="TREND-REC-A-1",
                received_at=datetime(2026, 1, 5, 9, 0, tzinfo=UTC),
                received_by_user_id=admin_user.id,
                qty_received=10,
                qty_remaining=10,
                status="received",
            )
            rec_a2 = MaterialReceiptORM(
                supplier_id=sup_a.id,
                material_id=mat.id,
                supplier_lot_id=lot_a.id,
                receipt_no="TREND-REC-A-2",
                received_at=datetime(2026, 2, 5, 9, 0, tzinfo=UTC),
                received_by_user_id=admin_user.id,
                qty_received=10,
                qty_remaining=10,
                status="received",
            )
            rec_a3 = MaterialReceiptORM(
                supplier_id=sup_a.id,
                material_id=mat.id,
                supplier_lot_id=lot_a.id,
                receipt_no="TREND-REC-A-3",
                received_at=datetime(2026, 3, 5, 9, 0, tzinfo=UTC),
                received_by_user_id=admin_user.id,
                qty_received=10,
                qty_remaining=10,
                status="received",
            )
            rec_b1 = MaterialReceiptORM(
                supplier_id=sup_b.id,
                material_id=mat.id,
                supplier_lot_id=lot_b.id,
                receipt_no="TREND-REC-B-1",
                received_at=datetime(2026, 1, 8, 9, 0, tzinfo=UTC),
                received_by_user_id=admin_user.id,
                qty_received=10,
                qty_remaining=10,
                status="received",
            )
            session.add_all([rec_a1, rec_a2, rec_a3, rec_b1])
            session.flush()

            # 2026-01: A 有 3 筆 (2 passed, 1 failed)、B 有 1 筆 (passed)
            session.add_all(
                [
                    IQCRecordORM(
                        receipt_id=rec_a1.id,
                        internal_lot_id=None,
                        sample_qty=1,
                        inspection_result="passed",
                        release_status="released",
                        review_status="approved",
                        inspection_date=datetime(2026, 1, 10, 10, 0, tzinfo=UTC),
                    ),
                    IQCRecordORM(
                        receipt_id=rec_a1.id,
                        internal_lot_id=None,
                        sample_qty=1,
                        inspection_result="passed",
                        release_status="released",
                        review_status="approved",
                        inspection_date=datetime(2026, 1, 11, 10, 0, tzinfo=UTC),
                    ),
                    IQCRecordORM(
                        receipt_id=rec_a1.id,
                        internal_lot_id=None,
                        sample_qty=1,
                        inspection_result="failed",
                        release_status="rejected",
                        review_status="pending",
                        inspection_date=datetime(2026, 1, 12, 10, 0, tzinfo=UTC),
                    ),
                    IQCRecordORM(
                        receipt_id=rec_b1.id,
                        internal_lot_id=None,
                        sample_qty=1,
                        inspection_result="passed",
                        release_status="released",
                        review_status="approved",
                        inspection_date=datetime(2026, 1, 15, 10, 0, tzinfo=UTC),
                    ),
                ]
            )
            # 2026-02: A 有 2 筆 (pending, pending) -> 合格率分母為 0
            session.add_all(
                [
                    IQCRecordORM(
                        receipt_id=rec_a2.id,
                        internal_lot_id=None,
                        sample_qty=1,
                        inspection_result="pending",
                        release_status="hold",
                        review_status="pending",
                        inspection_date=datetime(2026, 2, 10, 10, 0, tzinfo=UTC),
                    ),
                    IQCRecordORM(
                        receipt_id=rec_a2.id,
                        internal_lot_id=None,
                        sample_qty=1,
                        inspection_result="pending",
                        release_status="hold",
                        review_status="pending",
                        inspection_date=datetime(2026, 2, 11, 10, 0, tzinfo=UTC),
                    ),
                ]
            )
            # 2026-03: A 有 1 筆 (failed)
            session.add_all(
                [
                    IQCRecordORM(
                        receipt_id=rec_a3.id,
                        internal_lot_id=None,
                        sample_qty=1,
                        inspection_result="failed",
                        release_status="rejected",
                        review_status="pending",
                        inspection_date=datetime(2026, 3, 10, 10, 0, tzinfo=UTC),
                    ),
                    # inspection_date 為 null，應被統計篩除，不出現在任何月份
                    IQCRecordORM(
                        receipt_id=rec_a3.id,
                        internal_lot_id=None,
                        sample_qty=1,
                        inspection_result="passed",
                        release_status="released",
                        review_status="approved",
                        inspection_date=None,
                    ),
                ]
            )

        with TestClient(app) as client:
            yield client, TestSession
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(original_overrides)


def test_quality_trend_admin_groups_by_month(quality_trend_environment) -> None:
    client, _ = quality_trend_environment
    headers = _headers(client, "trend-admin", "Trend-Password-2026!")

    response = client.get("/api/v1/dashboard/quality-trend", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()

    points = {point["year_month"]: point for point in body}

    assert points["2026-01"] == {
        "year_month": "2026-01",
        "total": 4,
        "passed": 3,
        "failed": 1,
        "pass_rate": 0.75,
    }
    assert points["2026-02"] == {
        "year_month": "2026-02",
        "total": 2,
        "passed": 0,
        "failed": 0,
        "pass_rate": 0,
    }
    assert points["2026-03"] == {
        "year_month": "2026-03",
        "total": 1,
        "passed": 0,
        "failed": 1,
        "pass_rate": 0,
    }
    # inspection_date 為 null 的紀錄不應出現在任何月份
    assert len(points) == 3


def test_quality_trend_supplier_isolation(quality_trend_environment) -> None:
    client, _ = quality_trend_environment
    headers = _headers(client, "trend-supplier-a", "Trend-Password-2026!")

    response = client.get("/api/v1/dashboard/quality-trend", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()

    points = {point["year_month"]: point for point in body}
    # 供應商 A 只能看到自己的紀錄：2026-01 (3筆), 2026-02 (2筆 pending), 2026-03 (1筆 failed)
    assert points["2026-01"] == {
        "year_month": "2026-01",
        "total": 3,
        "passed": 2,
        "failed": 1,
        "pass_rate": 0.6667,
    }
    assert points["2026-02"] == {
        "year_month": "2026-02",
        "total": 2,
        "passed": 0,
        "failed": 0,
        "pass_rate": 0,
    }
    assert points["2026-03"] == {
        "year_month": "2026-03",
        "total": 1,
        "passed": 0,
        "failed": 1,
        "pass_rate": 0,
    }
    # 不洩漏供應商 B 的 2026-01 資料
    assert len(points) == 3


def test_quality_trend_date_range(quality_trend_environment) -> None:
    client, _ = quality_trend_environment
    headers = _headers(client, "trend-admin", "Trend-Password-2026!")

    response = client.get(
        "/api/v1/dashboard/quality-trend",
        params={"date_from": "2026-02-01", "date_to": "2026-02-28"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body == [
        {
            "year_month": "2026-02",
            "total": 2,
            "passed": 0,
            "failed": 0,
            "pass_rate": 0,
        }
    ]


def test_quality_trend_empty(quality_trend_environment) -> None:
    client, _ = quality_trend_environment
    # 查詢無資料的區間
    response = client.get(
        "/api/v1/dashboard/quality-trend",
        params={"date_from": "2026-04-01", "date_to": "2026-04-30"},
        headers=_headers(client, "trend-admin", "Trend-Password-2026!"),
    )
    assert response.status_code == 200, response.text
    assert response.json() == []


def test_quality_trend_iqc_only_permission(quality_trend_environment) -> None:
    client, _ = quality_trend_environment
    headers = _headers(client, "trend-iqc-only", "Trend-Password-2026!")

    response = client.get("/api/v1/dashboard/quality-trend", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    # iqc-only 內部使用者擁有 iqc:read 權限，可讀取所有供應商的趨勢
    assert len(body) == 3
    assert body[0]["year_month"] == "2026-01"
    assert body[0]["total"] == 4


def test_quality_trend_no_permission_forbidden(quality_trend_environment) -> None:
    client, _ = quality_trend_environment
    headers = _headers(client, "trend-noperm", "Trend-Password-2026!")

    assert client.get("/api/v1/dashboard/quality-trend", headers=headers).status_code == 403


def test_quality_trend_unauthorized(quality_trend_environment) -> None:
    client, _ = quality_trend_environment
    assert client.get("/api/v1/dashboard/quality-trend").status_code == 401


def test_quality_trend_seed_prefix_permission(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
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
            role = RoleORM(name="trend-seed-iqc-role")
            perm = PermissionORM(code="seed:iqc:read", name="seed:iqc:read")
            user = UserORM(
                username="trend-seed-iqc",
                email="trend-seed-iqc@example.test",
                password_hash=get_password_hash("Trend-Password-2026!"),
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

        with TestClient(app) as client:
            headers = _headers(client, "trend-seed-iqc", "Trend-Password-2026!")
            response = client.get("/api/v1/dashboard/quality-trend", headers=headers)
            assert response.status_code == 200, response.text
            assert response.json() == []
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(original_overrides)


def test_quality_trend_must_change_password(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
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
            role = RoleORM(name="trend-must-change-role")
            perm = PermissionORM(code="iqc:read", name="iqc:read")
            user = UserORM(
                username="trend-must-change",
                email="trend-must-change@example.test",
                password_hash=get_password_hash("Trend-Password-2026!"),
                is_active=True,
                must_change_password=True,
            )
            session.add_all([role, perm, user])
            session.flush()
            session.add_all(
                [
                    UserRoleORM(user_id=user.id, role_id=role.id),
                    RolePermissionORM(role_id=role.id, permission_id=perm.id),
                ]
            )

        with TestClient(app) as client:
            headers = _headers(client, "trend-must-change", "Trend-Password-2026!")
            blocked = client.get("/api/v1/dashboard/quality-trend", headers=headers)
            assert blocked.status_code == 403
            assert "Password change required" in blocked.json()["detail"]
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(original_overrides)
