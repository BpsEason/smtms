from collections.abc import Generator
from datetime import datetime
from decimal import Decimal

import pytest
from app.core.security import verify_password
from app.db.base import Base
from app.models.quality import (
    InternalMaterialLotORM,
    IQCRecordORM,
    MaterialORM,
    MaterialReceiptORM,
    NonconformanceORM,
    QualityReviewORM,
    SupplierLotORM,
    SupplierORM,
)
from app.models.user import PermissionORM, RoleORM, RolePermissionORM, UserORM, UserRoleORM
from app.services import supplier_import
from seeders import dev_data, dev_sync
from seeders.dev_sync import sync_seed
from seeders.dev_validation import validate_seed
from seeders.quality_abnormal.seeder import (
    SEED_CASE_PREFIX,
    load_cases,
    seed_quality_abnormal_cases,
)
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

SEED_PASSWORD = "Seed-Dev-Test-Password-2026!"


@pytest.fixture
def seed_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine, expire_on_commit=False)
    try:
        with TestSession() as session, session.begin():
            yield session
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


def _run_seed(session: Session) -> dict[str, int]:
    sync_seed(session, SEED_PASSWORD)
    return validate_seed(session)


def test_seed_builds_full_traceability_graph(seed_session: Session) -> None:
    counts = _run_seed(seed_session)

    assert counts["suppliers"] == 6
    assert counts["materials"] == 12
    assert counts["supplier_materials"] == 24
    assert counts["supplier_lots"] == 20
    assert counts["material_receipts"] == 20
    assert counts["internal_material_lots"] == 25
    assert counts["iqc_records"] == 25
    assert counts["supplier_accounts"] == 6
    assert counts["internal_users"] == 4
    assert counts["nonconformance_cases"] == 12
    assert counts["user_roles"] == 10

    cases = seed_session.scalars(
        select(NonconformanceORM).where(NonconformanceORM.case_no.like(f"{SEED_CASE_PREFIX}%"))
    ).all()
    assert len(load_cases()) == len(cases) == 12
    for case in cases:
        assert seed_session.get(UserORM, case.found_by_user_id) is not None
        assert seed_session.get(UserORM, case.owner_user_id) is not None
        assert seed_session.get(SupplierORM, case.supplier_id) is not None
        assert seed_session.get(MaterialORM, case.material_id) is not None
        receipt = seed_session.get(MaterialReceiptORM, case.receipt_id)
        assert receipt is not None
        assert (receipt.supplier_id, receipt.material_id, receipt.supplier_lot_id) == (
            case.supplier_id,
            case.material_id,
            case.supplier_lot_id,
        )
        internal = seed_session.get(InternalMaterialLotORM, case.internal_lot_id)
        assert internal is not None
        assert (internal.receipt_id, internal.supplier_lot_id) == (
            case.receipt_id,
            case.supplier_lot_id,
        )
        iqc = seed_session.get(IQCRecordORM, case.iqc_record_id)
        assert iqc is not None
        assert (iqc.internal_lot_id, iqc.receipt_id) == (internal.id, receipt.id)

    split_receipts = seed_session.scalars(
        select(InternalMaterialLotORM.receipt_id)
        .group_by(InternalMaterialLotORM.receipt_id)
        .having(func.count(InternalMaterialLotORM.id) > 1)
    ).all()
    assert len(split_receipts) >= 1

    orphan_receipts = seed_session.scalar(
        select(func.count())
        .select_from(MaterialReceiptORM)
        .outerjoin(SupplierORM, MaterialReceiptORM.supplier_id == SupplierORM.id)
        .outerjoin(MaterialORM, MaterialReceiptORM.material_id == MaterialORM.id)
        .outerjoin(SupplierLotORM, MaterialReceiptORM.supplier_lot_id == SupplierLotORM.id)
        .where(
            (SupplierORM.id.is_(None)) | (MaterialORM.id.is_(None)) | (SupplierLotORM.id.is_(None))
        )
    )
    assert orphan_receipts == 0


def test_seed_is_repeatable_without_duplicates(seed_session: Session) -> None:
    first = _run_seed(seed_session)
    second = _run_seed(seed_session)
    assert first == second
    assert (
        seed_session.scalar(
            select(func.count())
            .select_from(NonconformanceORM)
            .where(NonconformanceORM.case_no.like(f"{SEED_CASE_PREFIX}%"))
        )
        == 12
    )

    usernames = seed_session.scalars(select(UserORM.username)).all()
    assert len(usernames) == len(set(usernames))
    supplier_codes = seed_session.scalars(select(SupplierORM.supplier_code)).all()
    assert len(supplier_codes) == len(set(supplier_codes))

    assert (
        seed_session.scalar(
            select(func.count())
            .select_from(RoleORM)
            .where(RoleORM.name == supplier_import.SUPPLIER_ROLE_NAME)
        )
        == 1
    )


