from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.security import AuthenticatedUser, require_permission
from app.db.session import get_db
from app.models.quality import (
    InternalMaterialLotORM,
    IQCRecordORM,
    MaterialORM,
    MaterialReceiptORM,
    SupplierLotORM,
    SupplierMaterialORM,
    SupplierORM,
)
from app.schemas.catalog import (
    IQCRecordResponse,
    IQCCreate,
    IQCUpdate,
    InternalLotCreate,
    InternalLotResponse,
    PaginatedResponse,
    ReceiptCreate,
    ReceiptResponse,
    SupplierLotResponse,
)

router = APIRouter(tags=["quality"])


def _next_id(db: Session, model: type) -> int:
    return (db.scalar(select(func.max(model.id))) or 0) + 1


def _get_supplier(db: Session, supplier_id: int) -> SupplierORM:
    supplier = db.get(SupplierORM, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return supplier


def _get_material(db: Session, material_id: int) -> MaterialORM:
    material = db.get(MaterialORM, material_id)
    if material is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")
    return material


def _get_supplier_lot(db: Session, supplier_lot_id: int) -> SupplierLotORM:
    supplier_lot = db.get(SupplierLotORM, supplier_lot_id)
    if supplier_lot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier lot not found")
    return supplier_lot


def _get_receipt(db: Session, receipt_id: int) -> MaterialReceiptORM:
    receipt = db.get(MaterialReceiptORM, receipt_id)
    if receipt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    return receipt


def _get_internal_lot(db: Session, internal_lot_id: int) -> InternalMaterialLotORM:
    internal_lot = db.get(InternalMaterialLotORM, internal_lot_id)
    if internal_lot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Internal lot not found")
    return internal_lot


def _get_iqc_record(db: Session, iqc_id: int) -> IQCRecordORM:
    record = db.get(IQCRecordORM, iqc_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IQC record not found")
    return record


def _coerce_decimal(value: Any, *, field_name: str) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float, str)):
        try:
            return Decimal(str(value))
        except InvalidOperation as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid {field_name}") from exc
    raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid {field_name}")


def _relationship_status_for_iqc(inspection_result: str, release_status: str) -> str:
    if inspection_result == "passed":
        if release_status != "released":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Passed inspection requires release_status='released'",
            )
        return "available"
    if inspection_result == "pending":
        if release_status != "hold":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pending inspection requires release_status='hold'",
            )
        return "quarantine"
    if inspection_result == "failed":
        if release_status != "rejected":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed inspection requires release_status='rejected'",
            )
        return "rejected"
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Unsupported inspection_result value",
    )


def _apply_iqc_to_lot(lot: InternalMaterialLotORM | None, inspection_result: str | None, release_status: str | None) -> None:
    if lot is None or inspection_result is None or release_status is None:
        return
    if inspection_result == "passed" and release_status == "released":
        lot.lot_status = "available"
    elif inspection_result == "pending" and release_status == "hold":
        lot.lot_status = "quarantine"
    elif inspection_result == "failed" and release_status == "rejected":
        lot.lot_status = "rejected"
    elif inspection_result == "passed" and release_status != "released":
        lot.lot_status = "quarantine"
    elif inspection_result == "failed" and release_status != "rejected":
        lot.lot_status = "rejected"
    elif inspection_result == "pending" and release_status != "hold":
        lot.lot_status = "quarantine"


