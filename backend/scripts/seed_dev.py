"""Populate deterministic SMTMS development/test QA data.

Run from backend/: uv run python scripts/seed_dev.py

The seeder is idempotent and non-destructive:

* every seeded record is identified by a stable ``SEED-*`` business key;
* existing seeded rows are updated in place, so primary keys stay stable;
* rows the seeder does not own are never modified, and a business-key clash
  with foreign data aborts the run with an explicit error instead of
  overwriting anything;
* nothing is ever deleted, so ``LIVE-*`` and other manually created records
  are left untouched.

The local test password is read from SMTMS_SEED_PASSWORD and restricted to this
guarded development/test seeder.
"""

from __future__ import annotations

import os
import sys
from collections.abc import Callable
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
    QualityReviewORM,
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
from app.services.supplier_import import (
    SUPPLIER_ROLE_DESCRIPTION,
    SUPPLIER_ROLE_NAME,
    SUPPLIER_ROLE_PERMISSION,
)
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.orm import Session

SEED_USER_PREFIX = "seed_"
SEED_SUPPLIER_USER_PREFIX = "seed_supplier_"
SEED_ROLE_NAMES = ("SMTMS Seed Administrator", "SMTMS Seed QA", "SMTMS Seed Receiver")
SEED_PERMISSION_PREFIX = "seed:"
SEED_SUPPLIER_PREFIX = "SEED-SUP-"
SEED_MATERIAL_PREFIX = "SEED-MAT-"
SEED_SUPPLIER_LOT_PREFIX = "SEED-SLOT-"
SEED_RECEIPT_PREFIX = "SEED-REC-"
SEED_INTERNAL_LOT_PREFIX = "SEED-ILOT-"
SEED_DOCUMENT_PREFIX = "SEED-CERT-"
SEED_IQC_REMARK_PREFIX = "Seeded inspection outcome:"
SEED_REQUIRED_REVISION = "20261019_doc_attachments"
SEED_REVIEW_NOTE_PREFIX = "SEED-SIGNOFF:"

SUPPLIER_DATA = (
    (
        "Harbor Industrial Supply", "林怡君", "02-2550-1001", "harbor@example.test",
        "Taiwan", "91000001", "active",
    ),
    (
        "Evergreen Polymer Co.", "陳冠宇", "04-2300-2002", "evergreen@example.test",
        "Taiwan", "91000002", "active",
    ),
    (
        "Northstar Components", "王雅婷", "03-5500-3003", "northstar@example.test",
        "Taiwan", "91000003", "active",
    ),
    (
        "Pacific Precision Materials", "李承翰", "07-3300-4004", "pacific@example.test",
        "Taiwan", "91000004", "active",
    ),
    (
        "Summit Chemical Works", "張家豪", "06-2200-5005", "summit@example.test",
        "Taiwan", "91000005", "inactive",
    ),
    (
        "Cedar Packaging Group", "黃詩涵", "02-2600-6006", "cedar@example.test",
        "Taiwan", "91000006", "active",
    ),
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
    ("supplier-lots:write", "Create supplier lots"),
    ("quality:review", "Review incoming inspections"),
    ("quality:approve", "Approve incoming inspections"),
    ("quality:return", "Return incoming inspections for correction"),
    ("users:manage", "Manage user access"),
)

INTERNAL_USERS = (
    ("seed_admin", "seed_admin@example.test"),
    ("seed_qa_1", "seed_qa_1@example.test"),
    ("seed_qa_2", "seed_qa_2@example.test"),
    ("seed_receiver_1", "seed_receiver_1@example.test"),
)

ROLE_PERMISSION_CODES = {
    "admin": tuple(code for code, _ in PERMISSIONS),
    "qa": (
        "suppliers:read",
        "materials:read",
        "receipts:read",
        "iqc:read",
        "iqc:write",
        "quality:review",
        "quality:approve",
        "quality:return",
    ),
    "receiver": (
        "suppliers:read",
        "materials:read",
        "receipts:read",
        "receipts:write",
        "supplier-lots:write",
    ),
}

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

