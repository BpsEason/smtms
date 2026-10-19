"""Populate deterministic SMTMS development/test QA data.

Run from backend/: uv run python scripts/seed_dev.py
The shared local test password is restricted to the guarded development/test seeder.
"""

from __future__ import annotations

import os
import sys
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from urllib.parse import urlparse

from app.core.config import get_settings
from app.core.security import get_password_hash
from app.db.session import SessionLocal, engine
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
from app.models.user import (
    PermissionORM,
    RoleORM,
    RolePermissionORM,
    UserORM,
    UserRoleORM,
)
from sqlalchemy import and_, delete, func, or_, select, text
from sqlalchemy.orm import Session

SEED_USER_PREFIX = "seed_"
SEED_ROLE_NAMES = ("SMTMS Seed Administrator", "SMTMS Seed QA", "SMTMS Seed Receiver")
SEED_PERMISSION_PREFIX = "seed:"
SEED_SUPPLIER_PREFIX = "SEED-SUP-"
SEED_MATERIAL_PREFIX = "SEED-MAT-"
SEED_SUPPLIER_LOT_PREFIX = "SEED-SLOT-"
SEED_RECEIPT_PREFIX = "SEED-REC-"
SEED_INTERNAL_LOT_PREFIX = "SEED-ILOT-"
LOCAL_SEED_PASSWORD = "SmtmsLocal2026!"

SUPPLIER_DATA = (
    ("Harbor Industrial Supply", "林怡君", "02-2550-1001", "harbor@example.test", "Taiwan"),
    ("Evergreen Polymer Co.", "陳冠宇", "04-2300-2002", "evergreen@example.test", "Taiwan"),
    ("Northstar Components", "王雅婷", "03-5500-3003", "northstar@example.test", "Taiwan"),
    ("Pacific Precision Materials", "李承翰", "07-3300-4004", "pacific@example.test", "Taiwan"),
    ("Summit Chemical Works", "張家豪", "06-2200-5005", "summit@example.test", "Taiwan"),
    ("Cedar Packaging Group", "黃詩涵", "02-2600-6006", "cedar@example.test", "Taiwan"),
)

MATERIAL_DATA = (
    ("Aluminum Housing", "metal", "ADC12 die-cast, 120 x 80 mm", "pcs"),
    ("Copper Busbar", "metal", "C1100, 3 x 25 x 200 mm", "pcs"),
    ("Silicone Gasket", "polymer", "VMQ, 60 Shore A, 2 mm", "pcs"),
    ("Epoxy Adhesive", "chemical", "Two-part, 1:1 mix, 500 ml", "set"),
    ("Control PCB", "electronic", "FR-4, 4-layer, 1.6 mm", "pcs"),
    ("Stainless Fastener", "hardware", "SUS304 M4 x 12 mm", "pcs"),
    ("Protective Film", "packaging", "PE, 0.08 mm x 500 mm", "roll"),
    ("Thermal Pad", "polymer", "Silicone, 3 W/mK, 1 mm", "pcs"),
    ("Power Connector", "electronic", "10-pin, 5.08 mm pitch", "pcs"),
    ("Powder Coating", "chemical", "RAL 9005, matte black", "kg"),
    ("Carton Box", "packaging", "Double-wall, 400 x 300 x 200 mm", "pcs"),
    ("Copper Wire", "metal", "Annealed copper, 1.5 mm²", "m"),
)

PERMISSIONS = (
    ("suppliers:read", "Read suppliers"),
    ("suppliers:write", "Manage suppliers"),
    ("materials:read", "Read materials"),
    ("materials:write", "Manage materials"),
    ("receipts:read", "Read material receipts"),
    ("receipts:write", "Create material receipts"),
    ("iqc:read", "Read incoming inspections"),
    ("iqc:write", "Manage incoming inspections"),
    ("users:manage", "Manage user access"),
)

# Supported values are stored as strings by the current schema (no database ENUM/check constraints).
# Keep related QC, release, and inventory states aligned in this mapping.
BATCH_OUTCOMES = (
    "passed",
    "pending",
    "failed",
    "passed",
    "passed",
    "pending",
    "failed",
    "passed",
    "passed",
    "failed",
    "passed",
    "pending",
    "passed",
    "failed",
    "passed",
    "pending",
    "passed",
    "failed",
    "passed",
    "passed",
)