def test_seed_provides_actionable_signoff_examples_with_valid_history(
    seed_session: Session,
) -> None:
    counts = _run_seed(seed_session)
    assert counts["pending_iqc_signoffs"] >= 3
    assert counts["approved_iqc_signoffs"] >= 1
    assert counts["returned_iqc_signoffs"] >= 1
    assert counts["seed_signoff_history"] == 2

    iqcs = seed_session.scalars(
        select(IQCRecordORM).where(IQCRecordORM.remarks.like(f"{dev_data.SEED_IQC_REMARK_PREFIX}%"))
    ).all()
    approved = next(record for record in iqcs if record.review_status == "approved")
    returned = next(record for record in iqcs if record.review_status == "returned")
    assert (approved.inspection_result, approved.release_status) == ("passed", "released")
    assert (returned.inspection_result, returned.release_status) == ("pending", "hold")

    approved_history = seed_session.scalar(
        select(QualityReviewORM).where(QualityReviewORM.iqc_record_id == approved.id)
    )
    returned_history = seed_session.scalar(
        select(QualityReviewORM).where(QualityReviewORM.iqc_record_id == returned.id)
    )
    assert approved_history is not None
    assert approved_history.review_status == "approved"
    assert approved_history.reviewed_by_user_id == approved.reviewed_by_user_id
    assert approved_history.reviewed_at == approved.reviewed_at
    assert returned_history is not None
    assert returned_history.review_status == "returned"
    assert returned_history.reason
    assert returned_history.reviewed_by_user_id == returned.reviewed_by_user_id
    assert returned_history.reviewed_at == returned.reviewed_at

    qa_user_ids = set(
        seed_session.scalars(
            select(UserORM.id)
            .join(UserRoleORM, UserRoleORM.user_id == UserORM.id)
            .join(RoleORM, RoleORM.id == UserRoleORM.role_id)
            .where(RoleORM.name == dev_data.SEED_ROLE_NAMES[1])
        )
    )
    assert approved_history.reviewed_by_user_id in qa_user_ids
    assert returned_history.reviewed_by_user_id in qa_user_ids

    _run_seed(seed_session)
    assert (
        seed_session.scalar(
            select(func.count())
            .select_from(QualityReviewORM)
            .where(QualityReviewORM.decision_note.like(f"{dev_data.SEED_REVIEW_NOTE_PREFIX}%"))
        )
        == 2
    )


def test_seed_never_resets_an_operator_signoff(seed_session: Session) -> None:
    _run_seed(seed_session)
    record = seed_session.scalar(
        select(IQCRecordORM).where(
            IQCRecordORM.remarks.like(f"{dev_data.SEED_IQC_REMARK_PREFIX}%"),
            IQCRecordORM.review_status == "pending",
        )
    )
    reviewer = seed_session.scalar(select(UserORM).where(UserORM.username == "seed_qa_1"))
    assert record is not None and reviewer is not None
    reviewed_at = datetime(2026, 10, 20, 9, 30)
    record.review_status = "approved"
    record.reviewed_by_user_id = reviewer.id
    record.reviewed_at = reviewed_at
    record.review_decision_note = "Operator signoff to preserve"
    seed_session.add(
        QualityReviewORM(
            iqc_record_id=record.id,
            review_status="approved",
            decision="approved",
            reviewed_by_user_id=reviewer.id,
            decision_note="Operator signoff to preserve",
            reviewed_at=reviewed_at,
        )
    )
    seed_session.flush()

    _run_seed(seed_session)
    seed_session.refresh(record)
    assert record.review_status == "approved"
    assert record.review_decision_note == "Operator signoff to preserve"
    assert record.reviewed_at == reviewed_at
    assert (
        seed_session.scalar(
            select(func.count())
            .select_from(QualityReviewORM)
            .where(QualityReviewORM.iqc_record_id == record.id)
        )
        == 1
    )


