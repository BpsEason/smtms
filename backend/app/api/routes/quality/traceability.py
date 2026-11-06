from __future__ import annotations

from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.security import (
    AuthenticatedUser,
    ensure_supplier_access,
    require_permission,
)
from app.db.session import get_db
from app.models.quality import (
    InternalMaterialLotORM,
    IQCRecordORM,
    MaterialORM,
    MaterialReceiptORM,
    SupplierLotORM,
)
from app.schemas.catalog import (
    InternalLotResponse,
    IQCRecordResponse,
    MaterialResponse,
    PaginatedResponse,
    ReceiptResponse,
    SupplierLotResponse,
    SupplierResponse,
    TraceabilityIQCResponse,
    TraceabilityLotResponse,
    TraceabilityReceiptResponse,
)
from app.services.quality_review import review_responses

router = APIRouter()


def _build_traceability_response(
    db: Session, receipt: MaterialReceiptORM
) -> TraceabilityReceiptResponse:
    """
    從MaterialReceiptORM構建TraceabilityReceiptResponse，重用現有的追蹤邏輯
    """

    def trace_iqc(record: IQCRecordORM) -> TraceabilityIQCResponse:
        reviews = sorted(record.quality_reviews, key=lambda item: item.id)
        return TraceabilityIQCResponse(
            iqc_record=IQCRecordResponse.model_validate(record),
            review_history=review_responses(db, reviews),
        )

    return TraceabilityReceiptResponse(
        receipt=ReceiptResponse.model_validate(receipt),
        supplier=SupplierResponse.model_validate(receipt.supplier),
        material=MaterialResponse.model_validate(receipt.material),
        supplier_lot=SupplierLotResponse.model_validate(receipt.supplier_lot),
        receipt_iqc_records=[
            trace_iqc(record) for record in sorted(receipt.iqc_records, key=lambda item: item.id)
        ],
        internal_lots=[
            TraceabilityLotResponse(
                internal_lot=InternalLotResponse.model_validate(lot),
                iqc_records=[
                    trace_iqc(record)
                    for record in sorted(lot.iqc_records, key=lambda item: item.id)
                ],
            )
            for lot in sorted(receipt.internal_material_lots, key=lambda item: item.id)
        ],
    )