def _require_safe_environment() -> str:
    settings = get_settings()
    if settings.app_env.lower() not in {"development", "test"}:
        raise RuntimeError("Seeder is only allowed when APP_ENV is development or test.")

    parsed = urlparse(settings.database_url)
    database_name = parsed.path.lstrip("/")
    if parsed.scheme not in {"mysql", "mysql+pymysql"}:
        raise RuntimeError("Seeder only accepts the configured local MySQL database.")
    if parsed.hostname not in {"localhost", "127.0.0.1"}:
        raise RuntimeError(f"Refusing non-local database host: {parsed.hostname!r}.")
    if (parsed.port or 3306) != 3306 or database_name != "smtms":
        raise RuntimeError("Seeder is restricted to localhost:3306/smtms.")

    password = os.getenv("SMTMS_SEED_PASSWORD", LOCAL_SEED_PASSWORD)
    if len(password) < 12:
        raise RuntimeError("SMTMS_SEED_PASSWORD must be at least 12 characters.")
    if len(password.encode("utf-8")) > 72:
        raise RuntimeError("SMTMS_SEED_PASSWORD must be at most 72 UTF-8 bytes for bcrypt.")

    with engine.connect() as connection:
        actual_database, actual_port = connection.execute(
            text("SELECT DATABASE(), @@port")
        ).one()
        if actual_database != "smtms" or actual_port != 3306:
            raise RuntimeError(
                "Refusing unexpected live database target: "
                f"{actual_database!r} on port {actual_port}."
            )
        revision = connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one_or_none()
        if revision != "20261019_comments_first_schema":
            raise RuntimeError(f"Expected current schema revision, found {revision!r}.")
    return password


def _ids(session: Session, model, *criteria) -> list[int]:
    return list(session.scalars(select(model.id).where(*criteria)))


def _delete_ids(session: Session, model, ids: list[int]) -> None:
    if ids:
        session.execute(
            delete(model).where(model.id.in_(ids)),
            execution_options={"synchronize_session": False},
        )


