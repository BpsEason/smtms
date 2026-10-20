from collections.abc import Generator
from datetime import datetime

import pytest
from app.core import redis_client as redis_module
from app.core.security import get_password_hash
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.quality import (
    MaterialORM,
    SupplierMaterialORM,
    SupplierORM,
    SupplierQualificationDocumentORM,
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
def catalog_environment(monkeypatch) -> Generator[tuple[TestClient, sessionmaker], None, None]:
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
        all_permissions = [
            PermissionORM(code=code, name=code)
            for code in (
                "suppliers:read",
                "suppliers:write",
                "materials:read",
                "materials:write",
            )
        ]
        read_only = RoleORM(name="catalog-reader")
        catalog_admin = RoleORM(name="catalog-admin")
        seeded_role = RoleORM(name="seeded-catalog-reader")
        user = UserORM(
            username="catalog-admin",
            email="catalog-admin@example.test",
            password_hash=get_password_hash("Catalog-Test-Password-2026!"),
            is_active=True,
        )
        reader = UserORM(
            username="catalog-reader",
            email="catalog-reader@example.test",
            password_hash=get_password_hash("Catalog-Test-Password-2026!"),
            is_active=True,
        )
        seeded_user = UserORM(
            username="seed_catalog_reader",
            email="seed_catalog_reader@example.test",
            password_hash=get_password_hash("Catalog-Test-Password-2026!"),
            is_active=True,
        )
        seeded_supplier_read = PermissionORM(
            code="seed:suppliers:read",
            name="Seed read suppliers",
        )
        session.add_all(
            [
                *all_permissions,
                read_only,
                catalog_admin,
                seeded_role,
                user,
                reader,
                seeded_user,
                seeded_supplier_read,
            ]
        )
        session.flush()
        session.add_all(
            [
                UserRoleORM(user_id=user.id, role_id=catalog_admin.id),
                UserRoleORM(user_id=reader.id, role_id=read_only.id),
                UserRoleORM(user_id=seeded_user.id, role_id=seeded_role.id),
                RolePermissionORM(
                    role_id=seeded_role.id,
                    permission_id=seeded_supplier_read.id,
                ),
                *[
                    RolePermissionORM(role_id=catalog_admin.id, permission_id=permission.id)
                    for permission in all_permissions
                ],
                *[
                    RolePermissionORM(role_id=read_only.id, permission_id=permission.id)
                    for permission in all_permissions
                    if permission.code.endswith(":read")
                ],
            ]
        )
        session.add_all(
            [
                SupplierORM(
                    supplier_code="SUP-001",
                    supplier_name="Harbor Industrial",
                    status="active",
                    country="Taiwan",
                ),
                SupplierORM(
                    supplier_code="SUP-002",
                    supplier_name="Evergreen Components",
                    status="inactive",
                    country="Taiwan",
                ),
                MaterialORM(
                    material_code="MAT-001",
                    material_name="Copper Busbar",
                    material_type="metal",
                    spec="C1100",
                    uom="pcs",
                    status="active",
                ),
            ]
        )
        session.flush()
        supplier = session.query(SupplierORM).filter_by(supplier_code="SUP-001").one()
        material = session.query(MaterialORM).filter_by(material_code="MAT-001").one()
        session.add_all(
            [
                SupplierMaterialORM(
                    supplier_id=supplier.id,
                    material_id=material.id,
                    supplier_material_code="HARBOR-CU-1",
                    is_preferred=True,
                ),
                SupplierQualificationDocumentORM(
                    supplier_id=supplier.id,
                    doc_type="ISO 9001",
                    doc_code="CERT-001",
                    doc_name="Quality Certificate",
                    file_path="docs/cert-001.pdf",
                    issued_at=datetime(2026, 1, 1),
                    expires_at=datetime(2027, 1, 1),
                    status="active",
                ),
            ]
        )

    client = TestClient(app)
    try:
        yield client, TestSession
    finally:
        app.dependency_overrides.pop(get_db, None)
        Base.metadata.drop_all(test_engine)
        test_engine.dispose()


def test_catalog_routes_require_auth_and_permissions(catalog_environment) -> None:
    client, TestSession = catalog_environment
    assert client.get("/api/v1/suppliers").status_code == 401
    assert client.get("/api/v1/materials").status_code == 401
    read_headers = _headers(client, "catalog-reader", "Catalog-Test-Password-2026!")
    assert (
        client.post(
            "/api/v1/suppliers",
            json={"supplier_code": "SUP-003", "supplier_name": "No Write Permission"},
            headers=read_headers,
        ).status_code
        == 403
    )

    seeded_headers = _headers(
        client,
        "seed_catalog_reader",
        "Catalog-Test-Password-2026!",
    )
    assert client.get("/api/v1/suppliers", headers=seeded_headers).status_code == 200


def test_supplier_crud_search_pagination_documents_and_unique_code(catalog_environment) -> None:
    client, _ = catalog_environment
    headers = _headers(client, "catalog-admin", "Catalog-Test-Password-2026!")

    created = client.post(
        "/api/v1/suppliers",
        json={
            "supplier_code": "SUP-003",
            "supplier_name": "Pacific Precision",
            "contact_name": "Sam Lee",
            "status": "active",
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    supplier_id = created.json()["id"]
    assert (
        client.post(
            "/api/v1/suppliers",
            json={"supplier_code": "SUP-003", "supplier_name": "Duplicate"},
            headers=headers,
        ).status_code
        == 409
    )
    assert (
        client.patch(
            f"/api/v1/suppliers/{supplier_id}",
            json={"id": 999, "supplier_name": "Illegal PK Change"},
            headers=headers,
        ).status_code
        == 422
    )

    updated = client.patch(
        f"/api/v1/suppliers/{supplier_id}",
        json={"supplier_name": "Pacific Precision Updated", "phone": "02-555-0101"},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["supplier_name"] == "Pacific Precision Updated"
    assert client.get(f"/api/v1/suppliers/{supplier_id}", headers=headers).status_code == 200

    listing = client.get(
        "/api/v1/suppliers?keyword=Pacific&status=active&page=1&page_size=1",
        headers=headers,
    )
    assert listing.status_code == 200
    assert listing.json()["total"] == 1
    assert listing.json()["items"][0]["supplier_code"] == "SUP-003"
    inactive = client.get("/api/v1/suppliers?status=inactive", headers=headers)
    assert inactive.json()["total"] == 1
    assert client.get("/api/v1/suppliers?page=0", headers=headers).status_code == 422

    documents = client.get("/api/v1/suppliers/1/documents", headers=headers)
    assert documents.status_code == 200
    assert documents.json()[0]["doc_code"] == "CERT-001"
    assert client.get("/api/v1/suppliers/99999", headers=headers).status_code == 404
    assert client.get("/api/v1/suppliers/99999/documents", headers=headers).status_code == 404


def test_supplier_document_crud_and_authenticated_attachment_storage(
    catalog_environment,
    monkeypatch,
    tmp_path,
) -> None:
    from app.services import document_storage

    monkeypatch.setattr(document_storage, "storage_root", lambda: tmp_path.resolve())
    monkeypatch.setattr(
        document_storage,
        "get_settings",
        lambda: type("Settings", (), {"document_max_file_bytes": 64})(),
    )
    client, TestSession = catalog_environment
    headers = _headers(client, "catalog-admin", "Catalog-Test-Password-2026!")

    created = client.post(
        "/api/v1/suppliers/1/documents",
        json={
            "doc_type": "ISO 9001",
            "doc_code": "CERT-NEW",
            "doc_name": "Updated Quality Certificate",
            "issued_at": "2026-01-01T00:00:00Z",
            "expires_at": "2027-01-01T00:00:00Z",
            "status": "active",
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    document_id = created.json()["id"]
    document_url = f"/api/v1/suppliers/1/documents/{document_id}"
    assert client.get(document_url, headers=headers).status_code == 200
    reader_headers = _headers(client, "catalog-reader", "Catalog-Test-Password-2026!")
    assert client.get(document_url, headers=reader_headers).status_code == 200
    assert (
        client.patch(
            f"/api/v1/suppliers/1/documents/{document_id}",
            json={"doc_name": "Certificate v2"},
            headers=headers,
        ).json()["doc_name"]
        == "Certificate v2"
    )
    assert (
        client.post(
            "/api/v1/suppliers/1/documents",
            json={"doc_type": "ISO", "doc_name": "Unauthorized"},
            headers=reader_headers,
        ).status_code
        == 403
    )
    assert (
        client.patch(
            f"/api/v1/suppliers/1/documents/{document_id}",
            json={"doc_name": "Unauthorized update"},
            headers=reader_headers,
        ).status_code
        == 403
    )
    assert client.delete(document_url, headers=reader_headers).status_code == 403
    assert (
        client.post(
            "/api/v1/suppliers/1/documents",
            json={"doc_type": " ", "doc_name": "Invalid"},
            headers=headers,
        ).status_code
        == 422
    )

    uploaded = client.post(
        f"/api/v1/suppliers/1/documents/{document_id}/attachments",
        files={"file": ("../../certificate.pdf", b"%PDF-1.7\ncontent", "application/pdf")},
        headers=headers,
    )
    assert uploaded.status_code == 201, uploaded.text
    attachment = uploaded.json()
    assert attachment["original_filename"] == "certificate.pdf"
    assert attachment["size_bytes"] > 0
    assert len(list(tmp_path.iterdir())) == 1

    downloaded = client.get(
        f"/api/v1/suppliers/1/documents/{document_id}/attachments/{attachment['id']}/download",
        headers=headers,
    )
    assert downloaded.status_code == 200
    assert downloaded.content == b"%PDF-1.7\ncontent"
    assert (
        client.get(
            f"/api/v1/suppliers/1/documents/{document_id}/attachments/{attachment['id']}/download",
            headers=reader_headers,
        ).status_code
        == 200
    )

    rejected_type = client.post(
        f"/api/v1/suppliers/1/documents/{document_id}/attachments",
        files={"file": ("spoof.pdf", b"not really a PDF", "application/pdf")},
        headers=headers,
    )
    assert rejected_type.status_code == 415
    too_large = client.post(
        f"/api/v1/suppliers/1/documents/{document_id}/attachments",
        files={"file": ("large.pdf", b"%PDF-" + b"x" * 80, "application/pdf")},
        headers=headers,
    )
    assert too_large.status_code == 413

    engine = TestSession.kw["bind"]
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TRIGGER fail_attachment_insert BEFORE INSERT ON supplier_document_attachments "
            "BEGIN SELECT RAISE(ABORT, 'simulated metadata failure'); END"
        )
    failed_persist = client.post(
        f"/api/v1/suppliers/1/documents/{document_id}/attachments",
        files={"file": ("failed.pdf", b"%PDF-1.7\nfailed", "application/pdf")},
        headers=headers,
    )
    assert failed_persist.status_code == 409
    assert len(list(tmp_path.iterdir())) == 1
    with engine.begin() as connection:
        connection.exec_driver_sql("DROP TRIGGER fail_attachment_insert")

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as traversal:
        document_storage.resolve_storage_key("../outside.pdf")
    assert traversal.value.status_code == 404

    assert (
        client.delete(
            f"/api/v1/suppliers/1/documents/{document_id}/attachments/{attachment['id']}",
            headers=headers,
        ).status_code
        == 204
    )
    assert list(tmp_path.iterdir()) == []
    assert client.delete(document_url, headers=headers).status_code == 204


def test_material_crud_search_pagination_and_unique_code(catalog_environment) -> None:
    client, _ = catalog_environment
    headers = _headers(client, "catalog-admin", "Catalog-Test-Password-2026!")

    created = client.post(
        "/api/v1/materials",
        json={
            "material_code": "MAT-002",
            "material_name": "Silicone Gasket",
            "material_type": "polymer",
            "spec": "VMQ, 60 Shore A",
            "uom": "pcs",
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    material_id = created.json()["id"]
    assert (
        client.post(
            "/api/v1/materials",
            json={
                "material_code": "MAT-002",
                "material_name": "Duplicate",
                "material_type": "polymer",
                "uom": "pcs",
            },
            headers=headers,
        ).status_code
        == 409
    )
    assert (
        client.patch(
            f"/api/v1/materials/{material_id}",
            json={"id": 999},
            headers=headers,
        ).status_code
        == 422
    )

    updated = client.patch(
        f"/api/v1/materials/{material_id}",
        json={"status": "inactive", "spec": None},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["status"] == "inactive"
    assert updated.json()["spec"] is None
    assert client.get(f"/api/v1/materials/{material_id}", headers=headers).status_code == 200

    listing = client.get(
        "/api/v1/materials?keyword=Silicone&status=inactive&page=1&page_size=1",
        headers=headers,
    )
    assert listing.status_code == 200
    assert listing.json()["total"] == 1
    assert listing.json()["items"][0]["material_code"] == "MAT-002"
    assert (
        client.get(
            "/api/v1/materials?status=active",
            headers=headers,
        ).json()["total"]
        == 1
    )
    assert client.get("/api/v1/materials/99999", headers=headers).status_code == 404


def test_supplier_material_relationship_and_preferred_supplier(catalog_environment) -> None:
    client, _ = catalog_environment
    headers = _headers(client, "catalog-admin", "Catalog-Test-Password-2026!")

    link = client.post(
        "/api/v1/suppliers/2/materials",
        json={
            "material_id": 1,
            "supplier_material_code": "EVERGREEN-CU-1",
            "is_preferred": True,
        },
        headers=headers,
    )
    assert link.status_code == 201, link.text
    assert link.json()["is_preferred"] is True
    assert (
        client.post(
            "/api/v1/suppliers/2/materials",
            json={"material_id": 1},
            headers=headers,
        ).status_code
        == 409
    )

    suppliers = client.get("/api/v1/materials/1/suppliers", headers=headers)
    assert suppliers.status_code == 200
    assert {item["id"] for item in suppliers.json()} == {1, 2}
    with catalog_environment[1].begin() as session:
        links = session.query(SupplierMaterialORM).filter_by(material_id=1).all()
        assert sum(link.is_preferred for link in links) == 1
        assert next(link for link in links if link.supplier_id == 2).is_preferred

    assert (
        client.post(
            "/api/v1/suppliers/99999/materials",
            json={"material_id": 1},
            headers=headers,
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/v1/suppliers/1/materials",
            json={"material_id": 99999},
            headers=headers,
        ).status_code
        == 404
    )
    assert client.get("/api/v1/materials/99999/suppliers", headers=headers).status_code == 404

    assert client.delete("/api/v1/suppliers/2/materials/1", headers=headers).status_code == 204
    assert client.delete("/api/v1/suppliers/2/materials/1", headers=headers).status_code == 404


def test_suppliers_without_tax_id_can_be_created(catalog_environment) -> None:
    client, _ = catalog_environment
    headers = _headers(client, "catalog-admin", "Catalog-Test-Password-2026!")

    blank = client.post(
        "/api/v1/suppliers",
        json={"supplier_code": "SUP-100", "supplier_name": "Blank Tax", "tax_id": ""},
        headers=headers,
    )
    assert blank.status_code == 201, blank.text
    assert blank.json()["tax_id"] is None

    whitespace = client.post(
        "/api/v1/suppliers",
        json={"supplier_code": "SUP-101", "supplier_name": "Whitespace Tax", "tax_id": "   "},
        headers=headers,
    )
    assert whitespace.status_code == 201, whitespace.text
    assert whitespace.json()["tax_id"] is None

    omitted = client.post(
        "/api/v1/suppliers",
        json={"supplier_code": "SUP-102", "supplier_name": "No Tax"},
        headers=headers,
    )
    assert omitted.status_code == 201, omitted.text
    assert omitted.json()["tax_id"] is None


def test_duplicate_valid_tax_id_is_rejected(catalog_environment) -> None:
    client, _ = catalog_environment
    headers = _headers(client, "catalog-admin", "Catalog-Test-Password-2026!")

    first = client.post(
        "/api/v1/suppliers",
        json={"supplier_code": "SUP-200", "supplier_name": "First Tax", "tax_id": "12345678"},
        headers=headers,
    )
    assert first.status_code == 201, first.text
    assert first.json()["tax_id"] == "12345678"

    duplicate = client.post(
        "/api/v1/suppliers",
        json={"supplier_code": "SUP-201", "supplier_name": "Second Tax", "tax_id": "12345678"},
        headers=headers,
    )
    assert duplicate.status_code == 409