EXPECTED_SEEDED_COUNTS = {
    "suppliers": 6,
    "supplier_accounts": 6,
    "internal_users": 4,
    "materials": 12,
    "supplier_materials": 24,
    "qualification_documents": 6,
    "supplier_lots": 20,
    "material_receipts": 20,
    "internal_material_lots": 25,
    "iqc_records": 25,
    "roles": 3,
    "permissions": len(PERMISSIONS),
    "user_roles": 10,
    "role_permissions": 26,
}


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

    password = get_settings().smtms_seed_password or os.getenv("SMTMS_SEED_PASSWORD")
    if not password:
        raise RuntimeError("Set SMTMS_SEED_PASSWORD before running the development seeder.")
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
        if revision != SEED_REQUIRED_REVISION:
            raise RuntimeError(
                f"Expected schema revision {SEED_REQUIRED_REVISION!r}, found {revision!r}."
            )
    return password


def _owned_by_prefix(attribute: str, prefix: str) -> Callable[[object], bool]:
    def predicate(row: object) -> bool:
        return str(getattr(row, attribute) or "").startswith(prefix)

    return predicate


def _upsert(
    session: Session,
    model,
    identity: dict[str, object],
    values: dict[str, object] | None = None,
    *,
    owned: Callable[[object], bool] | None = None,
    label: str = "record",
):
    """Create the row, or update it only when the seeder owns it.

    A matching row that the seeder does not own aborts with an explicit error
    instead of being overwritten.
    """
    filters = [getattr(model, column) == value for column, value in identity.items()]
    row = session.scalar(select(model).where(*filters))
    if row is None:
        row = model(**identity, **(values or {}))
        session.add(row)
        session.flush()
        return row

    if owned is not None and not owned(row):
        raise RuntimeError(
            f"Refusing to overwrite non-seeder data: {label} matching {identity} "
            "already exists and is not managed by this seeder."
        )

    changed = False
    for column, value in (values or {}).items():
        if getattr(row, column) != value:
            setattr(row, column, value)
            changed = True
    if changed:
        session.flush()
    return row


