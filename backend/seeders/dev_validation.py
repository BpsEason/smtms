"""Validate the complete seeded development data graph."""

from app.models.quality import (
    InternalMaterialLotORM,
    IQCRecordORM,
    MaterialORM,
    MaterialReceiptORM,
    NonconformanceORM,
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
from app.services.supplier_import import SUPPLIER_ROLE_NAME
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from seeders.dev_data import (
    EXPECTED_SEEDED_COUNTS,
    INTERNAL_USERS,
    SEED_DOCUMENT_PREFIX,
    SEED_INTERNAL_LOT_PREFIX,
    SEED_MATERIAL_PREFIX,
    SEED_PERMISSION_PREFIX,
    SEED_RECEIPT_PREFIX,
    SEED_REVIEW_NOTE_PREFIX,
    SEED_ROLE_NAMES,
    SEED_SUPPLIER_LOT_PREFIX,
    SEED_SUPPLIER_PREFIX,
    SEED_SUPPLIER_USER_PREFIX,
    SEED_USER_PREFIX,
)
from seeders.quality_abnormal.seeder import SEED_CASE_PREFIX


def validate_seed(session: Session) -> dict[str, int]:
    seed_supplier_ids = list(
        session.scalars(
            select(SupplierORM.id).where(SupplierORM.supplier_code.like(f"{SEED_SUPPLIER_PREFIX}%"))
        )
    )
    seed_material_ids = list(
        session.scalars(
            select(MaterialORM.id).where(MaterialORM.material_code.like(f"{SEED_MATERIAL_PREFIX}%"))
        )
    )
    seed_user_ids = list(
        session.scalars(select(UserORM.id).where(UserORM.username.like(f"{SEED_USER_PREFIX}%")))
    )
    seed_role_ids = list(
        session.scalars(select(RoleORM.id).where(RoleORM.name.in_(SEED_ROLE_NAMES)))
    )
    seed_permission_ids = list(
        session.scalars(
            select(PermissionORM.id).where(PermissionORM.code.like(f"{SEED_PERMISSION_PREFIX}%"))
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
            .where(SupplierQualificationDocumentORM.doc_code.like(f"{SEED_DOCUMENT_PREFIX}%"))
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
            .where(UserORM.username.in_([username for username, _ in INTERNAL_USERS]))
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
        "nonconformance_cases": count(
            select(func.count())
            .select_from(NonconformanceORM)
            .where(NonconformanceORM.case_no.like(f"{SEED_CASE_PREFIX}%"))
        ),
    }

    for table, expected in EXPECTED_SEEDED_COUNTS.items():
        if counts[table] != expected:
            raise RuntimeError(
                f"Validation failed: seeded {table} is {counts[table]}; expected {expected}."
            )

    broken_relationships = {
        "receipt_supplier": select(func.count())
        .select_from(MaterialReceiptORM)
        .outerjoin(SupplierORM, MaterialReceiptORM.supplier_id == SupplierORM.id)
        .where(
            MaterialReceiptORM.receipt_no.like(f"{SEED_RECEIPT_PREFIX}%"),
            SupplierORM.id.is_(None),
        ),
        "receipt_supplier_lot": select(func.count())
        .select_from(MaterialReceiptORM)
        .outerjoin(SupplierLotORM, MaterialReceiptORM.supplier_lot_id == SupplierLotORM.id)
        .where(
            MaterialReceiptORM.receipt_no.like(f"{SEED_RECEIPT_PREFIX}%"),
            SupplierLotORM.id.is_(None),
        ),
        "internal_lot_material": select(func.count())
        .select_from(InternalMaterialLotORM)
        .outerjoin(MaterialORM, InternalMaterialLotORM.material_id == MaterialORM.id)
        .where(
            InternalMaterialLotORM.internal_lot_no.like(f"{SEED_INTERNAL_LOT_PREFIX}%"),
            MaterialORM.id.is_(None),
        ),
        "iqc_internal_lot": select(func.count())
        .select_from(IQCRecordORM)
        .outerjoin(
            InternalMaterialLotORM, IQCRecordORM.internal_lot_id == InternalMaterialLotORM.id
        )
        .where(
            IQCRecordORM.internal_lot_id.in_(seed_internal_lot_ids),
            InternalMaterialLotORM.id.is_(None),
        )
        if seed_internal_lot_ids
        else select(func.count())
        .select_from(IQCRecordORM)
        .where(IQCRecordORM.internal_lot_id.in_([])),
    }
    broken_counts = {name: count(statement) for name, statement in broken_relationships.items()}
    if any(broken_counts.values()):
        raise RuntimeError(f"Validation failed: broken foreign-key relationships: {broken_counts}.")

    inconsistent = (
        session.scalar(
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
        )
        or 0
    )
    if inconsistent:
        raise RuntimeError(
            f"Validation failed: {inconsistent} IQC/internal-lot states are inconsistent."
        )

    split_supplier_lots = (
        session.scalar(
            select(func.count()).select_from(
                select(InternalMaterialLotORM.supplier_lot_id)
                .where(InternalMaterialLotORM.internal_lot_no.like(f"{SEED_INTERNAL_LOT_PREFIX}%"))
                .group_by(InternalMaterialLotORM.supplier_lot_id)
                .having(func.count(InternalMaterialLotORM.id) > 1)
                .subquery()
            )
        )
        or 0
    )
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
            f"Validation failed: {non_portal_accounts} supplier accounts hold a non-portal role."
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