def test_supplier_lot_permission_is_limited_to_receivers_and_admins(seed_session: Session) -> None:
    _run_seed(seed_session)
    permission = seed_session.scalar(
        select(PermissionORM).where(PermissionORM.code == "seed:supplier-lots:write")
    )
    assert permission is not None

    role_grants = {
        role.name: set(
            seed_session.scalars(
                select(PermissionORM.code)
                .join(RolePermissionORM, RolePermissionORM.permission_id == PermissionORM.id)
                .where(RolePermissionORM.role_id == role.id)
            )
        )
        for role in seed_session.scalars(
            select(RoleORM).where(
                RoleORM.name.in_((*dev_data.SEED_ROLE_NAMES, supplier_import.SUPPLIER_ROLE_NAME))
            )
        )
    }
    assert "seed:supplier-lots:write" in role_grants["SMTMS Seed Administrator"]
    assert "seed:supplier-lots:write" in role_grants["SMTMS Seed Receiver"]
    assert "seed:supplier-lots:write" not in role_grants["SMTMS Seed QA"]
    assert "seed:supplier-lots:write" not in role_grants[supplier_import.SUPPLIER_ROLE_NAME]
    assert (
        seed_session.scalar(
            select(func.count())
            .select_from(PermissionORM)
            .where(PermissionORM.code == supplier_import.SUPPLIER_ROLE_PERMISSION)
        )
        == 1
    )


def test_seed_administrator_has_every_seeded_permission(seed_session: Session) -> None:
    _run_seed(seed_session)
    admin_role = seed_session.scalar(
        select(RoleORM).where(RoleORM.name == "SMTMS Seed Administrator")
    )
    assert admin_role is not None
    granted = set(
        seed_session.scalars(
            select(PermissionORM.code)
            .join(RolePermissionORM, RolePermissionORM.permission_id == PermissionORM.id)
            .where(RolePermissionORM.role_id == admin_role.id)
        )
    )
    expected = {f"seed:{code}" for code, _ in dev_data.PERMISSIONS}
    assert granted == expected
    admin_user = seed_session.scalar(select(UserORM).where(UserORM.username == "seed_admin"))
    assert admin_user is not None
    assert seed_session.scalar(
        select(UserRoleORM.id).where(
            UserRoleORM.user_id == admin_user.id,
            UserRoleORM.role_id == admin_role.id,
        )
    ) is not None


def test_supplier_accounts_link_to_supplier_with_portal_role(seed_session: Session) -> None:
    _run_seed(seed_session)

    suppliers = seed_session.scalars(
        select(SupplierORM).where(
            SupplierORM.supplier_code.like(f"{dev_data.SEED_SUPPLIER_PREFIX}%")
        )
    ).all()
    assert len(suppliers) == 6
    assert {supplier.status for supplier in suppliers} >= {"active", "inactive"}
    tax_ids = [supplier.tax_id for supplier in suppliers]
    assert all(tax_ids)
    assert len(set(tax_ids)) == len(tax_ids)

    accounts = seed_session.scalars(
        select(UserORM).where(UserORM.username.like(f"{dev_data.SEED_SUPPLIER_USER_PREFIX}%"))
    ).all()
    assert len(accounts) == len(suppliers)
    assert {account.supplier_id for account in accounts} == {supplier.id for supplier in suppliers}

    for account in accounts:
        assert account.is_active is True
        assert account.must_change_password is True
        assert verify_password(SEED_PASSWORD, account.password_hash)
        roles = set(
            seed_session.scalars(
                select(RoleORM.name)
                .join(UserRoleORM, UserRoleORM.role_id == RoleORM.id)
                .where(UserRoleORM.user_id == account.id)
            )
        )
        assert roles == {supplier_import.SUPPLIER_ROLE_NAME}

    internal_roles = set(
        seed_session.scalars(select(RoleORM.name).where(RoleORM.name.in_(dev_data.SEED_ROLE_NAMES)))
    )
    assert internal_roles.isdisjoint(
        {
            role
            for account in accounts
            for role in seed_session.scalars(
                select(RoleORM.name)
                .join(UserRoleORM, UserRoleORM.role_id == RoleORM.id)
                .where(UserRoleORM.user_id == account.id)
            )
        }
    )


def test_upsert_refuses_to_overwrite_non_seeder_row(seed_session: Session) -> None:
    seed_session.add(
        SupplierORM(
            id=1,
            supplier_code="SEED-SUP-001",
            supplier_name="Manually created supplier",
            status="active",
        )
    )
    seed_session.flush()

    with pytest.raises(RuntimeError, match="Refusing to overwrite non-seeder data"):
        dev_sync._upsert(
            seed_session,
            SupplierORM,
            {"supplier_code": "SEED-SUP-001"},
            {"supplier_name": "Should not be written"},
            owned=lambda row: row.supplier_name == "Seeder owned",
            label="supplier",
        )

    existing = seed_session.scalar(
        select(SupplierORM).where(SupplierORM.supplier_code == "SEED-SUP-001")
    )
    assert existing is not None
    assert existing.supplier_name == "Manually created supplier"


