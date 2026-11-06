from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import (
    AuthenticatedUser,
    ensure_supplier_access,
    require_any_permission,
    require_permission,
)
from app.db.session import get_db
from app.models.quality import (
    InternalMaterialLotORM,
    IQCRecordORM,
    MaterialReceiptORM,
    SupplierLotORM,
)
from app.schemas.catalog import (
    IQCCreate,
    IQCRecordResponse,
    IQCUpdate,
    PaginatedResponse,
)
from app.services.quality_review import relationship_status_for_iqc

router = APIRouter()


def _ensure_internal_lot_supplier_access(
    db: Session,
    current_user: AuthenticatedUser,
    internal_lot: InternalMaterialLotORM,
) -> None:
    if current_user.supplier_id is None:
        return
    if internal_lot.receipt_id is not None:
        receipt = db.get(MaterialReceiptORM, internal_lot.receipt_id)
        if receipt is not None and receipt.supplier_id == current_user.supplier_id:
            return
    elif internal_lot.supplier_lot_id is not None:
        supplier_lot = db.get(SupplierLotORM, internal_lot.supplier_lot_id)
        if supplier_lot is not None and supplier_lot.supplier_id == current_user.supplier_id:
            return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


@router.get("/iqc", response_model=PaginatedResponse[IQCRecordResponse])
def list_iqc_records(
    keyword: str | None = Query(default=None, max_length=200),
    result: str | None = Query(default=None, alias="result", max_length=20),
    review_status: str | None = Query(default=None, max_length=20),
    date_from: datetime | None = Query(default=None, alias="date_from"),
    date_to: datetime | None = Query(default=None, alias="date_to"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(
        require_any_permission("iqc:read", "quality:review", "quality:approve", "quality:return")
    ),
):
    # Preserve supplier portal read access, but never grant it the internal
    # quality-only listing path just because a role was misconfigured.
    if current_user.supplier_id is not None and "iqc:read" not in current_user.permissions:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    statement = select(IQCRecordORM)
    count_statement = select(func.count()).select_from(IQCRecordORM)
    if current_user.supplier_id is not None:
        supplier_receipt_ids = select(MaterialReceiptORM.id).where(
            MaterialReceiptORM.supplier_id == current_user.supplier_id
        )
        supplier_lot_ids = select(SupplierLotORM.id).where(
            SupplierLotORM.supplier_id == current_user.supplier_id
        )
        supplier_internal_lot_ids = select(InternalMaterialLotORM.id).where(
            or_(
                InternalMaterialLotORM.receipt_id.in_(supplier_receipt_ids),
                InternalMaterialLotORM.supplier_lot_id.in_(supplier_lot_ids),
            )
        )
        own_records = or_(
            IQCRecordORM.receipt_id.in_(supplier_receipt_ids),
            IQCRecordORM.internal_lot_id.in_(supplier_internal_lot_ids),
        )
        statement = statement.where(own_records)
        count_statement = count_statement.where(own_records)
    if keyword:
        pattern = f"%{keyword.strip()}%"
        criterion = IQCRecordORM.remarks.ilike(pattern)
        statement = statement.where(criterion)
        count_statement = count_statement.where(criterion)
    if result:
        statement = statement.where(IQCRecordORM.inspection_result == result)
        count_statement = count_statement.where(IQCRecordORM.inspection_result == result)
    if review_status:
        statement = statement.where(IQCRecordORM.review_status == review_status)
        count_statement = count_statement.where(IQCRecordORM.review_status == review_status)
    if date_from:
        statement = statement.where(IQCRecordORM.inspection_date >= date_from)
        count_statement = count_statement.where(IQCRecordORM.inspection_date >= date_from)
    if date_to:
        statement = statement.where(IQCRecordORM.inspection_date <= date_to)
        count_statement = count_statement.where(IQCRecordORM.inspection_date <= date_to)

    total = db.scalar(count_statement) or 0
    records = db.scalars(
        statement.order_by(IQCRecordORM.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return PaginatedResponse[IQCRecordResponse](
        items=[IQCRecordResponse.model_validate(item) for item in records],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/iqc", response_model=IQCRecordResponse, status_code=status.HTTP_201_CREATED)
def create_iqc_record(
    payload: IQCCreate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("iqc:write")),
):
    if payload.receipt_id is not None:
        receipt = db.get(MaterialReceiptORM, payload.receipt_id)
        if receipt is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    else:
        receipt = None
    internal_lot = None
    if payload.internal_lot_id is not None:
        internal_lot = db.get(InternalMaterialLotORM, payload.internal_lot_id)
        if internal_lot is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Internal lot not found"
            )
    if current_user.supplier_id is not None:
        if receipt is not None and receipt.supplier_id != current_user.supplier_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if internal_lot is not None:
            _ensure_internal_lot_supplier_access(db, current_user, internal_lot)
    if internal_lot is not None and receipt is not None:
        if internal_lot.receipt_id != receipt.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="IQC target must match receipt and internal lot",
            )
    if (
        internal_lot is not None
        and receipt is not None
        and internal_lot.material_id != receipt.material_id
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="IQC target must match the receipt material",
        )

    lot_status = relationship_status_for_iqc(payload.inspection_result, payload.release_status)
    if internal_lot is not None:
        internal_lot.lot_status = lot_status

    record = IQCRecordORM(
        receipt_id=receipt.id if receipt else None,
        internal_lot_id=internal_lot.id if internal_lot else None,
        inspector_user_id=current_user.id,
        sample_qty=payload.sample_qty,
        inspection_result=payload.inspection_result,
        inspection_date=payload.inspection_date or datetime.utcnow(),
        release_status=payload.release_status,
        remarks=payload.remarks,
    )
    db.add(record)
    if internal_lot is not None:
        db.add(internal_lot)
    try:
        db.flush()
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="IQC record conflict"
        ) from exc
    db.refresh(record)
    if record.internal_lot is not None:
        db.refresh(record.internal_lot)
    return record