@router.get("/receipts", response_model=PaginatedResponse[ReceiptResponse])
def list_receipts(
    keyword: str | None = Query(default=None, max_length=200),
    status: str | None = Query(default=None, max_length=20),
    date_from: datetime | None = Query(default=None, alias="date_from"),
    date_to: datetime | None = Query(default=None, alias="date_to"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission("receipts:read")),
):
    statement = select(MaterialReceiptORM).join(SupplierORM, MaterialReceiptORM.supplier_id == SupplierORM.id).join(
        MaterialORM,
        MaterialReceiptORM.material_id == MaterialORM.id,
    )
    count_statement = select(func.count()).select_from(MaterialReceiptORM).join(
        SupplierORM,
        MaterialReceiptORM.supplier_id == SupplierORM.id,
    ).join(
        MaterialORM,
        MaterialReceiptORM.material_id == MaterialORM.id,
    )

    if keyword:
        pattern = f"%{keyword.strip()}%"
        criterion = (
            MaterialReceiptORM.receipt_no.ilike(pattern)
            | SupplierORM.supplier_name.ilike(pattern)
            | MaterialORM.material_name.ilike(pattern)
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
        statement.order_by(MaterialReceiptORM.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return PaginatedResponse[ReceiptResponse](
        items=[ReceiptResponse.model_validate(item) for item in receipts],
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
    supplier = _get_supplier(db, payload.supplier_id)
    material = _get_material(db, payload.material_id)
    supplier_lot = _get_supplier_lot(db, payload.supplier_lot_id)

    if supplier_lot.supplier_id != supplier.id or supplier_lot.material_id != material.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Supplier lot does not match the supplier and material",
        )
    link = db.scalar(
        select(SupplierMaterialORM.id).where(
            SupplierMaterialORM.supplier_id == supplier.id,
            SupplierMaterialORM.material_id == material.id,
        )
    )
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Supplier is not linked to the material",
        )
    if db.scalar(select(MaterialReceiptORM.id).where(MaterialReceiptORM.receipt_no == payload.receipt_no)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Receipt number already exists")
    if payload.qty_received <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quantity must be greater than zero")

    receipt = MaterialReceiptORM(
        id=_next_id(db, MaterialReceiptORM),
        supplier_id=supplier.id,
        material_id=material.id,
        supplier_lot_id=supplier_lot.id,
        receipt_no=payload.receipt_no,
        received_at=payload.received_at,
        received_by_user_id=current_user.id,
        qty_received=payload.qty_received,
        qty_remaining=payload.qty_received,
        status="received",
        notes=payload.notes,
    )
    db.add(receipt)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Receipt number already exists") from exc
    db.refresh(receipt)
    return receipt


@router.get("/receipts/{receipt_id}", response_model=ReceiptResponse)
def get_receipt(
    receipt_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission("receipts:read")),
):
    return _get_receipt(db, receipt_id)


@router.get("/supplier-lots", response_model=PaginatedResponse[SupplierLotResponse])
def list_supplier_lots(
    keyword: str | None = Query(default=None, max_length=200),
    status: str | None = Query(default=None, alias="status", max_length=20),
    date_from: datetime | None = Query(default=None, alias="date_from"),
    date_to: datetime | None = Query(default=None, alias="date_to"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission("suppliers:read")),
):
    statement = select(SupplierLotORM).join(SupplierORM, SupplierLotORM.supplier_id == SupplierORM.id).join(
        MaterialORM,
        SupplierLotORM.material_id == MaterialORM.id,
    )
    count_statement = select(func.count()).select_from(SupplierLotORM).join(
        SupplierORM,
        SupplierLotORM.supplier_id == SupplierORM.id,
    ).join(
        MaterialORM,
        SupplierLotORM.material_id == MaterialORM.id,
    )
    if keyword:
        pattern = f"%{keyword.strip()}%"
        criterion = (
            SupplierLotORM.supplier_lot_no.ilike(pattern)
            | SupplierORM.supplier_name.ilike(pattern)
            | MaterialORM.material_name.ilike(pattern)
        )
        statement = statement.where(criterion)
        count_statement = count_statement.where(criterion)
    if status:
        statement = statement.where(SupplierLotORM.qc_status == status)
        count_statement = count_statement.where(SupplierLotORM.qc_status == status)
    if date_from:
        statement = statement.where(SupplierLotORM.created_at >= date_from)
        count_statement = count_statement.where(SupplierLotORM.created_at >= date_from)
    if date_to:
        statement = statement.where(SupplierLotORM.created_at <= date_to)
        count_statement = count_statement.where(SupplierLotORM.created_at <= date_to)

    total = db.scalar(count_statement) or 0
    supplier_lots = db.scalars(
        statement.order_by(SupplierLotORM.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return PaginatedResponse[SupplierLotResponse](
        items=[SupplierLotResponse.model_validate(item) for item in supplier_lots],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/internal-lots", response_model=PaginatedResponse[InternalLotResponse])
def list_internal_lots(
    keyword: str | None = Query(default=None, max_length=200),
    status: str | None = Query(default=None, alias="status", max_length=20),
    date_from: datetime | None = Query(default=None, alias="date_from"),
    date_to: datetime | None = Query(default=None, alias="date_to"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission("materials:read")),
):
    statement = select(InternalMaterialLotORM).join(MaterialORM, InternalMaterialLotORM.material_id == MaterialORM.id)
    count_statement = select(func.count()).select_from(InternalMaterialLotORM).join(
        MaterialORM,
        InternalMaterialLotORM.material_id == MaterialORM.id,
    )
    if keyword:
        pattern = f"%{keyword.strip()}%"
        criterion = InternalMaterialLotORM.internal_lot_no.ilike(pattern) | MaterialORM.material_name.ilike(pattern)
        statement = statement.where(criterion)
        count_statement = count_statement.where(criterion)
    if status:
        statement = statement.where(InternalMaterialLotORM.lot_status == status)
        count_statement = count_statement.where(InternalMaterialLotORM.lot_status == status)
    if date_from:
        statement = statement.where(InternalMaterialLotORM.created_at >= date_from)
        count_statement = count_statement.where(InternalMaterialLotORM.created_at >= date_from)
    if date_to:
        statement = statement.where(InternalMaterialLotORM.created_at <= date_to)
        count_statement = count_statement.where(InternalMaterialLotORM.created_at <= date_to)

    total = db.scalar(count_statement) or 0
    internal_lots = db.scalars(
        statement.order_by(InternalMaterialLotORM.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return PaginatedResponse[InternalLotResponse](
        items=[InternalLotResponse.model_validate(item) for item in internal_lots],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/receipts/{receipt_id}/internal-lots", response_model=InternalLotResponse, status_code=status.HTTP_201_CREATED)
def split_receipt_into_internal_lots(
    receipt_id: int,
    payload: Any = Body(...),
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission("receipts:write")),
):
    receipt = _get_receipt(db, receipt_id)
    original_remaining = receipt.qty_remaining

    raw_parts: list[dict[str, Any]]
    if isinstance(payload, list):
        raw_parts = payload
    elif isinstance(payload, dict):
        if "lots" in payload and isinstance(payload["lots"], list):
            raw_parts = payload["lots"]
        else:
            raw_parts = [payload]
    else:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid split payload")

    if not raw_parts:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one internal lot is required")

    total_split_qty = Decimal("0.0000")
    created_lots: list[InternalMaterialLotORM] = []
    for index, item in enumerate(raw_parts):
        if not isinstance(item, dict):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Each internal lot must be an object")
        lot_payload = InternalLotCreate.model_validate(item)
        split_qty = lot_payload.qty
        total_split_qty += split_qty
        if split_qty <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each split quantity must be greater than zero")
        if db.scalar(select(InternalMaterialLotORM.id).where(InternalMaterialLotORM.internal_lot_no == lot_payload.internal_lot_no)):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Internal lot number already exists")

    if total_split_qty > original_remaining:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Split quantity exceeds the remaining receipt quantity",
        )

    for item in raw_parts:
        lot_payload = InternalLotCreate.model_validate(item)
        internal_lot = InternalMaterialLotORM(
            id=_next_id(db, InternalMaterialLotORM),
            material_id=receipt.material_id,
            supplier_lot_id=receipt.supplier_lot_id,
            receipt_id=receipt.id,
            internal_lot_no=lot_payload.internal_lot_no,
            qty_on_hand=lot_payload.qty,
            qty_reserved=Decimal("0.0000"),
            uom=receipt.material.uom,
            lot_status="quarantine",
            expiry_date=lot_payload.expiry_date or receipt.supplier_lot.expiry_date,
        )
        db.add(internal_lot)
        created_lots.append(internal_lot)
        db.flush()

    receipt.qty_remaining = receipt.qty_remaining - total_split_qty
    db.add(receipt)
    db.flush()
    db.commit()
    for lot in created_lots:
        db.refresh(lot)
    db.refresh(receipt)
    return created_lots[0]


@router.get("/internal-lots/{internal_lot_id}", response_model=InternalLotResponse)
def get_internal_lot(
    internal_lot_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission("materials:read")),
):
    return _get_internal_lot(db, internal_lot_id)


@router.get("/iqc", response_model=PaginatedResponse[IQCRecordResponse])
def list_iqc_records(
    keyword: str | None = Query(default=None, max_length=200),
    result: str | None = Query(default=None, alias="result", max_length=20),
    date_from: datetime | None = Query(default=None, alias="date_from"),
    date_to: datetime | None = Query(default=None, alias="date_to"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission("iqc:read")),
):
    statement = select(IQCRecordORM)
    count_statement = select(func.count()).select_from(IQCRecordORM)
    if keyword:
        pattern = f"%{keyword.strip()}%"
        criterion = IQCRecordORM.remarks.ilike(pattern)
        statement = statement.where(criterion)
        count_statement = count_statement.where(criterion)
    if result:
        statement = statement.where(IQCRecordORM.inspection_result == result)
        count_statement = count_statement.where(IQCRecordORM.inspection_result == result)
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
        receipt = _get_receipt(db, payload.receipt_id)
    else:
        receipt = None
    internal_lot = _get_internal_lot(db, payload.internal_lot_id) if payload.internal_lot_id is not None else None
    if internal_lot is not None and receipt is not None:
        if internal_lot.receipt_id != receipt.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="IQC target must match receipt and internal lot")
    if internal_lot is not None and receipt is not None and internal_lot.material_id != receipt.material_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="IQC target must match the receipt material")
    _apply_iqc_to_lot(internal_lot, payload.inspection_result, payload.release_status)
    record = IQCRecordORM(
        id=_next_id(db, IQCRecordORM),
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
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="IQC record conflict") from exc
    db.refresh(record)
    if record.internal_lot is not None:
        record.internal_lot.lot_status = _relationship_status_for_iqc(record.inspection_result, record.release_status)
        db.add(record.internal_lot)
        db.commit()
        db.refresh(record.internal_lot)
    return record


@router.patch("/iqc/{iqc_id}", response_model=IQCRecordResponse)
def update_iqc_record(
    iqc_id: int,
    payload: IQCUpdate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("iqc:write")),
):
    record = _get_iqc_record(db, iqc_id)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return record

    if "inspector_user_id" in changes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inspector is fixed to the current user")
    if "receipt_id" in changes and changes["receipt_id"] is not None:
        if record.internal_lot_id is not None:
            _get_internal_lot(db, record.internal_lot_id)
        receipt = _get_receipt(db, changes["receipt_id"])
        record.receipt_id = receipt.id
    if "internal_lot_id" in changes and changes["internal_lot_id"] is not None:
        internal_lot = _get_internal_lot(db, changes["internal_lot_id"])
        record.internal_lot_id = internal_lot.id

    new_result = changes.get("inspection_result", record.inspection_result)
    new_release = changes.get("release_status", record.release_status)
    if new_result not in {"pending", "passed", "failed"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported inspection_result value")
    if new_release not in {"hold", "released", "rejected"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported release_status value")
    if new_result == "passed" and new_release != "released":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pending or failed status cannot be combined with passed result")
    if new_result == "pending" and new_release != "hold":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pending inspection requires release_status='hold'")
    if new_result == "failed" and new_release != "rejected":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed inspection requires release_status='rejected'")

    for field, value in changes.items():
        if field in {"receipt_id", "internal_lot_id"}:
            continue
        if field == "inspector_user_id":
            continue
        setattr(record, field, value)
    record.inspector_user_id = current_user.id
    if record.internal_lot is not None:
        record.internal_lot.lot_status = _relationship_status_for_iqc(new_result, new_release)
        db.add(record.internal_lot)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="IQC record conflict") from exc
    db.refresh(record)
    return record


@router.get("/iqc/{iqc_id}", response_model=IQCRecordResponse)
def get_iqc_record(
    iqc_id: int,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission("iqc:read")),
):
    return _get_iqc_record(db, iqc_id)