def _remove_previous_seed(session: Session) -> None:
    user_ids = _ids(session, UserORM, UserORM.username.like(f"{SEED_USER_PREFIX}%"))
    role_ids = _ids(session, RoleORM, RoleORM.name.in_(SEED_ROLE_NAMES))
    permission_ids = _ids(
        session,
        PermissionORM,
        PermissionORM.code.like(f"{SEED_PERMISSION_PREFIX}%"),
    )
    supplier_ids = _ids(
        session,
        SupplierORM,
        SupplierORM.supplier_code.like(f"{SEED_SUPPLIER_PREFIX}%"),
    )
    material_ids = _ids(
        session,
        MaterialORM,
        MaterialORM.material_code.like(f"{SEED_MATERIAL_PREFIX}%"),
    )
    supplier_lot_ids = _ids(
        session,
        SupplierLotORM,
        SupplierLotORM.supplier_lot_no.like(f"{SEED_SUPPLIER_LOT_PREFIX}%"),
    )
    receipt_ids = _ids(
        session,
        MaterialReceiptORM,
        MaterialReceiptORM.receipt_no.like(f"{SEED_RECEIPT_PREFIX}%"),
    )
    internal_lot_ids = _ids(
        session,
        InternalMaterialLotORM,
        InternalMaterialLotORM.internal_lot_no.like(f"{SEED_INTERNAL_LOT_PREFIX}%"),
    )

    iqc_criteria = []
    if receipt_ids:
        iqc_criteria.append(IQCRecordORM.receipt_id.in_(receipt_ids))
    if internal_lot_ids:
        iqc_criteria.append(IQCRecordORM.internal_lot_id.in_(internal_lot_ids))
    if user_ids:
        iqc_criteria.append(IQCRecordORM.inspector_user_id.in_(user_ids))
    if iqc_criteria:
        session.execute(
            delete(IQCRecordORM).where(or_(*iqc_criteria)),
            execution_options={"synchronize_session": False},
        )

    _delete_ids(session, InternalMaterialLotORM, internal_lot_ids)
    _delete_ids(session, MaterialReceiptORM, receipt_ids)
    _delete_ids(session, SupplierLotORM, supplier_lot_ids)

    doc_criteria = []
    if supplier_ids:
        doc_criteria.append(SupplierQualificationDocumentORM.supplier_id.in_(supplier_ids))
    if user_ids:
        doc_criteria.append(SupplierQualificationDocumentORM.approved_by_user_id.in_(user_ids))
    if doc_criteria:
        session.execute(
            delete(SupplierQualificationDocumentORM).where(or_(*doc_criteria)),
            execution_options={"synchronize_session": False},
        )

    supplier_material_criteria = []
    if supplier_ids:
        supplier_material_criteria.append(SupplierMaterialORM.supplier_id.in_(supplier_ids))
    if material_ids:
        supplier_material_criteria.append(SupplierMaterialORM.material_id.in_(material_ids))
    if supplier_material_criteria:
        session.execute(
            delete(SupplierMaterialORM).where(or_(*supplier_material_criteria)),
            execution_options={"synchronize_session": False},
        )

    role_permission_criteria = []
    if role_ids:
        role_permission_criteria.append(RolePermissionORM.role_id.in_(role_ids))
    if permission_ids:
        role_permission_criteria.append(RolePermissionORM.permission_id.in_(permission_ids))
    if role_permission_criteria:
        session.execute(
            delete(RolePermissionORM).where(or_(*role_permission_criteria)),
            execution_options={"synchronize_session": False},
        )

    user_role_criteria = []
    if user_ids:
        user_role_criteria.append(UserRoleORM.user_id.in_(user_ids))
    if role_ids:
        user_role_criteria.append(UserRoleORM.role_id.in_(role_ids))
    if user_role_criteria:
        session.execute(
            delete(UserRoleORM).where(or_(*user_role_criteria)),
            execution_options={"synchronize_session": False},
        )

    _delete_ids(session, UserORM, user_ids)
    _delete_ids(session, SupplierORM, supplier_ids)
    _delete_ids(session, MaterialORM, material_ids)
    _delete_ids(session, RoleORM, role_ids)
    _delete_ids(session, PermissionORM, permission_ids)
    session.flush()