def _sync_seed(session: Session, password: str) -> None:
    """Upsert every seeded record. No row is deleted and IDs are DB-assigned."""
    password_hash = get_password_hash(password)

    # Shared supplier-portal role/permission, created on demand like the Excel
    # import flow does. These are intentionally not "seed:"-prefixed.
    portal_role = _upsert(
        session,
        RoleORM,
        {"name": SUPPLIER_ROLE_NAME},
        {"description": SUPPLIER_ROLE_DESCRIPTION},
        owned=lambda row: True,
        label="supplier portal role",
    )
    portal_permission = _upsert(
        session,
        PermissionORM,
        {"code": SUPPLIER_ROLE_PERMISSION},
        {"name": "讀取供應商資料", "description": "供應商入口帳號可讀取供應商基本資料。"},
        owned=lambda row: True,
        label="supplier portal permission",
    )
    _upsert(
        session,
        RolePermissionORM,
        {"role_id": portal_role.id, "permission_id": portal_permission.id},
        owned=lambda row: True,
        label="supplier portal role-permission link",
    )

    users = {
        username: _upsert(
            session,
            UserORM,
            {"username": username},
            {"email": email, "password_hash": password_hash, "is_active": True},
            owned=_owned_by_prefix("username", SEED_USER_PREFIX),
            label="internal user",
        )
        for username, email in INTERNAL_USERS
    }

    roles = {
        key: _upsert(
            session,
            RoleORM,
            {"name": name},
            {"description": description},
            owned=lambda row: True,
            label="seed role",
        )
        for key, (name, description) in zip(
            ("admin", "qa", "receiver"),
            (
                (SEED_ROLE_NAMES[0], "Development-only test administrator"),
                (SEED_ROLE_NAMES[1], "Development-only quality inspector"),
                (SEED_ROLE_NAMES[2], "Development-only receiving clerk"),
            ),
            strict=True,
        )
    }

    permissions = {
        code: _upsert(
            session,
            PermissionORM,
            {"code": f"{SEED_PERMISSION_PREFIX}{code}"},
            {"name": name, "description": f"Seed permission: {name}"},
            owned=_owned_by_prefix("code", SEED_PERMISSION_PREFIX),
            label="seed permission",
        )
        for code, name in PERMISSIONS
    }

    for role_key, codes in ROLE_PERMISSION_CODES.items():
        for code in codes:
            _upsert(
                session,
                RolePermissionORM,
                {"role_id": roles[role_key].id, "permission_id": permissions[code].id},
                owned=lambda row: True,
                label="seed role-permission link",
            )

    for user_key, role_key in (
        ("seed_admin", "admin"),
        ("seed_qa_1", "qa"),
        ("seed_qa_2", "qa"),
        ("seed_receiver_1", "receiver"),
    ):
        _upsert(
            session,
            UserRoleORM,
            {"user_id": users[user_key].id, "role_id": roles[role_key].id},
            owned=lambda row: True,
            label="seed user-role link",
        )

    suppliers = [
        _upsert(
            session,
            SupplierORM,
            {"supplier_code": f"{SEED_SUPPLIER_PREFIX}{index:03d}"},
            {
                "supplier_name": name,
                "tax_id": tax_id,
                "contact_name": contact,
                "phone": phone,
                "email": email,
                "status": status,
                "address": f"No. {index + 10}, Industrial Road",
                "country": country,
            },
            owned=_owned_by_prefix("supplier_code", SEED_SUPPLIER_PREFIX),
            label="supplier",
        )
        for index, (name, contact, phone, email, country, tax_id, status) in enumerate(
            SUPPLIER_DATA, start=1
        )
    ]

    materials = [
        _upsert(
            session,
            MaterialORM,
            {"material_code": f"{SEED_MATERIAL_PREFIX}{index:03d}"},
            {
                "material_name": name,
                "material_type": material_type,
                "spec": spec,
                "uom": uom,
                "status": "active",
            },
            owned=_owned_by_prefix("material_code", SEED_MATERIAL_PREFIX),
            label="material",
        )
        for index, (name, material_type, spec, uom) in enumerate(MATERIAL_DATA, start=1)
    ]

    for index, supplier in enumerate(suppliers, start=1):
        account = _upsert(
            session,
            UserORM,
            {"username": f"{SEED_SUPPLIER_USER_PREFIX}{index:03d}"},
            {
                "email": f"seed_supplier_{index:03d}@example.test",
                "password_hash": password_hash,
                "is_active": True,
                "supplier_id": supplier.id,
                "must_change_password": True,
            },
            owned=_owned_by_prefix("username", SEED_USER_PREFIX),
            label="supplier account",
        )
        _upsert(
            session,
            UserRoleORM,
            {"user_id": account.id, "role_id": portal_role.id},
            owned=lambda row: True,
            label="supplier account role link",
        )

    today = date.today()
    for index, supplier in enumerate(suppliers):
        if index % 3 == 0:
            expires_at = today + timedelta(days=330)
            doc_status = "active"
        elif index % 3 == 1:
            expires_at = today + timedelta(days=20)
            doc_status = "expiring"
        else:
            expires_at = today - timedelta(days=30)
            doc_status = "expired"
        _upsert(
            session,
            SupplierQualificationDocumentORM,
            {"doc_code": f"{SEED_DOCUMENT_PREFIX}{index + 1:03d}"},
            {
                "supplier_id": supplier.id,
                "doc_type": "ISO 9001",
                "doc_name": f"{supplier.supplier_name} Quality Certificate",
                "file_path": f"seed-documents/suppliers/{supplier.supplier_code}/iso-9001.pdf",
                "issued_at": datetime.combine(expires_at - timedelta(days=365), time.min),
                "expires_at": datetime.combine(expires_at, time.min),
                "approved_by_user_id": users["seed_qa_1"].id,
                "status": doc_status,
            },
            owned=_owned_by_prefix("doc_code", SEED_DOCUMENT_PREFIX),
            label="qualification document",
        )

    for material_index, material in enumerate(materials):
        first_supplier_index = material_index % len(suppliers)
        for supplier_index in (first_supplier_index, (first_supplier_index + 1) % len(suppliers)):
            supplier = suppliers[supplier_index]
            supplier_material_code = f"{supplier.supplier_code}-{material.material_code[-3:]}"
            _upsert(
                session,
                SupplierMaterialORM,
                {"supplier_id": supplier.id, "material_id": material.id},
                {
                    "supplier_material_code": supplier_material_code,
                    "is_preferred": supplier_index == first_supplier_index,
                },
                owned=lambda row: True,
                label="supplier material link",
            )

    for index, outcome in enumerate(BATCH_OUTCOMES):
        supplier_index = index % len(suppliers)
        material_index = index % len(materials)
        supplier = suppliers[supplier_index]
        material = materials[material_index]
        received_at = datetime.combine(today - timedelta(days=35 - index), time(9, 30))
        batch_quantity = Decimal("100.0000") + Decimal(index * 10)

        supplier_lot = _upsert(
            session,
            SupplierLotORM,
            {"supplier_lot_no": f"{SEED_SUPPLIER_LOT_PREFIX}{index + 1:03d}"},
            {
                "supplier_id": supplier.id,
                "material_id": material.id,
                "manufacturing_date": received_at - timedelta(days=30),
                "expiry_date": received_at + timedelta(days=365),
                "qty_received": batch_quantity,
                "uom": material.uom,
                "qc_status": outcome,
            },
            owned=_owned_by_prefix("supplier_lot_no", SEED_SUPPLIER_LOT_PREFIX),
            label="supplier lot",
        )

        receipt = _upsert(
            session,
            MaterialReceiptORM,
            {"receipt_no": f"{SEED_RECEIPT_PREFIX}{index + 1:03d}"},
            {
                "supplier_id": supplier.id,
                "material_id": material.id,
                "supplier_lot_id": supplier_lot.id,
                "received_at": received_at,
                "received_by_user_id": users["seed_receiver_1"].id,
                "qty_received": batch_quantity,
                "qty_remaining": batch_quantity if outcome == "passed" else Decimal("0.0000"),
                "status": "received",
                "notes": f"Development QA scenario: {outcome}",
            },
            owned=_owned_by_prefix("receipt_no", SEED_RECEIPT_PREFIX),
            label="material receipt",
        )

        split_count = 2 if index < 5 else 1
        child_quantity = batch_quantity / split_count
        lot_status, release_status = {
            "passed": ("available", "released"),
            "pending": ("quarantine", "hold"),
            "failed": ("rejected", "rejected"),
        }[outcome]
        for part in range(split_count):
            internal_lot = _upsert(
                session,
                InternalMaterialLotORM,
                {"internal_lot_no": f"{SEED_INTERNAL_LOT_PREFIX}{index + 1:03d}-{part + 1}"},
                {
                    "material_id": material.id,
                    "supplier_lot_id": supplier_lot.id,
                    "receipt_id": receipt.id,
                    "qty_on_hand": child_quantity if outcome == "passed" else Decimal("0.0000"),
                    "qty_reserved": Decimal("0.0000"),
                    "uom": material.uom,
                    "lot_status": lot_status,
                    "expiry_date": supplier_lot.expiry_date,
                },
                owned=_owned_by_prefix("internal_lot_no", SEED_INTERNAL_LOT_PREFIX),
                label="internal material lot",
            )
            _upsert(
                session,
                IQCRecordORM,
                {"internal_lot_id": internal_lot.id},
                {
                    "receipt_id": receipt.id,
                    "inspector_user_id": users[
                        "seed_qa_1" if index % 2 == 0 else "seed_qa_2"
                    ].id,
                    "sample_qty": Decimal("0.2500"),
                    "inspection_result": outcome,
                    "inspection_date": (
                        None if outcome == "pending" else received_at + timedelta(days=1)
                    ),
                    "release_status": release_status,
                    "remarks": f"{SEED_IQC_REMARK_PREFIX} {outcome}",
                },
                owned=lambda row: str(getattr(row, "remarks", "") or "").startswith(
                    SEED_IQC_REMARK_PREFIX
                ),
                label="IQC record",
            )

    _seed_signoff_examples(session, users)