@router.get("/traceability", response_model=PaginatedResponse[TraceabilityReceiptResponse])
def search_traceability(
    supplier_lot_no: str | None = Query(default=None, min_length=1, max_length=120),
    receipt_no: str | None = Query(default=None, min_length=1, max_length=80),
    internal_lot_no: str | None = Query(default=None, min_length=1, max_length=120),
    iqc_id: int | None = Query(default=None, gt=0),
    material_code: str | None = Query(default=None, min_length=1, max_length=80),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(
        require_permission("receipts:read", "materials:read", "iqc:read")
    ),
) -> PaginatedResponse[TraceabilityReceiptResponse]:
    identifiers = [supplier_lot_no, receipt_no, internal_lot_no, iqc_id, material_code]
    if sum(value is not None and value != "" for value in identifiers) != 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide exactly one traceability identifier",
        )

    receipt_ids = select(MaterialReceiptORM.id)
    if supplier_lot_no is not None:
        lot_ids = select(SupplierLotORM.id).where(
            SupplierLotORM.supplier_lot_no == supplier_lot_no.strip()
        )
        receipt_ids = receipt_ids.where(MaterialReceiptORM.supplier_lot_id.in_(lot_ids))
    elif receipt_no is not None:
        receipt_ids = receipt_ids.where(MaterialReceiptORM.receipt_no == receipt_no.strip())
    elif internal_lot_no is not None:
        internal_receipt_ids = select(InternalMaterialLotORM.receipt_id).where(
            InternalMaterialLotORM.internal_lot_no == internal_lot_no.strip(),
            InternalMaterialLotORM.receipt_id.is_not(None),
        )
        receipt_ids = receipt_ids.where(MaterialReceiptORM.id.in_(internal_receipt_ids))
    elif iqc_id is not None:
        iqc = db.get(IQCRecordORM, iqc_id)
        if iqc is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Traceability record not found",
            )
        source_receipt_id = iqc.receipt_id
        if source_receipt_id is None and iqc.internal_lot_id is not None:
            source_receipt_id = db.scalar(
                select(InternalMaterialLotORM.receipt_id).where(
                    InternalMaterialLotORM.id == iqc.internal_lot_id
                )
            )
        if source_receipt_id is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Traceability chain not found",
            )
        receipt_ids = receipt_ids.where(MaterialReceiptORM.id == source_receipt_id)
    elif material_code is not None:
        receipt_ids = receipt_ids.join(
            MaterialORM, MaterialORM.id == MaterialReceiptORM.material_id
        ).where(MaterialORM.material_code == material_code.strip())

    if current_user.supplier_id is not None:
        receipt_ids = receipt_ids.where(MaterialReceiptORM.supplier_id == current_user.supplier_id)

    matching_ids = receipt_ids.distinct().subquery()
    total = db.scalar(select(func.count()).select_from(matching_ids)) or 0
    if total == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Traceability record not found",
        )

    ids = cast(
        list[int],
        db.scalars(
            select(matching_ids.c.id)
            .order_by(matching_ids.c.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all(),
    )
    receipts = db.scalars(
        select(MaterialReceiptORM)
        .options(
            selectinload(MaterialReceiptORM.supplier),
            selectinload(MaterialReceiptORM.material),
            selectinload(MaterialReceiptORM.supplier_lot),
            selectinload(MaterialReceiptORM.iqc_records).selectinload(IQCRecordORM.quality_reviews),
            selectinload(MaterialReceiptORM.internal_material_lots)
            .selectinload(InternalMaterialLotORM.iqc_records)
            .selectinload(IQCRecordORM.quality_reviews),
        )
        .where(MaterialReceiptORM.id.in_(ids))
        .order_by(MaterialReceiptORM.id)
    ).all()

    def trace_iqc(record: IQCRecordORM) -> TraceabilityIQCResponse:
        reviews = sorted(record.quality_reviews, key=lambda item: item.id)
        return TraceabilityIQCResponse(
            iqc_record=IQCRecordResponse.model_validate(record),
            review_history=review_responses(db, reviews),
        )

    items = [
        TraceabilityReceiptResponse(
            receipt=ReceiptResponse.model_validate(receipt),
            supplier=SupplierResponse.model_validate(receipt.supplier),
            material=MaterialResponse.model_validate(receipt.material),
            supplier_lot=SupplierLotResponse.model_validate(receipt.supplier_lot),
            receipt_iqc_records=[
                trace_iqc(record)
                for record in sorted(receipt.iqc_records, key=lambda item: item.id)
            ],
            internal_lots=[
                TraceabilityLotResponse(
                    internal_lot=InternalLotResponse.model_validate(lot),
                    iqc_records=[
                        trace_iqc(record)
                        for record in sorted(lot.iqc_records, key=lambda item: item.id)
                    ],
                )
                for lot in sorted(receipt.internal_material_lots, key=lambda item: item.id)
            ],
        )
        for receipt in receipts
    ]
    return PaginatedResponse[TraceabilityReceiptResponse](
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/trace/{lot_no}", response_model=TraceabilityReceiptResponse)
def get_full_trace_by_lot_no(
    lot_no: str = Path(..., min_length=1, max_length=120),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(
        require_permission("receipts:read", "materials:read", "iqc:read")
    ),
) -> TraceabilityReceiptResponse:
    """
    通過任意批次號（供應商批次、收料單、內部批次）反查完整追溯履歷
    實現ROADMAP要求的GET /trace/{lot_no} API
    """
    # 首先嘗試匹配供應商批次號
    supplier_lot = db.scalar(
        select(SupplierLotORM.id).where(SupplierLotORM.supplier_lot_no == lot_no.strip())
    )
    if supplier_lot is not None:
        receipt = db.scalar(
            select(MaterialReceiptORM)
            .options(
                selectinload(MaterialReceiptORM.supplier),
                selectinload(MaterialReceiptORM.material),
                selectinload(MaterialReceiptORM.supplier_lot),
                selectinload(MaterialReceiptORM.iqc_records).selectinload(
                    IQCRecordORM.quality_reviews
                ),
                selectinload(MaterialReceiptORM.internal_material_lots)
                .selectinload(InternalMaterialLotORM.iqc_records)
                .selectinload(IQCRecordORM.quality_reviews),
            )
            .where(MaterialReceiptORM.supplier_lot_id == supplier_lot)
        )
        if receipt is not None:
            ensure_supplier_access(current_user, receipt.supplier_id)
            return _build_traceability_response(db, receipt)

    # 嘗試匹配收料單號
    receipt = db.scalar(
        select(MaterialReceiptORM)
        .options(
            selectinload(MaterialReceiptORM.supplier),
            selectinload(MaterialReceiptORM.material),
            selectinload(MaterialReceiptORM.supplier_lot),
            selectinload(MaterialReceiptORM.iqc_records).selectinload(
                IQCRecordORM.quality_reviews
            ),
            selectinload(MaterialReceiptORM.internal_material_lots)
            .selectinload(InternalMaterialLotORM.iqc_records)
            .selectinload(IQCRecordORM.quality_reviews),
        )
        .where(MaterialReceiptORM.receipt_no == lot_no.strip())
    )
    if receipt is not None:
        ensure_supplier_access(current_user, receipt.supplier_id)
        return _build_traceability_response(db, receipt)

    # 嘗試匹配內部批次號
    internal_lot = db.scalar(
        select(InternalMaterialLotORM.receipt_id).where(
            InternalMaterialLotORM.internal_lot_no == lot_no.strip(),
            InternalMaterialLotORM.receipt_id.is_not(None),
        )
    )
    if internal_lot is not None:
        receipt = db.scalar(
            select(MaterialReceiptORM)
            .options(
                selectinload(MaterialReceiptORM.supplier),
                selectinload(MaterialReceiptORM.material),
                selectinload(MaterialReceiptORM.supplier_lot),
                selectinload(MaterialReceiptORM.iqc_records).selectinload(
                    IQCRecordORM.quality_reviews
                ),
                selectinload(MaterialReceiptORM.internal_material_lots)
                .selectinload(InternalMaterialLotORM.iqc_records)
                .selectinload(IQCRecordORM.quality_reviews),
            )
            .where(MaterialReceiptORM.id == internal_lot)
        )
        if receipt is not None:
            ensure_supplier_access(current_user, receipt.supplier_id)
            return _build_traceability_response(db, receipt)

    # 如果都找不到
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Traceability record not found for lot number: {lot_no}",
    )