def _create_seed(session: Session, password: str) -> None:
    id_models = (
        UserORM,
        RoleORM,
        PermissionORM,
        UserRoleORM,
        RolePermissionORM,
        SupplierORM,
        SupplierQualificationDocumentORM,
        MaterialORM,
        SupplierMaterialORM,
        SupplierLotORM,
        MaterialReceiptORM,
        InternalMaterialLotORM,
        IQCRecordORM,
    )
    next_ids = {
        model: (session.scalar(select(func.max(model.id))) or 0) + 1
        for model in id_models
    }

    def allocate_id(model) -> int:
        value = next_ids[model]
        next_ids[model] += 1
        return value

    password_hash = get_password_hash(password)
    users = {
        "admin": UserORM(
            id=allocate_id(UserORM),
            username="seed_admin",
            email="seed_admin@example.test",
            password_hash=password_hash,
            is_active=True,
        ),
        "qa": UserORM(
            id=allocate_id(UserORM),
            username="seed_qa_1",
            email="seed_qa_1@example.test",
            password_hash=password_hash,
            is_active=True,
        ),
        "qa_backup": UserORM(
            id=allocate_id(UserORM),
            username="seed_qa_2",
            email="seed_qa_2@example.test",
            password_hash=password_hash,
            is_active=True,
        ),
        "receiver": UserORM(
            id=allocate_id(UserORM),
            username="seed_receiver_1",
            email="seed_receiver_1@example.test",
            password_hash=password_hash,
            is_active=True,
        ),
    }
    session.add_all(users.values())
    session.flush()

    roles = {
        "admin": RoleORM(
            id=allocate_id(RoleORM),
            name=SEED_ROLE_NAMES[0],
            description="Development-only test administrator",
        ),
        "qa": RoleORM(
            id=allocate_id(RoleORM),
            name=SEED_ROLE_NAMES[1],
            description="Development-only quality inspector",
        ),
        "receiver": RoleORM(
            id=allocate_id(RoleORM),
            name=SEED_ROLE_NAMES[2],
            description="Development-only receiving clerk",
        ),
    }
    session.add_all(roles.values())
    session.flush()

    permission_models = {
        code: PermissionORM(
            id=allocate_id(PermissionORM),
            code=f"{SEED_PERMISSION_PREFIX}{code}",
            name=name,
            description=f"Seed permission: {name}",
        )
        for code, name in PERMISSIONS
    }
    session.add_all(permission_models.values())
    session.flush()

    role_permissions = {
        "admin": tuple(permission_models),
        "qa": ("suppliers:read", "materials:read", "receipts:read", "iqc:read", "iqc:write"),
        "receiver": ("suppliers:read", "materials:read", "receipts:read", "receipts:write"),
    }
    session.add_all(
        RolePermissionORM(
            id=allocate_id(RolePermissionORM),
            role_id=roles[role_key].id,
            permission_id=permission_models[code].id,
        )
        for role_key, codes in role_permissions.items()
        for code in codes
    )
    session.add_all(
        (
            UserRoleORM(
                id=allocate_id(UserRoleORM),
                user_id=users["admin"].id,
                role_id=roles["admin"].id,
            ),
            UserRoleORM(
                id=allocate_id(UserRoleORM),
                user_id=users["qa"].id,
                role_id=roles["qa"].id,
            ),
            UserRoleORM(
                id=allocate_id(UserRoleORM),
                user_id=users["qa_backup"].id,
                role_id=roles["qa"].id,
            ),
            UserRoleORM(
                id=allocate_id(UserRoleORM),
                user_id=users["receiver"].id,
                role_id=roles["receiver"].id,
            ),
        )
    )

    suppliers = [
        SupplierORM(
            id=allocate_id(SupplierORM),
            supplier_code=f"{SEED_SUPPLIER_PREFIX}{index:03d}",
            supplier_name=name,
            contact_name=contact,
            phone=phone,
            email=email,
            status="active",
            address=f"No. {index + 10}, Industrial Road",
            country=country,
        )
        for index, (name, contact, phone, email, country) in enumerate(SUPPLIER_DATA, start=1)
    ]
    materials = [
        MaterialORM(
            id=allocate_id(MaterialORM),
            material_code=f"{SEED_MATERIAL_PREFIX}{index:03d}",
            material_name=name,
            material_type=material_type,
            spec=spec,
            uom=uom,
            status="active",
        )
        for index, (name, material_type, spec, uom) in enumerate(MATERIAL_DATA, start=1)
    ]
    session.add_all([*suppliers, *materials])
    session.flush()

    today = date.today()
    qualification_documents = []
    for index, supplier in enumerate(suppliers):
        if index % 3 == 0:
            expires_at = today + timedelta(days=330)
            status = "active"
        elif index % 3 == 1:
            expires_at = today + timedelta(days=20)
            status = "expiring"
        else:
            expires_at = today - timedelta(days=30)
            status = "expired"
        qualification_documents.append(
            SupplierQualificationDocumentORM(
                id=allocate_id(SupplierQualificationDocumentORM),
                supplier_id=supplier.id,
                doc_type="ISO 9001",
                doc_code=f"SEED-CERT-{index + 1:03d}",
                doc_name=f"{supplier.supplier_name} Quality Certificate",
                file_path=f"seed-documents/suppliers/{supplier.supplier_code}/iso-9001.pdf",
                issued_at=datetime.combine(expires_at - timedelta(days=365), time.min),
                expires_at=datetime.combine(expires_at, time.min),
                approved_by_user_id=users["qa"].id,
                status=status,
            )
        )
    session.add_all(qualification_documents)

    supplier_materials = []
    for material_index, material in enumerate(materials):
        first_supplier_index = material_index % len(suppliers)
        for supplier_index in (first_supplier_index, (first_supplier_index + 1) % len(suppliers)):
            supplier = suppliers[supplier_index]
            supplier_materials.append(
                SupplierMaterialORM(
                    id=allocate_id(SupplierMaterialORM),
                    supplier_id=supplier.id,
                    material_id=material.id,
                    supplier_material_code=f"{supplier.supplier_code}-{material.material_code[-3:]}",
                    is_preferred=supplier_index == first_supplier_index,
                )
            )
    session.add_all(supplier_materials)
    session.flush()

    supplier_lots: list[SupplierLotORM] = []
    receipts: list[MaterialReceiptORM] = []
    internal_lots: list[InternalMaterialLotORM] = []
    iqc_records: list[IQCRecordORM] = []

    for index, outcome in enumerate(BATCH_OUTCOMES):
        supplier_index = index % len(suppliers)
        material_index = index % len(materials)
        supplier = suppliers[supplier_index]
        material = materials[material_index]
        batch_number = f"{SEED_SUPPLIER_LOT_PREFIX}{index + 1:03d}"
        received_at = datetime.combine(today - timedelta(days=35 - index), time(9, 30))
        batch_quantity = Decimal("100.0000") + Decimal(index * 10)

        supplier_lot = SupplierLotORM(
            id=allocate_id(SupplierLotORM),
            supplier_id=supplier.id,
            material_id=material.id,
            supplier_lot_no=batch_number,
            manufacturing_date=received_at - timedelta(days=30),
            expiry_date=received_at + timedelta(days=365),
            qty_received=batch_quantity,
            uom=material.uom,
            qc_status=outcome,
        )
        supplier_lots.append(supplier_lot)
        session.add(supplier_lot)
        session.flush()

        receipt = MaterialReceiptORM(
            id=allocate_id(MaterialReceiptORM),
            supplier_id=supplier.id,
            material_id=material.id,
            supplier_lot_id=supplier_lot.id,
            receipt_no=f"{SEED_RECEIPT_PREFIX}{index + 1:03d}",
            received_at=received_at,
            received_by_user_id=users["receiver"].id,
            qty_received=batch_quantity,
            qty_remaining=batch_quantity if outcome == "passed" else Decimal("0.0000"),
            status="received",
            notes=f"Development QA scenario: {outcome}",
        )
        receipts.append(receipt)
        session.add(receipt)
        session.flush()

        split_count = 2 if index < 5 else 1
        child_quantity = batch_quantity / split_count
        for part in range(split_count):
            lot_status, release_status = {
                "passed": ("available", "released"),
                "pending": ("quarantine", "hold"),
                "failed": ("rejected", "rejected"),
            }[outcome]
            internal_lot = InternalMaterialLotORM(
                id=allocate_id(InternalMaterialLotORM),
                material_id=material.id,
                supplier_lot_id=supplier_lot.id,
                receipt_id=receipt.id,
                internal_lot_no=f"{SEED_INTERNAL_LOT_PREFIX}{index + 1:03d}-{part + 1}",
                qty_on_hand=child_quantity if outcome == "passed" else Decimal("0.0000"),
                qty_reserved=Decimal("0.0000"),
                uom=material.uom,
                lot_status=lot_status,
                expiry_date=supplier_lot.expiry_date,
            )
            internal_lots.append(internal_lot)
            session.add(internal_lot)
            session.flush()

            iqc_records.append(
                IQCRecordORM(
                    id=allocate_id(IQCRecordORM),
                    receipt_id=receipt.id,
                    internal_lot_id=internal_lot.id,
                    inspector_user_id=users[
                        "qa" if index % 2 == 0 else "qa_backup"
                    ].id,
                    sample_qty=Decimal("0.2500"),
                    inspection_result=outcome,
                    inspection_date=(
                        None
                        if outcome == "pending"
                        else received_at + timedelta(days=1)
                    ),
                    release_status=release_status,
                    remarks=f"Seeded inspection outcome: {outcome}",
                )
            )

    session.add_all(iqc_records)
    session.flush()