def _seed_signoff_examples(session: Session, users: dict[str, UserORM]) -> None:
    """Add deterministic QA examples only to untouched, seeder-owned IQC rows.

    Seed decisions are never replayed over an IQC that has any review history.
    This keeps real QA actions and final statuses intact on subsequent runs.
    """
    records = session.scalars(
        select(IQCRecordORM)
        .where(IQCRecordORM.remarks.like(f"{SEED_IQC_REMARK_PREFIX}%"))
        .order_by(IQCRecordORM.id)
    ).all()
    if not records:
        return

    reviewed_ids = set(
        session.scalars(
            select(QualityReviewORM.iqc_record_id).where(
                QualityReviewORM.iqc_record_id.in_([record.id for record in records])
            )
        )
    )
    untouched = [
        record
        for record in records
        if record.id not in reviewed_ids and record.review_status == "pending"
    ]
    seeded_decisions = set(
        session.scalars(
            select(QualityReviewORM.review_status).where(
                QualityReviewORM.decision_note.like(f"{SEED_REVIEW_NOTE_PREFIX}%")
            )
        )
    )
    approved_example = (
        next((record for record in untouched if record.inspection_result == "passed"), None)
        if "approved" not in seeded_decisions
        else None
    )
    returned_example = (
        next((record for record in untouched if record.inspection_result == "pending"), None)
        if "returned" not in seeded_decisions
        else None
    )
    if approved_example is not None:
        _add_seed_review(
            session,
            approved_example,
            status="approved",
            reviewer=users["seed_qa_2"],
            decision_note=f"{SEED_REVIEW_NOTE_PREFIX}approved:{approved_example.id}",
            reason=None,
        )
    if returned_example is not None:
        _add_seed_review(
            session,
            returned_example,
            status="returned",
            reviewer=users["seed_qa_1"],
            decision_note=f"{SEED_REVIEW_NOTE_PREFIX}returned:{returned_example.id}",
            reason="範例退回：請補齊供應商檢驗報告後重新送審。",
        )