@router.patch("/iqc/{iqc_id}", response_model=IQCRecordResponse)
def update_iqc_record(
    iqc_id: int,
    payload: IQCUpdate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("iqc:write")),
):
    record = db.get(IQCRecordORM, iqc_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IQC record not found")
    if record.review_status == "approved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Approved IQC records cannot be modified",
        )
    if current_user.supplier_id is not None:
        if record.receipt_id is not None:
            receipt = db.get(MaterialReceiptORM, record.receipt_id)
            if receipt is None or receipt.supplier_id != current_user.supplier_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        if record.internal_lot_id is not None:
            internal_lot = db.get(InternalMaterialLotORM, record.internal_lot_id)
            if internal_lot is None:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
            _ensure_internal_lot_supplier_access(db, current_user, internal_lot)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return record

    if "inspector_user_id" in changes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Inspector is fixed to the current user"
        )
    target_receipt_id = changes.get("receipt_id", record.receipt_id)
    target_lot_id = changes.get("internal_lot_id", record.internal_lot_id)
    target_receipt = None
    if target_receipt_id is not None:
        target_receipt = db.get(MaterialReceiptORM, target_receipt_id)
        if target_receipt is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    target_lot = None
    if target_lot_id is not None:
        target_lot = db.get(InternalMaterialLotORM, target_lot_id)
        if target_lot is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Internal lot not found"
            )
    if current_user.supplier_id is not None:
        if target_receipt is not None:
            ensure_supplier_access(current_user, target_receipt.supplier_id)
        if target_lot is not None:
            _ensure_internal_lot_supplier_access(db, current_user, target_lot)
    if target_receipt is not None and target_lot is not None:
        if (
            target_lot.receipt_id != target_receipt.id
            or target_lot.material_id != target_receipt.material_id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="IQC target must match receipt and internal lot",
            )
    record.receipt = target_receipt
    record.internal_lot = target_lot

    new_result = changes.get("inspection_result", record.inspection_result)
    new_release = changes.get("release_status", record.release_status)
    if new_result not in {"pending", "passed", "failed"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported inspection_result value"
        )
    if new_release not in {"hold", "released", "rejected"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported release_status value"
        )
    if new_result == "passed" and new_release != "released":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pending or failed status cannot be combined with passed result",
        )
    if new_result == "pending" and new_release != "hold":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pending inspection requires release_status='hold'",
        )
    if new_result == "failed" and new_release != "rejected":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed inspection requires release_status='rejected'",
        )

    for field, value in changes.items():
        if field in {"receipt_id", "internal_lot_id"}:
            continue
        if field == "inspector_user_id":
            continue
        setattr(record, field, value)
    record.inspector_user_id = current_user.id
    if record.internal_lot is not None:
        record.internal_lot.lot_status = relationship_status_for_iqc(new_result, new_release)
        db.add(record.internal_lot)
    db.add(record)
    try:
        db.flush()
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="IQC record conflict"
        ) from exc
    db.refresh(record)
    return record


def _get_iqc_record(db: Session, iqc_id: int) -> IQCRecordORM:
    record = db.get(IQCRecordORM, iqc_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IQC record not found")
    return record


@router.get("/iqc/{iqc_id}", response_model=IQCRecordResponse)
def get_iqc_record(
    iqc_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(
        require_any_permission("iqc:read", "quality:review", "quality:approve", "quality:return")
    ),
):
    if current_user.supplier_id is not None:
        has_valid_access = False
        # 先檢查是否有權限訪問這個IQC記錄
        record = db.get(IQCRecordORM, iqc_id)
        if record is not None:
            if record.receipt_id is not None:
                receipt = db.get(MaterialReceiptORM, record.receipt_id)
                if receipt is not None and receipt.supplier_id == current_user.supplier_id:
                    has_valid_access = True
            if record.internal_lot_id is not None and not has_valid_access:
                internal_lot = db.get(InternalMaterialLotORM, record.internal_lot_id)
                if internal_lot is not None:
                    try:
                        _ensure_internal_lot_supplier_access(db, current_user, internal_lot)
                        has_valid_access = True
                    except HTTPException:
                        pass
        if not has_valid_access:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return _get_iqc_record(db, iqc_id)