def _validate_seed(session: Session) -> dict[str, int]:
    models = (
        UserORM,
        RoleORM,
        PermissionORM,
        UserRoleORM,
        RolePermissionORM,
        SupplierORM,
        SupplierQualificationDocumentORM,
        MaterialORM,
        SupplierMaterialORM,
        SupplierLotORM,
        MaterialReceiptORM,
        InternalMaterialLotORM,
        IQCRecordORM,
    )
    counts = {
        model.__tablename__: session.scalar(select(func.count()).select_from(model)) or 0
        for model in models
    }

    expected_minimums = {
        "users": 4,
        "roles": 3,
        "permissions": len(PERMISSIONS),
        "user_roles": 4,
        "role_permissions": 1,
        "suppliers": 6,
        "supplier_qualification_documents": 6,
        "materials": 12,
        "supplier_materials": 24,
        "supplier_lots": 20,
        "material_receipts": 20,
        "internal_material_lots": 25,
        "iqc_records": 20,
    }
    for table, minimum in expected_minimums.items():
        if counts[table] < minimum:
            raise RuntimeError(
                f"Validation failed: {table} has {counts[table]} rows; "
                f"expected at least {minimum}."
            )

    broken_relationships = {
        "receipt_supplier": select(func.count()).select_from(MaterialReceiptORM).outerjoin(
            SupplierORM, MaterialReceiptORM.supplier_id == SupplierORM.id
        ).where(SupplierORM.id.is_(None)),
        "receipt_material": select(func.count()).select_from(MaterialReceiptORM).outerjoin(
            MaterialORM, MaterialReceiptORM.material_id == MaterialORM.id
        ).where(MaterialORM.id.is_(None)),
        "receipt_supplier_lot": select(func.count()).select_from(MaterialReceiptORM).outerjoin(
            SupplierLotORM, MaterialReceiptORM.supplier_lot_id == SupplierLotORM.id
        ).where(SupplierLotORM.id.is_(None)),
        "internal_lot_material": select(func.count()).select_from(InternalMaterialLotORM).outerjoin(
            MaterialORM, InternalMaterialLotORM.material_id == MaterialORM.id
        ).where(MaterialORM.id.is_(None)),
        "iqc_internal_lot": select(func.count()).select_from(IQCRecordORM).outerjoin(
            InternalMaterialLotORM, IQCRecordORM.internal_lot_id == InternalMaterialLotORM.id
        ).where(InternalMaterialLotORM.id.is_(None)),
    }
    broken_counts = {
        name: session.scalar(statement) or 0
        for name, statement in broken_relationships.items()
    }
    if any(broken_counts.values()):
        raise RuntimeError(
            f"Validation failed: broken foreign-key relationships: {broken_counts}."
        )

    inconsistent = session.scalar(
        select(func.count())
        .select_from(IQCRecordORM)
        .join(InternalMaterialLotORM, IQCRecordORM.internal_lot_id == InternalMaterialLotORM.id)
        .where(
            or_(
                and_(
                    IQCRecordORM.inspection_result == "passed",
                    or_(
                        IQCRecordORM.release_status != "released",
                        InternalMaterialLotORM.lot_status != "available",
                    ),
                ),
                and_(
                    IQCRecordORM.inspection_result == "pending",
                    or_(
                        IQCRecordORM.release_status != "hold",
                        InternalMaterialLotORM.lot_status != "quarantine",
                    ),
                ),
                and_(
                    IQCRecordORM.inspection_result == "failed",
                    or_(
                        IQCRecordORM.release_status != "rejected",
                        InternalMaterialLotORM.lot_status != "rejected",
                    ),
                ),
            )
        )
    ) or 0
    if inconsistent:
        raise RuntimeError(
            "Validation failed: "
            f"{inconsistent} IQC/internal-lot states are inconsistent."
        )

    split_supplier_lots = session.scalar(
        select(func.count())
        .select_from(
            select(InternalMaterialLotORM.supplier_lot_id)
            .group_by(InternalMaterialLotORM.supplier_lot_id)
            .having(func.count(InternalMaterialLotORM.id) > 1)
            .subquery()
        )
    ) or 0
    if split_supplier_lots < 5:
        raise RuntimeError(
            f"Validation failed: expected split supplier lots, found {split_supplier_lots}."
        )
    return counts


def main() -> int:
    try:
        password = _require_safe_environment()
        with SessionLocal() as session, session.begin():
            _remove_previous_seed(session)
            _create_seed(session, password)
            counts = _validate_seed(session)
    except Exception as exc:
        print(f"Seeder aborted: {exc}", file=sys.stderr)
        return 1

    print("Development/test QA data seeded successfully.")
    for table, count in counts.items():
        print(f"{table}: {count}")
    print(
        "Quality scenarios: available/released, pending/quarantine, failed/rejected, "
        "split lots, and varied supplier certificate expiry."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