def _add_seed_review(
    session: Session,
    record: IQCRecordORM,
    *,
    status: str,
    reviewer: UserORM,
    decision_note: str,
    reason: str | None,
) -> None:
    # Recheck the record before writing in case it already has non-seed history.
    existing_review = session.scalar(
        select(QualityReviewORM.id)
        .where(QualityReviewORM.iqc_record_id == record.id)
        .limit(1)
    )
    if existing_review is not None or record.review_status != "pending":
        return

    reviewed_at = record.inspection_date or datetime.combine(date.today(), time(9, 0))
    session.add(
        QualityReviewORM(
            iqc_record_id=record.id,
            review_status=status,
            decision=status,
            reviewed_by_user_id=reviewer.id,
            decision_note=decision_note,
            reason=reason,
            reviewed_at=reviewed_at,
        )
    )
    record.review_status = status
    record.reviewed_by_user_id = reviewer.id
    record.reviewed_at = reviewed_at
    record.review_decision_note = decision_note
    session.flush()


def _validate_seed(session: Session) -> dict[str, int]:
    seed_supplier_ids = list(
        session.scalars(
            select(SupplierORM.id).where(
                SupplierORM.supplier_code.like(f"{SEED_SUPPLIER_PREFIX}%")
            )
        )
    )
    seed_material_ids = list(
        session.scalars(
            select(MaterialORM.id).where(
                MaterialORM.material_code.like(f"{SEED_MATERIAL_PREFIX}%")
            )
        )
    )
    seed_user_ids = list(
        session.scalars(
            select(UserORM.id).where(UserORM.username.like(f"{SEED_USER_PREFIX}%"))
        )
    )
    seed_role_ids = list(
        session.scalars(select(RoleORM.id).where(RoleORM.name.in_(SEED_ROLE_NAMES)))
    )
    seed_permission_ids = list(
        session.scalars(
            select(PermissionORM.id).where(
                PermissionORM.code.like(f"{SEED_PERMISSION_PREFIX}%")
            )
        )
    )
    seed_internal_lot_ids = list(
        session.scalars(
            select(InternalMaterialLotORM.id).where(
                InternalMaterialLotORM.internal_lot_no.like(f"{SEED_INTERNAL_LOT_PREFIX}%")
            )
        )
    )

    def count(statement) -> int:
        return session.scalar(statement) or 0

    counts = {
        "suppliers": len(seed_supplier_ids),
        "materials": len(seed_material_ids),
        "supplier_lots": count(
            select(func.count())
            .select_from(SupplierLotORM)
            .where(SupplierLotORM.supplier_lot_no.like(f"{SEED_SUPPLIER_LOT_PREFIX}%"))
        ),
        "material_receipts": count(
            select(func.count())
            .select_from(MaterialReceiptORM)
            .where(MaterialReceiptORM.receipt_no.like(f"{SEED_RECEIPT_PREFIX}%"))
        ),
        "internal_material_lots": len(seed_internal_lot_ids),
        "iqc_records": count(
            select(func.count())
            .select_from(IQCRecordORM)
            .where(IQCRecordORM.internal_lot_id.in_(seed_internal_lot_ids))
        )
        if seed_internal_lot_ids
        else 0,
        "pending_iqc_signoffs": count(
            select(func.count())
            .select_from(IQCRecordORM)
            .where(
                IQCRecordORM.internal_lot_id.in_(seed_internal_lot_ids),
                IQCRecordORM.review_status == "pending",
            )
        )
        if seed_internal_lot_ids
        else 0,
        "approved_iqc_signoffs": count(
            select(func.count())
            .select_from(IQCRecordORM)
            .where(
                IQCRecordORM.internal_lot_id.in_(seed_internal_lot_ids),
                IQCRecordORM.review_status == "approved",
            )
        )
        if seed_internal_lot_ids
        else 0,
        "returned_iqc_signoffs": count(
            select(func.count())
            .select_from(IQCRecordORM)
            .where(
                IQCRecordORM.internal_lot_id.in_(seed_internal_lot_ids),
                IQCRecordORM.review_status == "returned",
            )
        )
        if seed_internal_lot_ids
        else 0,
        "seed_signoff_history": count(
            select(func.count())
            .select_from(QualityReviewORM)
            .where(QualityReviewORM.decision_note.like(f"{SEED_REVIEW_NOTE_PREFIX}%"))
        ),
        "supplier_materials": count(
            select(func.count())
            .select_from(SupplierMaterialORM)
            .where(
                SupplierMaterialORM.supplier_id.in_(seed_supplier_ids),
                SupplierMaterialORM.material_id.in_(seed_material_ids),
            )
        ),
        "qualification_documents": count(
            select(func.count())
            .select_from(SupplierQualificationDocumentORM)
            .where(
                SupplierQualificationDocumentORM.doc_code.like(f"{SEED_DOCUMENT_PREFIX}%")
            )
        ),
        "roles": len(seed_role_ids),
        "permissions": len(seed_permission_ids),
        "supplier_accounts": count(
            select(func.count())
            .select_from(UserORM)
            .where(UserORM.username.like(f"{SEED_SUPPLIER_USER_PREFIX}%"))
        ),
        "internal_users": count(
            select(func.count())
            .select_from(UserORM)
            .where(
                UserORM.username.in_([username for username, _ in INTERNAL_USERS])
            )
        ),
        "user_roles": count(
            select(func.count())
            .select_from(UserRoleORM)
            .where(UserRoleORM.user_id.in_(seed_user_ids))
        ),
        "role_permissions": count(
            select(func.count())
            .select_from(RolePermissionORM)
            .where(RolePermissionORM.role_id.in_(seed_role_ids))
        ),
    }

    for table, expected in EXPECTED_SEEDED_COUNTS.items():
        if counts[table] != expected:
            raise RuntimeError(
                f"Validation failed: seeded {table} is {counts[table]}; expected {expected}."
            )

    broken_relationships = {
        "receipt_supplier": select(func.count()).select_from(MaterialReceiptORM).outerjoin(
            SupplierORM, MaterialReceiptORM.supplier_id == SupplierORM.id
        ).where(
            MaterialReceiptORM.receipt_no.like(f"{SEED_RECEIPT_PREFIX}%"),
            SupplierORM.id.is_(None),
        ),
        "receipt_supplier_lot": select(func.count()).select_from(MaterialReceiptORM).outerjoin(
            SupplierLotORM, MaterialReceiptORM.supplier_lot_id == SupplierLotORM.id
        ).where(
            MaterialReceiptORM.receipt_no.like(f"{SEED_RECEIPT_PREFIX}%"),
            SupplierLotORM.id.is_(None),
        ),
        "internal_lot_material": select(func.count()).select_from(InternalMaterialLotORM).outerjoin(
            MaterialORM, InternalMaterialLotORM.material_id == MaterialORM.id
        ).where(
            InternalMaterialLotORM.internal_lot_no.like(f"{SEED_INTERNAL_LOT_PREFIX}%"),
            MaterialORM.id.is_(None),
        ),
        "iqc_internal_lot": select(func.count()).select_from(IQCRecordORM).outerjoin(
            InternalMaterialLotORM, IQCRecordORM.internal_lot_id == InternalMaterialLotORM.id
        ).where(
            IQCRecordORM.internal_lot_id.in_(seed_internal_lot_ids),
            InternalMaterialLotORM.id.is_(None),
        )
        if seed_internal_lot_ids
        else select(func.count()).select_from(IQCRecordORM).where(
            IQCRecordORM.internal_lot_id.in_([])
        ),
    }
    broken_counts = {name: count(statement) for name, statement in broken_relationships.items()}
    if any(broken_counts.values()):
        raise RuntimeError(
            f"Validation failed: broken foreign-key relationships: {broken_counts}."
        )

    inconsistent = session.scalar(
        select(func.count())
        .select_from(IQCRecordORM)
        .join(InternalMaterialLotORM, IQCRecordORM.internal_lot_id == InternalMaterialLotORM.id)
        .where(
            IQCRecordORM.internal_lot_id.in_(seed_internal_lot_ids),
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
            ),
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
            .where(InternalMaterialLotORM.internal_lot_no.like(f"{SEED_INTERNAL_LOT_PREFIX}%"))
            .group_by(InternalMaterialLotORM.supplier_lot_id)
            .having(func.count(InternalMaterialLotORM.id) > 1)
            .subquery()
        )
    ) or 0
    if split_supplier_lots < 5:
        raise RuntimeError(
            f"Validation failed: expected split supplier lots, found {split_supplier_lots}."
        )

    seeded_supplier_id_set = set(seed_supplier_ids)
    account_supplier_ids = set(
        session.scalars(
            select(UserORM.supplier_id).where(
                UserORM.username.like(f"{SEED_SUPPLIER_USER_PREFIX}%")
            )
        )
    )
    if account_supplier_ids != seeded_supplier_id_set:
        raise RuntimeError(
            "Validation failed: seeded suppliers and supplier login accounts do not match."
        )

    non_portal_accounts = count(
        select(func.count())
        .select_from(UserORM)
        .join(UserRoleORM, UserRoleORM.user_id == UserORM.id)
        .join(RoleORM, RoleORM.id == UserRoleORM.role_id)
        .where(
            UserORM.username.like(f"{SEED_SUPPLIER_USER_PREFIX}%"),
            RoleORM.name != SUPPLIER_ROLE_NAME,
        )
    )
    if non_portal_accounts:
        raise RuntimeError(
            "Validation failed: "
            f"{non_portal_accounts} supplier accounts hold a non-portal role."
        )

    skipped_password_change = count(
        select(func.count())
        .select_from(UserORM)
        .where(
            UserORM.username.like(f"{SEED_SUPPLIER_USER_PREFIX}%"),
            UserORM.must_change_password.is_(False),
        )
    )
    if skipped_password_change:
        raise RuntimeError(
            "Validation failed: "
            f"{skipped_password_change} supplier accounts skip the forced password change."
        )
    return counts


def main() -> int:
    try:
        password = _require_safe_environment()
        with SessionLocal() as session, session.begin():
            _sync_seed(session, password)
            counts = _validate_seed(session)
    except Exception as exc:
        print(f"Seeder aborted: {exc}", file=sys.stderr)
        return 1

    print("Development/test QA data seeded successfully.")
    for table, value in counts.items():
        print(f"{table}: {value}")
    print(
        "Quality scenarios: available/released, pending/quarantine, failed/rejected, "
        "split lots, and varied supplier certificate expiry."
    )
    print("IQC sign-off examples: pending records plus any untouched approved/returned sample histories.")
    print(
        "Supplier portal accounts: seed_supplier_001..006 (role Supplier Portal User, "
        "forced password change on first login)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
