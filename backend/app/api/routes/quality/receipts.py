from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
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
    SupplierORM,
)
from app.schemas.catalog import (
    InternalLotResponse,
    IQCRecordResponse,
    MaterialResponse,
    PaginatedResponse,
    ReceiptCreate,
    ReceiptIQCSummary,
    ReceiptListResponse,
    ReceiptResponse,
    ReceiptTraceLot,
    ReceiptTraceResponse,
    SupplierLotResponse,
    SupplierResponse,
)
from app.services.material_receipts import create_material_receipt

router = APIRouter()


def _get_receipt(db: Session, receipt_id: int) -> MaterialReceiptORM:
    receipt = db.get(MaterialReceiptORM, receipt_id)
    if receipt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    return receipt


@router.get("/receipts", response_model=PaginatedResponse[ReceiptListResponse])
def list_receipts(
    keyword: str | None = Query(default=None, max_length=200),
    status: str | None = Query(default=None, max_length=20),
    date_from: datetime | None = Query(default=None, alias="date_from"),
    date_to: datetime | None = Query(default=None, alias="date_to"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("receipts:read")),
):
    statement = (
        select(MaterialReceiptORM)
        .join(SupplierORM, MaterialReceiptORM.supplier_id == SupplierORM.id)
        .join(
            MaterialORM,
            MaterialReceiptORM.material_id == MaterialORM.id,
        )
        .join(SupplierLotORM, MaterialReceiptORM.supplier_lot_id == SupplierLotORM.id)
    )
    count_statement = (
        select(func.count())
        .select_from(MaterialReceiptORM)
        .join(
            SupplierORM,
            MaterialReceiptORM.supplier_id == SupplierORM.id,
        )
        .join(
            MaterialORM,
            MaterialReceiptORM.material_id == MaterialORM.id,
        )
        .join(SupplierLotORM, MaterialReceiptORM.supplier_lot_id == SupplierLotORM.id)
    )

    if current_user.supplier_id is not None:
        statement = statement.where(MaterialReceiptORM.supplier_id == current_user.supplier_id)
        count_statement = count_statement.where(
            MaterialReceiptORM.supplier_id == current_user.supplier_id
        )
    if keyword:
        pattern = f"%{keyword.strip()}%"
        criterion = (
            MaterialReceiptORM.receipt_no.ilike(pattern)
            | SupplierORM.supplier_name.ilike(pattern)
            | SupplierORM.supplier_code.ilike(pattern)
            | MaterialORM.material_name.ilike(pattern)
            | MaterialORM.material_code.ilike(pattern)
            | SupplierLotORM.supplier_lot_no.ilike(pattern)
        )
        statement = statement.where(criterion)
        count_statement = count_statement.where(criterion)
    if status:
        statement = statement.where(MaterialReceiptORM.status == status)
        count_statement = count_statement.where(MaterialReceiptORM.status == status)
    if date_from:
        statement = statement.where(MaterialReceiptORM.received_at >= date_from)
        count_statement = count_statement.where(MaterialReceiptORM.received_at >= date_from)
    if date_to:
        statement = statement.where(MaterialReceiptORM.received_at <= date_to)
        count_statement = count_statement.where(MaterialReceiptORM.received_at <= date_to)

    total = db.scalar(count_statement) or 0
    receipts = db.scalars(
        statement.options(
            selectinload(MaterialReceiptORM.supplier),
            selectinload(MaterialReceiptORM.material),
            selectinload(MaterialReceiptORM.supplier_lot),
        )
        .order_by(MaterialReceiptORM.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    iqc_by_receipt: dict[int, dict[int, ReceiptIQCSummary]] = {}
    if receipts and "iqc:read" in current_user.permissions:
        receipt_ids = [item.id for item in receipts]
        direct_records = db.scalars(
            select(IQCRecordORM).where(IQCRecordORM.receipt_id.in_(receipt_ids))
        ).all()
        linked_records = db.execute(
            select(IQCRecordORM, InternalMaterialLotORM.receipt_id)
            .join(InternalMaterialLotORM, IQCRecordORM.internal_lot_id == InternalMaterialLotORM.id)
            .where(InternalMaterialLotORM.receipt_id.in_(receipt_ids))
        ).all()
        records_with_receipt_ids = [
            *((record, record.receipt_id) for record in direct_records),
            *linked_records,
        ]
        for record, receipt_id in records_with_receipt_ids:
            if receipt_id in receipt_ids:
                iqc_by_receipt.setdefault(receipt_id, {})[record.id] = ReceiptIQCSummary(
                    id=record.id,
                    inspection_result=record.inspection_result,
                    release_status=record.release_status,
                    review_status=record.review_status,
                )

    return PaginatedResponse[ReceiptListResponse](
        items=[
            ReceiptListResponse(
                **ReceiptResponse.model_validate(item).model_dump(),
                supplier_code=item.supplier.supplier_code,
                supplier_name=item.supplier.supplier_name,
                material_code=item.material.material_code,
                material_name=item.material.material_name,
                material_uom=item.material.uom,
                supplier_lot_no=item.supplier_lot.supplier_lot_no,
                supplier_lot_uom=item.supplier_lot.uom,
                iqc_records=(
                    list(iqc_by_receipt.get(item.id, {}).values())
                    if "iqc:read" in current_user.permissions
                    else None
                ),
            )
            for item in receipts
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/receipts", response_model=ReceiptResponse, status_code=status.HTTP_201_CREATED)
def create_receipt(
    payload: ReceiptCreate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("receipts:write")),
):
    receipt = create_material_receipt(db, payload, current_user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Receipt number already exists",
        ) from exc
    db.refresh(receipt)
    return receipt


@router.get("/receipts/{receipt_id}", response_model=ReceiptResponse)
def get_receipt_by_id(
    receipt_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("receipts:read")),
):
    if current_user.supplier_id is not None:
        receipt = db.scalar(
            select(MaterialReceiptORM.id).where(
                MaterialReceiptORM.id == receipt_id,
                MaterialReceiptORM.supplier_id == current_user.supplier_id,
            )
        )
        if receipt is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return _get_receipt(db, receipt_id)


@router.get("/receipts/{receipt_id}/trace", response_model=ReceiptTraceResponse)
def get_receipt_trace(
    receipt_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("receipts:read")),
    _materials_user: AuthenticatedUser = Depends(require_permission("materials:read")),
    _iqc_user: AuthenticatedUser = Depends(require_permission("iqc:read")),
) -> ReceiptTraceResponse:
    receipt = db.scalar(
        select(MaterialReceiptORM)
        .options(
            selectinload(MaterialReceiptORM.supplier),
            selectinload(MaterialReceiptORM.material),
            selectinload(MaterialReceiptORM.supplier_lot),
            selectinload(MaterialReceiptORM.iqc_records),
            selectinload(MaterialReceiptORM.internal_material_lots).selectinload(
                InternalMaterialLotORM.iqc_records
            ),
        )
        .where(MaterialReceiptORM.id == receipt_id)
    )
    if receipt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    ensure_supplier_access(current_user, receipt.supplier_id)
    return ReceiptTraceResponse(
        receipt=ReceiptResponse.model_validate(receipt),
        supplier=SupplierResponse.model_validate(receipt.supplier),
        material=MaterialResponse.model_validate(receipt.material),
        supplier_lot=SupplierLotResponse.model_validate(receipt.supplier_lot),
        receipt_iqc_records=[
            IQCRecordResponse.model_validate(record)
            for record in sorted(receipt.iqc_records, key=lambda record: record.id)
        ],
        internal_lots=[
            ReceiptTraceLot(
                internal_lot=InternalLotResponse.model_validate(lot),
                iqc_records=[
                    IQCRecordResponse.model_validate(record)
                    for record in sorted(lot.iqc_records, key=lambda record: record.id)
                ],
            )
            for lot in sorted(receipt.internal_material_lots, key=lambda item: item.id)
        ],
    )
