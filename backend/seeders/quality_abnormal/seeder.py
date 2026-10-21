"""Persist quality abnormality cases in the caller's transaction."""

from __future__ import annotations

from datetime import timedelta

from app.models.quality import (
    InternalMaterialLotORM,
    IQCRecordORM,
    MaterialReceiptORM,
    NonconformanceORM,
    SupplierLotORM,
)
from app.models.user import UserORM
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import cases_iqc, cases_material, cases_supplier, cases_traceability

SEED_CASE_PREFIX = "SEED-NC-"
CASE_MODULES = (
    ("iqc", cases_iqc),
    ("production", cases_material),
    ("supplier", cases_supplier),
    ("traceability", cases_traceability),
)


def load_cases() -> tuple[dict[str, object], ...]:
    """Return case definitions with their schema-supported source category."""
    return tuple(
        {**case, "source": source} for source, module in CASE_MODULES for case in module.CASES
    )


def seed_quality_abnormal_cases(session: Session) -> int:
    """Create stable, linked cases; leave existing rows untouched.

    The caller owns Session and transaction lifecycle. All references are looked
    up by the development seeder's stable business keys, never by guessed IDs.
    """
    cases = load_cases()
    if not cases:
        return 0

    inspector = session.scalar(select(UserORM).where(UserORM.username == "seed_qa_1"))
    references: dict[
        int, tuple[MaterialReceiptORM, SupplierLotORM, InternalMaterialLotORM, IQCRecordORM]
    ] = {}
    missing: list[str] = []
    for batch in sorted({int(case["batch"]) for case in cases}):
        batch_no = f"{batch:03d}"
        receipt = session.scalar(
            select(MaterialReceiptORM).where(
                MaterialReceiptORM.receipt_no == f"SEED-REC-{batch_no}"
            )
        )
        supplier_lot = session.scalar(
            select(SupplierLotORM).where(SupplierLotORM.supplier_lot_no == f"SEED-SLOT-{batch_no}")
        )
        internal_lot = session.scalar(
            select(InternalMaterialLotORM).where(
                InternalMaterialLotORM.internal_lot_no == f"SEED-ILOT-{batch_no}-1"
            )
        )
        iqc = (
            session.scalar(
                select(IQCRecordORM).where(IQCRecordORM.internal_lot_id == internal_lot.id)
            )
            if internal_lot is not None
            else None
        )
        if receipt is None:
            missing.append(f"收料單 SEED-REC-{batch_no}")
        if supplier_lot is None:
            missing.append(f"供應商批次 SEED-SLOT-{batch_no}")
        if internal_lot is None:
            missing.append(f"內部批次 SEED-ILOT-{batch_no}-1")
        if iqc is None:
            missing.append(f"IQC 紀錄（內部批次 SEED-ILOT-{batch_no}-1）")
        if receipt and supplier_lot and internal_lot and iqc:
            if (
                receipt.supplier_id != supplier_lot.supplier_id
                or receipt.material_id != supplier_lot.material_id
                or receipt.supplier_lot_id != supplier_lot.id
                or internal_lot.receipt_id != receipt.id
                or internal_lot.supplier_lot_id != supplier_lot.id
                or iqc.receipt_id != receipt.id
                or iqc.internal_lot_id != internal_lot.id
            ):
                missing.append(f"批次 {batch_no} 的收料／供應商批次／IQC 關聯一致性")
            else:
                references[batch] = (receipt, supplier_lot, internal_lot, iqc)
    if inspector is None:
        missing.append("使用者 seed_qa_1")
    if missing:
        raise RuntimeError("品質異常 Seeder 缺少有效前置資料：" + "、".join(missing))

    created = 0
    for definition in cases:
        batch = int(definition["batch"])
        receipt, supplier_lot, internal_lot, iqc = references[batch]
        key = str(definition["key"])
        status = str(definition["status"])
        found_at = receipt.received_at + timedelta(days=2)
        values: dict[str, object] = {
            "title": str(definition["title"]),
            "description": str(definition["description"]),
            "source": str(definition["source"]),
            "severity": str(definition["severity"]),
            "status": status,
            "found_at": found_at,
            "found_by_user_id": inspector.id,
            "owner_user_id": inspector.id,
            "supplier_id": receipt.supplier_id,
            "material_id": receipt.material_id,
            "receipt_id": receipt.id,
            "supplier_lot_id": supplier_lot.id,
            "internal_lot_id": internal_lot.id,
            "iqc_record_id": iqc.id,
            "defect_qty": receipt.qty_received,
            "investigation": str(definition["investigation"]),
            "closed_at": found_at + timedelta(days=3) if status == "closed" else None,
        }
        case_no = f"{SEED_CASE_PREFIX}{key}"
        existing = session.scalar(
            select(NonconformanceORM).where(NonconformanceORM.case_no == case_no)
        )
        if existing is not None:
            if not all(getattr(existing, field) == value for field, value in values.items()):
                raise RuntimeError(
                    f"品質異常案件識別碼 {case_no} 已存在且內容不符，為避免覆寫資料已停止。"
                )
            continue
        session.add(NonconformanceORM(case_no=case_no, **values))
        session.flush()
        created += 1
    return created