def test_seed_preserves_live_and_foreign_records(seed_session: Session) -> None:
    _run_seed(seed_session)

    supplier = seed_session.scalar(
        select(SupplierORM).where(
            SupplierORM.supplier_code == f"{dev_data.SEED_SUPPLIER_PREFIX}001"
        )
    )
    material = seed_session.scalar(
        select(MaterialORM).where(
            MaterialORM.material_code == f"{dev_data.SEED_MATERIAL_PREFIX}001"
        )
    )
    supplier_lot = seed_session.scalar(
        select(SupplierLotORM).where(
            SupplierLotORM.supplier_lot_no == f"{dev_data.SEED_SUPPLIER_LOT_PREFIX}001"
        )
    )
    assert supplier is not None and material is not None and supplier_lot is not None

    seed_session.add(
        SupplierORM(
            supplier_code="LIVE-SUP-EXISTING",
            supplier_name="Pre-existing live supplier",
            status="active",
        )
    )
    seed_session.flush()

    live_receipt = MaterialReceiptORM(
        receipt_no="LIVE-REC-TEST-01",
        supplier_id=supplier.id,
        material_id=material.id,
        supplier_lot_id=supplier_lot.id,
        received_at=datetime(2026, 10, 19, 9, 0),
        received_by_user_id=None,
        qty_received=Decimal("5.0000"),
        qty_remaining=Decimal("5.0000"),
        status="received",
        notes="Live acceptance test record",
    )
    seed_session.add(live_receipt)
    seed_session.flush()

    live_internal_lot = InternalMaterialLotORM(
        material_id=material.id,
        supplier_lot_id=supplier_lot.id,
        receipt_id=live_receipt.id,
        internal_lot_no="LIVE-ILOT-TEST-01",
        qty_on_hand=Decimal("5.0000"),
        qty_reserved=Decimal("0.0000"),
        uom=material.uom,
        lot_status="available",
    )
    seed_session.add(live_internal_lot)
    seed_session.flush()

    seed_session.add(
        IQCRecordORM(
            receipt_id=live_receipt.id,
            internal_lot_id=live_internal_lot.id,
            inspector_user_id=None,
            sample_qty=Decimal("0.5000"),
            inspection_result="passed",
            release_status="released",
            remarks="Live acceptance inspection",
        )
    )
    seed_session.flush()

    counts = _run_seed(seed_session)
    assert counts["material_receipts"] == 20
    assert counts["internal_material_lots"] == 25
    assert counts["iqc_records"] == 25

    preserved_receipt = seed_session.scalar(
        select(MaterialReceiptORM).where(MaterialReceiptORM.receipt_no == "LIVE-REC-TEST-01")
    )
    assert preserved_receipt is not None
    assert preserved_receipt.qty_received == Decimal("5.0000")
    assert preserved_receipt.notes == "Live acceptance test record"

    preserved_internal_lot = seed_session.scalar(
        select(InternalMaterialLotORM).where(
            InternalMaterialLotORM.internal_lot_no == "LIVE-ILOT-TEST-01"
        )
    )
    assert preserved_internal_lot is not None
    assert preserved_internal_lot.receipt_id == preserved_receipt.id

    preserved_iqc = seed_session.scalar(
        select(IQCRecordORM).where(IQCRecordORM.internal_lot_id == preserved_internal_lot.id)
    )
    assert preserved_iqc is not None
    assert preserved_iqc.remarks == "Live acceptance inspection"

    assert (
        seed_session.scalar(
            select(SupplierORM).where(SupplierORM.supplier_code == "LIVE-SUP-EXISTING")
        )
        is not None
    )


def test_quality_case_seeder_reports_missing_prerequisites(seed_session: Session) -> None:
    with pytest.raises(RuntimeError, match="缺少有效前置資料") as exc_info:
        seed_quality_abnormal_cases(seed_session)
    assert "使用者 seed_qa_1" in str(exc_info.value)
    assert "收料單 SEED-REC-" in str(exc_info.value)
    assert seed_session.scalar(select(func.count()).select_from(NonconformanceORM)) == 0


def test_quality_case_seeder_does_not_overwrite_existing_case(seed_session: Session) -> None:
    _run_seed(seed_session)
    existing = seed_session.scalar(
        select(NonconformanceORM).where(NonconformanceORM.case_no == "SEED-NC-IQC-001")
    )
    assert existing is not None
    existing.title = "使用者修改內容"
    seed_session.flush()

    with pytest.raises(RuntimeError, match="為避免覆寫資料已停止"):
        seed_quality_abnormal_cases(seed_session)
    assert existing.title == "使用者修改內容"
