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
    IQCRecordORM,
    MaterialORM,
    MaterialReceiptORM,
    QualityReviewORM,
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
            PermissionORM(code="quality:review", name="Review QA decisions"),
            PermissionORM(code="quality:approve", name="Approve QA decisions"),
            PermissionORM(code="quality:return", name="Return QA decisions"),
            PermissionORM(code="nonconformance:read", name="Read quality cases"),
            PermissionORM(code="nonconformance:write", name="Manage quality cases"),
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
                    qty_received=100,
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
            supplier_lot_id=session.query(SupplierLotORM)
            .filter_by(supplier_lot_no="LOT-100")
            .one()
            .id,
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

        limited_role = RoleORM(name="receiver-limited")
        qa_role = RoleORM(name="qa-reviewer")
        supplier_role = RoleORM(name="supplier-portal")
        limited_user = UserORM(
            username="receiver-limited",
            email="receiver-limited@example.test",
            password_hash=get_password_hash("Quality-Test-Password-2026!"),
            is_active=True,
        )
        supplier_user = UserORM(
            username="supplier-portal",
            email="supplier-portal@example.test",
            password_hash=get_password_hash("Quality-Test-Password-2026!"),
            is_active=True,
            supplier_id=supplier.id,
        )
        qa_user = UserORM(
            username="qa-reviewer",
            email="qa-reviewer@example.test",
            password_hash=get_password_hash("Quality-Test-Password-2026!"),
            is_active=True,
        )
        session.add_all(
            [limited_role, qa_role, supplier_role, limited_user, supplier_user, qa_user]
        )
        session.flush()
        permission_by_code = {permission.code: permission for permission in permissions}
        session.add_all(
            [
                UserRoleORM(user_id=limited_user.id, role_id=limited_role.id),
                UserRoleORM(user_id=qa_user.id, role_id=qa_role.id),
                UserRoleORM(user_id=supplier_user.id, role_id=supplier_role.id),
                RolePermissionORM(
                    role_id=limited_role.id,
                    permission_id=permission_by_code["iqc:read"].id,
                ),
                RolePermissionORM(
                    role_id=supplier_role.id,
                    permission_id=permission_by_code["suppliers:read"].id,
                ),
                RolePermissionORM(
                    role_id=supplier_role.id,
                    permission_id=permission_by_code["nonconformance:read"].id,
                ),
                *[
                    RolePermissionORM(role_id=qa_role.id, permission_id=permission_by_code[code].id)
                    for code in ("quality:review", "quality:approve", "quality:return")
                ],
            ]
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


def test_receipt_list_searches_supplier_lot_and_returns_iqc_summary_only_with_permission(
    quality_environment,
) -> None:
    client, sessions = quality_environment
    admin_headers = _headers(client, "quality-admin", "Quality-Test-Password-2026!")
    with sessions.begin() as session:
        receipt = session.query(MaterialReceiptORM).filter_by(receipt_no="REC-100").one()
        lot = session.query(InternalMaterialLotORM).filter_by(receipt_id=receipt.id).one()
        session.add(
            IQCRecordORM(
                receipt_id=None,
                internal_lot_id=lot.id,
                sample_qty=1,
                inspection_result="failed",
                release_status="rejected",
                review_status="pending",
            )
        )

    found = client.get("/api/v1/receipts?keyword=LOT-100", headers=admin_headers)
    assert found.status_code == 200, found.text
    assert found.json()["total"] == 1
    assert found.json()["items"][0]["iqc_records"][0]["inspection_result"] == "failed"

    with sessions.begin() as session:
        read_role = RoleORM(name="receipt-reader")
        reader = UserORM(
            username="receipt-reader",
            email="receipt-reader@example.test",
            password_hash=get_password_hash("Quality-Test-Password-2026!"),
            is_active=True,
        )
        session.add_all([read_role, reader])
        session.flush()
        read_permission = session.query(PermissionORM).filter_by(code="receipts:read").one()
        session.add_all(
            [
                UserRoleORM(user_id=reader.id, role_id=read_role.id),
                RolePermissionORM(role_id=read_role.id, permission_id=read_permission.id),
            ]
        )
    reader_headers = _headers(client, "receipt-reader", "Quality-Test-Password-2026!")
    without_iqc_access = client.get("/api/v1/receipts", headers=reader_headers)
    assert without_iqc_access.status_code == 200, without_iqc_access.text
    assert without_iqc_access.json()["items"][0]["iqc_records"] is None


def test_nonconformance_flow_links_iqc_records_history_and_guards_closing(
    quality_environment,
) -> None:
    client, _ = quality_environment
    headers = _headers(client, "quality-admin", "Quality-Test-Password-2026!")
    iqc = client.post(
        "/api/v1/iqc",
        json={
            "internal_lot_id": 1,
            "sample_qty": "1",
            "inspection_result": "failed",
            "release_status": "rejected",
        },
        headers=headers,
    )
    assert iqc.status_code == 201, iqc.text
    created = client.post(
        "/api/v1/nonconformances",
        json={
            "case_no": "NC-TEST-001",
            "title": "IQC defect",
            "description": "Surface crack",
            "source": "iqc",
            "severity": "high",
            "found_at": "2026-10-20T10:00:00Z",
            "iqc_record_id": iqc.json()["id"],
            "defect_qty": "2",
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    case = created.json()
    assert case["supplier_id"] == 1 and case["material_id"] == 1
    assert case["receipt_id"] == 1 and case["supplier_lot_id"] == 1
    assert (
        client.patch(
            f"/api/v1/nonconformances/{case['id']}", json={"status": "closed"}, headers=headers
        ).status_code
        == 409
    )
    assert (
        client.patch(
            f"/api/v1/nonconformances/{case['id']}",
            json={"status": "pending_confirmation"},
            headers=headers,
        ).status_code
        == 409
    )
    assert (
        client.patch(
            f"/api/v1/nonconformances/{case['id']}",
            json={"status": "investigating", "investigation": "Lot review"},
            headers=headers,
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/v1/nonconformances/{case['id']}/dispositions",
            json={
                "content": "Sort affected lot",
                "result": "2 defective units isolated",
                "owner_user_id": 1,
                "executed_at": "2026-10-20T11:00:00Z",
            },
            headers=headers,
        ).status_code
        == 201
    )
    assert (
        client.patch(
            f"/api/v1/nonconformances/{case['id']}",
            json={"status": "pending_confirmation"},
            headers=headers,
        ).status_code
        == 200
    )
    closed = client.patch(
        f"/api/v1/nonconformances/{case['id']}", json={"status": "closed"}, headers=headers
    )
    assert closed.status_code == 200, closed.text
    assert len(closed.json()["history"]) >= 5
    assert client.get("/api/v1/nonconformances", headers=headers).json()["total"] == 1


def test_nonconformance_rbac_and_invalid_reference(quality_environment) -> None:
    client, TestSession = quality_environment
    headers = _headers(client, "quality-admin", "Quality-Test-Password-2026!")
    denied = _headers(client, "receiver-limited", "Quality-Test-Password-2026!")
    payload = {
        "case_no": "NC-TEST-002",
        "title": "Test",
        "description": "Test",
        "source": "other",
        "severity": "low",
        "found_at": "2026-10-20T10:00:00Z",
    }
    assert client.get("/api/v1/nonconformances").status_code == 401
    assert client.get("/api/v1/nonconformances", headers=denied).status_code == 403
    assert client.get("/api/v1/nonconformances", headers=headers).status_code == 200
    assert client.post("/api/v1/nonconformances", json=payload, headers=denied).status_code == 403
    assert (
        client.post(
            "/api/v1/nonconformances", json={**payload, "receipt_id": 9999}, headers=headers
        ).status_code
        == 404
    )
    with TestSession.begin() as session:
        other_supplier = SupplierORM(
            supplier_code="SUP-200", supplier_name="Other Supplier", status="active"
        )
        session.add(other_supplier)
        session.flush()
        other_supplier_id = other_supplier.id
    other_case = client.post(
        "/api/v1/nonconformances",
        json={
            **payload,
            "case_no": "NC-OTHER",
            "title": "Other supplier case",
            "supplier_id": other_supplier_id,
        },
        headers=headers,
    )
    assert other_case.status_code == 201, other_case.text
    supplier_headers = _headers(client, "supplier-portal", "Quality-Test-Password-2026!")
    assert (
        client.get(
            f"/api/v1/nonconformances/{other_case.json()['id']}", headers=supplier_headers
        ).status_code
        == 403
    )

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


def test_nonconformance_attachment_upload_download_delete_and_history(
    quality_environment, monkeypatch, tmp_path
) -> None:
    from types import SimpleNamespace

    from app.services import document_storage

    monkeypatch.setattr(
        document_storage,
        "get_settings",
        lambda: SimpleNamespace(
            document_storage_dir=str(tmp_path), document_max_file_bytes=1024 * 1024
        ),
    )
    client, _ = quality_environment
    headers = _headers(client, "quality-admin", "Quality-Test-Password-2026!")
    created = client.post(
        "/api/v1/nonconformances",
        json={
            "case_no": "NC-ATTACH-001",
            "title": "Image evidence",
            "description": "Evidence upload test",
            "source": "other",
            "severity": "low",
            "found_at": "2026-10-20T10:00:00Z",
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    case_id = created.json()["id"]
    image = b"\x89PNG\r\n\x1a\n" + b"evidence"
    uploaded = client.post(
        f"/api/v1/nonconformances/{case_id}/attachments",
        files={"file": ("evidence.png", image, "image/png")},
        headers=headers,
    )
    assert uploaded.status_code == 201, uploaded.text
    assert "storage_key" not in uploaded.json()
    attachment_id = uploaded.json()["id"]
    downloaded = client.get(
        f"/api/v1/nonconformances/{case_id}/attachments/{attachment_id}/download",
        headers=headers,
    )
    assert downloaded.status_code == 200
    assert downloaded.content == image
    deleted = client.delete(
        f"/api/v1/nonconformances/{case_id}/attachments/{attachment_id}", headers=headers
    )
    assert deleted.status_code == 204
    history = client.get(f"/api/v1/nonconformances/{case_id}", headers=headers).json()["history"]
    assert [entry["action"] for entry in history] == [
        "created",
        "attachment_added",
        "attachment_removed",
    ]
    assert history[-1]["after_data"]


def test_supplier_lot_creation_validates_relationship_uniqueness_and_precision(
    quality_environment,
) -> None:
    client, TestSession = quality_environment
    with TestSession.begin() as session:
        session.add(
            SupplierORM(
                supplier_code="SUP-200",
                supplier_name="Unlinked supplier",
                status="active",
            )
        )
    headers = _headers(client, "quality-admin", "Quality-Test-Password-2026!")
    payload = {
        "supplier_id": 1,
        "material_id": 1,
        "supplier_lot_no": "LOT-CREATE-VALID",
        "qty_received": "12.5000",
    }
    created = client.post("/api/v1/supplier-lots", json=payload, headers=headers)
    assert created.status_code == 201, created.text
    assert created.json()["uom"] == "pcs"
    assert client.post("/api/v1/supplier-lots", json=payload, headers=headers).status_code == 409
    assert (
        client.post(
            "/api/v1/supplier-lots",
            json={**payload, "supplier_lot_no": "LOT-INVALID-MATERIAL", "material_id": 999},
            headers=headers,
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/v1/supplier-lots",
            json={**payload, "supplier_id": 2, "supplier_lot_no": "LOT-INVALID-LINK"},
            headers=headers,
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/v1/supplier-lots",
            json={**payload, "supplier_lot_no": "LOT-OVERPRECISION", "qty_received": "1.00001"},
            headers=headers,
        ).status_code
        == 422
    )


def test_end_to_end_receipt_trace_with_multiple_internal_lots(quality_environment) -> None:
    client, _ = quality_environment
    headers = _headers(client, "quality-admin", "Quality-Test-Password-2026!")

    supplier_lot = client.post(
        "/api/v1/supplier-lots",
        json={
            "supplier_id": 1,
            "material_id": 1,
            "supplier_lot_no": "LOT-TRACE-201",
            "qty_received": "20.0000",
            "manufacturing_date": "2026-09-01T00:00:00Z",
            "expiry_date": "2027-09-01T00:00:00Z",
        },
        headers=headers,
    )
    assert supplier_lot.status_code == 201, supplier_lot.text
    assert supplier_lot.json()["uom"] == "pcs"

    receipt = client.post(
        "/api/v1/receipts",
        json={
            "supplier_id": 1,
            "material_id": 1,
            "supplier_lot_id": supplier_lot.json()["id"],
            "receipt_no": "REC-TRACE-201",
            "qty_received": "20.0000",
            "received_at": "2026-10-19T09:00:00Z",
        },
        headers=headers,
    )
    assert receipt.status_code == 201, receipt.text
    receipt_id = receipt.json()["id"]
    over_received = client.post(
        "/api/v1/receipts",
        json={
            "supplier_id": 1,
            "material_id": 1,
            "supplier_lot_id": supplier_lot.json()["id"],
            "receipt_no": "REC-TRACE-201-OVER",
            "qty_received": "0.0001",
            "received_at": "2026-10-19T10:00:00Z",
        },
        headers=headers,
    )
    assert over_received.status_code == 400

    created_lots = []
    for lot_no, quantity in (("ILT-TRACE-201-A", "7.0000"), ("ILT-TRACE-201-B", "13.0000")):
        split = client.post(
            f"/api/v1/receipts/{receipt_id}/internal-lots",
            json={"internal_lot_no": lot_no, "qty": quantity},
            headers=headers,
        )
        assert split.status_code == 201, split.text
        assert split.json()["receipt_id"] == receipt_id
        created_lots.append(split.json())

    exhausted = client.post(
        f"/api/v1/receipts/{receipt_id}/internal-lots",
        json={"internal_lot_no": "ILT-TRACE-201-OVER", "qty": "0.0001"},
        headers=headers,
    )
    assert exhausted.status_code == 400
    current_receipt = client.get(f"/api/v1/receipts/{receipt_id}", headers=headers).json()
    assert current_receipt["qty_remaining"] == "0.0000"
    assert sum(float(lot["qty_on_hand"]) for lot in created_lots) == 20

    for lot, result, release in (
        (created_lots[0], "passed", "released"),
        (created_lots[1], "failed", "rejected"),
    ):
        inspection = client.post(
            "/api/v1/iqc",
            json={
                "internal_lot_id": lot["id"],
                "sample_qty": "1.0000",
                "inspection_result": result,
                "release_status": release,
                "remarks": f"trace-{result}",
            },
            headers=headers,
        )
        assert inspection.status_code == 201, inspection.text

    trace = client.get(f"/api/v1/receipts/{receipt_id}/trace", headers=headers)
    assert trace.status_code == 200, trace.text
    body = trace.json()
    assert body["supplier"]["supplier_code"] == "SUP-100"
    assert body["material"]["material_code"] == "MAT-100"
    assert body["supplier_lot"]["supplier_lot_no"] == "LOT-TRACE-201"
    assert body["receipt"]["receipt_no"] == "REC-TRACE-201"
    assert {item["internal_lot"]["internal_lot_no"] for item in body["internal_lots"]} == {
        "ILT-TRACE-201-A",
        "ILT-TRACE-201-B",
    }
    trace_results = {
        item["internal_lot"]["internal_lot_no"]: item["iqc_records"][0]["inspection_result"]
        for item in body["internal_lots"]
    }
    assert trace_results == {"ILT-TRACE-201-A": "passed", "ILT-TRACE-201-B": "failed"}
    unified = client.get("/api/v1/traceability?receipt_no=REC-TRACE-201", headers=headers)
    assert unified.status_code == 200, unified.text
    assert unified.json()["total"] == 1
    unified_item = unified.json()["items"][0]
    assert unified_item["supplier"]["supplier_code"] == "SUP-100"
    assert unified_item["material"]["material_code"] == "MAT-100"
    assert len(unified_item["internal_lots"]) == 2
    assert {
        branch["internal_lot"]["internal_lot_no"] for branch in unified_item["internal_lots"]
    } == {
        "ILT-TRACE-201-A",
        "ILT-TRACE-201-B",
    }
    assert (
        client.get(
            "/api/v1/traceability?material_code=MAT-100&page_size=1", headers=headers
        ).json()["total"]
        >= 1
    )
    assert client.get("/api/v1/traceability?receipt_no=missing", headers=headers).status_code == 404
    assert client.get("/api/v1/traceability", headers=headers).status_code == 422
    assert client.get("/api/v1/receipts/999999/trace", headers=headers).status_code == 404


def test_multi_lot_payload_is_rejected_instead_of_hiding_created_ids(quality_environment) -> None:
    client, _ = quality_environment
    headers = _headers(client, "quality-admin", "Quality-Test-Password-2026!")
    response = client.post(
        "/api/v1/receipts/1/internal-lots",
        json={"lots": [{"internal_lot_no": "ILT-HIDDEN-A", "qty": "1"}]},
        headers=headers,
    )
    assert response.status_code == 422
    trace = client.get("/api/v1/receipts/1/trace", headers=headers)
    assert trace.status_code == 200
    assert all(
        item["internal_lot"]["internal_lot_no"] != "ILT-HIDDEN-A"
        for item in trace.json()["internal_lots"]
    )


def _create_iqc(client: TestClient, headers: dict[str, str], internal_lot_id: int = 1) -> dict:
    inspection = client.post(
        "/api/v1/iqc",
        json={
            "internal_lot_id": internal_lot_id,
            "sample_qty": "1.0000",
            "inspection_result": "passed",
            "inspection_date": "2026-10-19T12:00:00Z",
            "release_status": "released",
            "remarks": "Awaiting final QA approval",
        },
        headers=headers,
    )
    assert inspection.status_code == 201, inspection.text
    return inspection.json()


def test_iqc_review_approval_records_history_and_blocks_resign(quality_environment) -> None:
    client, TestSession = quality_environment
    headers = _headers(client, "quality-admin", "Quality-Test-Password-2026!")
    iqc_id = _create_iqc(client, headers)["id"]
    with TestSession.begin() as session:
        session.query(InternalMaterialLotORM).filter_by(id=1).one().lot_status = "reserved"

    approve = client.post(
        f"/api/v1/iqc/{iqc_id}/reviews/approve",
        json={"decision_note": "QA sign-off approved"},
        headers=headers,
    )
    assert approve.status_code == 200, approve.text
    body = approve.json()
    assert body["review_status"] == "approved"
    assert body["reviewed_by_username"] == "quality-admin"
    assert body["reviewed_at"] is not None
    with TestSession() as session:
        assert session.query(InternalMaterialLotORM).filter_by(id=1).one().lot_status == "reserved"
    assert (
        client.patch(
            f"/api/v1/iqc/{iqc_id}",
            json={"remarks": "editing after approval"},
            headers=headers,
        ).status_code
        == 409
    )

    # A finalised record cannot be signed off twice (state-transition guard).
    assert (
        client.post(f"/api/v1/iqc/{iqc_id}/reviews/approve", json={}, headers=headers).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/v1/iqc/{iqc_id}/reviews/return",
            json={"reason": "late correction"},
            headers=headers,
        ).status_code
        == 409
    )

    pending = client.get("/api/v1/iqc?review_status=pending", headers=headers)
    assert pending.status_code == 200
    assert all(item["id"] != iqc_id for item in pending.json()["items"])

    approved = client.get("/api/v1/iqc?review_status=approved", headers=headers)
    assert any(item["id"] == iqc_id for item in approved.json()["items"])

    history = client.get(f"/api/v1/iqc/{iqc_id}/reviews", headers=headers)
    assert history.status_code == 200, history.text
    assert len(history.json()["items"]) == 1
    assert history.json()["items"][0]["reviewed_by_username"] == "quality-admin"

    trace = client.get("/api/v1/traceability?receipt_no=REC-100", headers=headers)
    assert trace.status_code == 200, trace.text
    branches = trace.json()["items"][0]["internal_lots"]
    history_entries = [
        entry
        for branch in branches
        for check in branch["iqc_records"]
        for entry in check["review_history"]
    ]
    assert len(history_entries) == 1
    assert history_entries[0]["reviewed_by_username"] == "quality-admin"


def test_iqc_review_return_requires_reason_and_can_be_reapproved(quality_environment) -> None:
    client, _ = quality_environment
    headers = _headers(client, "quality-admin", "Quality-Test-Password-2026!")
    iqc_id = _create_iqc(client, headers)["id"]

    missing_reason = client.post(f"/api/v1/iqc/{iqc_id}/reviews/return", json={}, headers=headers)
    assert missing_reason.status_code == 400, missing_reason.text
    note_is_not_a_reason = client.post(
        f"/api/v1/iqc/{iqc_id}/reviews/return",
        json={"decision_note": "please review"},
        headers=headers,
    )
    assert note_is_not_a_reason.status_code == 400, note_is_not_a_reason.text

    returned = client.post(
        f"/api/v1/iqc/{iqc_id}/reviews/return",
        json={"reason": "缺少供應商檢驗報告"},
        headers=headers,
    )
    assert returned.status_code == 200, returned.text
    assert returned.json()["review_status"] == "returned"
    assert returned.json()["reason"] == "缺少供應商檢驗報告"

    returned_listing = client.get("/api/v1/iqc?review_status=returned", headers=headers)
    assert any(item["id"] == iqc_id for item in returned_listing.json()["items"])

    # A returned record is still awaiting a final decision.
    reapproved = client.post(
        f"/api/v1/iqc/{iqc_id}/reviews/approve",
        json={"decision_note": "補件後核准"},
        headers=headers,
    )
    assert reapproved.status_code == 200, reapproved.text
    assert reapproved.json()["review_status"] == "approved"

    history = client.get(f"/api/v1/iqc/{iqc_id}/reviews", headers=headers).json()["items"]
    assert len(history) == 2
    assert {item["review_status"] for item in history} == {"returned", "approved"}
    assert all(item["reviewed_by_username"] == "quality-admin" for item in history)


def test_iqc_review_requires_internal_quality_permission(quality_environment) -> None:
    client, _ = quality_environment
    admin_headers = _headers(client, "quality-admin", "Quality-Test-Password-2026!")
    iqc_id = _create_iqc(client, admin_headers)["id"]

    for username in ("receiver-limited", "supplier-portal"):
        headers = _headers(client, username, "Quality-Test-Password-2026!")
        assert (
            client.post(
                f"/api/v1/iqc/{iqc_id}/reviews/approve", json={}, headers=headers
            ).status_code
            == 403
        ), username
        assert (
            client.post(
                f"/api/v1/iqc/{iqc_id}/reviews/return",
                json={"reason": "should be denied"},
                headers=headers,
            ).status_code
            == 403
        ), username
        assert client.get(f"/api/v1/iqc/{iqc_id}/reviews", headers=headers).status_code == 403, (
            username
        )


def test_quality_only_user_can_open_and_process_signoff_without_iqc_or_material_read(
    quality_environment,
) -> None:
    client, _ = quality_environment
    admin_headers = _headers(client, "quality-admin", "Quality-Test-Password-2026!")
    iqc_id = _create_iqc(client, admin_headers)["id"]
    qa_headers = _headers(client, "qa-reviewer", "Quality-Test-Password-2026!")

    listing = client.get("/api/v1/iqc?review_status=pending", headers=qa_headers)
    assert listing.status_code == 200, listing.text
    assert [item["id"] for item in listing.json()["items"]] == [iqc_id]
    approved = client.post(
        f"/api/v1/iqc/{iqc_id}/reviews/approve",
        json={"decision_note": "QA review"},
        headers=qa_headers,
    )
    assert approved.status_code == 200, approved.text
    history = client.get(f"/api/v1/iqc/{iqc_id}/reviews", headers=qa_headers)
    assert history.status_code == 200
    assert history.json()["items"][0]["decision_note"] == "QA review"


def test_approving_failed_iqc_does_not_release_rejected_lot(quality_environment) -> None:
    client, TestSession = quality_environment
    headers = _headers(client, "quality-admin", "Quality-Test-Password-2026!")
    inspection = client.post(
        "/api/v1/iqc",
        json={
            "internal_lot_id": 1,
            "sample_qty": "1.0000",
            "inspection_result": "failed",
            "release_status": "rejected",
        },
        headers=headers,
    )
    assert inspection.status_code == 201, inspection.text
    assert inspection.json()["release_status"] == "rejected"
    approved = client.post(
        f"/api/v1/iqc/{inspection.json()['id']}/reviews/approve",
        json={},
        headers=headers,
    )
    assert approved.status_code == 200, approved.text
    with TestSession() as session:
        assert session.query(InternalMaterialLotORM).filter_by(id=1).one().lot_status == "rejected"


def test_review_and_iqc_status_roll_back_together_when_commit_fails(
    quality_environment, monkeypatch
) -> None:
    client, TestSession = quality_environment
    headers = _headers(client, "quality-admin", "Quality-Test-Password-2026!")
    iqc_id = _create_iqc(client, headers)["id"]
    original_commit = Session.commit

    def fail_review_commit(session: Session) -> None:
        if any(isinstance(item, QualityReviewORM) for item in session.new):
            raise RuntimeError("simulated database failure")
        original_commit(session)

    monkeypatch.setattr(Session, "commit", fail_review_commit)
    with pytest.raises(RuntimeError, match="simulated database failure"):
        client.post(f"/api/v1/iqc/{iqc_id}/reviews/approve", json={}, headers=headers)
    with TestSession() as session:
        record = session.get(IQCRecordORM, iqc_id)
        assert record is not None and record.review_status == "pending"
        assert session.query(QualityReviewORM).filter_by(iqc_record_id=iqc_id).count() == 0


def test_supplier_cannot_sign_even_if_quality_permission_is_misassigned(
    quality_environment,
) -> None:
    client, TestSession = quality_environment
    admin_headers = _headers(client, "quality-admin", "Quality-Test-Password-2026!")
    iqc_id = _create_iqc(client, admin_headers)["id"]
    with TestSession.begin() as session:
        approve_permission = session.query(PermissionORM).filter_by(code="quality:approve").one()
        supplier_role = session.query(RoleORM).filter_by(name="supplier-portal").one()
        session.add(
            RolePermissionORM(role_id=supplier_role.id, permission_id=approve_permission.id)
        )
    supplier_headers = _headers(client, "supplier-portal", "Quality-Test-Password-2026!")
    assert (
        client.get("/api/v1/iqc?review_status=pending", headers=supplier_headers).status_code == 403
    )
    assert (
        client.post(
            f"/api/v1/iqc/{iqc_id}/reviews/approve", json={}, headers=supplier_headers
        ).status_code
        == 403
    )
