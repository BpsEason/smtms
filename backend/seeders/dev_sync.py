"""Create and synchronize deterministic development records."""

from __future__ import annotations

from collections.abc import Callable
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from app.core.security import get_password_hash
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
from sqlalchemy import select
from sqlalchemy.orm import Session

from seeders.dev_data import (
    BATCH_OUTCOMES,
    INTERNAL_USERS,
    MATERIAL_DATA,
    PERMISSIONS,
    ROLE_PERMISSION_CODES,
    SEED_DOCUMENT_PREFIX,
    SEED_INTERNAL_LOT_PREFIX,
    SEED_IQC_REMARK_PREFIX,
    SEED_MATERIAL_PREFIX,
    SEED_PERMISSION_PREFIX,
    SEED_RECEIPT_PREFIX,
    SEED_REVIEW_NOTE_PREFIX,
    SEED_ROLE_NAMES,
    SEED_SUPPLIER_LOT_PREFIX,
    SEED_SUPPLIER_PREFIX,
    SEED_SUPPLIER_USER_PREFIX,
    SEED_USER_PREFIX,
    SUPPLIER_DATA,
)
from seeders.quality_abnormal.seeder import seed_quality_abnormal_cases


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


def sync_seed(session: Session, password: str) -> None:
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
                    "inspector_user_id": users["seed_qa_1" if index % 2 == 0 else "seed_qa_2"].id,
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
    seed_quality_abnormal_cases(session)


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
        select(QualityReviewORM.id).where(QualityReviewORM.iqc_record_id == record.id).limit(1)
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
