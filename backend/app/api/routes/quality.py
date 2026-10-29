from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, cast

from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

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
    MaterialORM,
    MaterialReceiptORM,
    QualityReviewORM,
    SupplierLotORM,
    SupplierMaterialORM,
    SupplierORM,
)
from app.schemas.catalog import (
    InternalLotCreate,
    InternalLotResponse,
    IQCCreate,
    IQCRecordResponse,
    IQCUpdate,
    MaterialResponse,
    PaginatedResponse,
    QualityReviewDecision,
    QualityReviewResponse,
    ReceiptCreate,
    ReceiptIQCSummary,
    ReceiptListResponse,
    ReceiptResponse,
    ReceiptTraceLot,
    ReceiptTraceResponse,
    SupplierLotCreate,
    SupplierLotResponse,
    SupplierLotUpdate,
    SupplierResponse,
    TraceabilityIQCResponse,
    TraceabilityLotResponse,
    TraceabilityReceiptResponse,
)
from app.services.material_receipts import create_material_receipt, split_receipt_into_internal_lot
from app.services.quality_review import (
    lock_iqc_record_for_review,
    record_review_decision,
    relationship_status_for_iqc,
    review_responses,
)

router = APIRouter(tags=["quality"])


def get_supplier(
    supplier_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
) -> SupplierORM:
    supplier = db.get(SupplierORM, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return supplier


def get_material(
    material_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
) -> MaterialORM:
    material = db.get(MaterialORM, material_id)
    if material is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")
    return material


def get_supplier_lot(
    supplier_lot_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
) -> SupplierLotORM:
    supplier_lot = db.get(SupplierLotORM, supplier_lot_id)
    if supplier_lot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier lot not found")
    return supplier_lot


def get_receipt(
    receipt_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
) -> MaterialReceiptORM:
    return _get_receipt(db, receipt_id)


def _ensure_iqc_review_access(
    db: Session,
    current_user: AuthenticatedUser,
    record: IQCRecordORM,
) -> None:
    # Supplier portal users may inspect their own IQC records, but sign-off is
    # an internal QA action even if a supplier role is accidentally misconfigured.
    if current_user.supplier_id is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Internal QA users only")


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


def _coerce_decimal(value: Any, *, field_name: str) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float, str)):
        try:
            return Decimal(str(value))
        except InvalidOperation as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid {field_name}"
            ) from exc
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid {field_name}"
    )


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


def _get_receipt(db: Session, receipt_id: int) -> MaterialReceiptORM:
    receipt = db.get(MaterialReceiptORM, receipt_id)
    if receipt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
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


@router.post(
    "/supplier-lots",
    response_model=SupplierLotResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_supplier_lot(
    payload: SupplierLotCreate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(
        require_any_permission("suppliers:write", "supplier-lots:write")
    ),
) -> SupplierLotORM:
    ensure_supplier_access(current_user, payload.supplier_id)
    supplier = db.get(SupplierORM, payload.supplier_id)
    if supplier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    material = db.get(MaterialORM, payload.material_id)
    if material is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found")
    linked = db.scalar(
        select(SupplierMaterialORM.id).where(
            SupplierMaterialORM.supplier_id == payload.supplier_id,
            SupplierMaterialORM.material_id == payload.material_id,
        )
    )
    if linked is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Supplier is not linked to the material",
        )
    supplier_lot = SupplierLotORM(
        supplier_id=payload.supplier_id,
        material_id=payload.material_id,
        supplier_lot_no=payload.supplier_lot_no.strip(),
        manufacturing_date=payload.manufacturing_date,
        expiry_date=payload.expiry_date,
        qty_received=payload.qty_received,
        uom=material.uom,
        qc_status="received",
    )
    db.add(supplier_lot)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Supplier lot number already exists for this supplier and material",
        ) from exc
    db.refresh(supplier_lot)
    return supplier_lot


@router.get("/supplier-lots", response_model=PaginatedResponse[SupplierLotResponse])
def list_supplier_lots(
    keyword: str | None = Query(default=None, max_length=200),
    status: str | None = Query(default=None, alias="status", max_length=20),
    date_from: datetime | None = Query(default=None, alias="date_from"),
    date_to: datetime | None = Query(default=None, alias="date_to"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:read")),
):
    statement = (
        select(SupplierLotORM)
        .join(SupplierORM, SupplierLotORM.supplier_id == SupplierORM.id)
        .join(
            MaterialORM,
            SupplierLotORM.material_id == MaterialORM.id,
        )
    )
    count_statement = (
        select(func.count())
        .select_from(SupplierLotORM)
        .join(
            SupplierORM,
            SupplierLotORM.supplier_id == SupplierORM.id,
        )
        .join(
            MaterialORM,
            SupplierLotORM.material_id == MaterialORM.id,
        )
    )
    if current_user.supplier_id is not None:
        statement = statement.where(SupplierLotORM.supplier_id == current_user.supplier_id)
        count_statement = count_statement.where(
            SupplierLotORM.supplier_id == current_user.supplier_id
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


@router.get("/supplier-lots/{supplier_lot_id}", response_model=SupplierLotResponse)
def get_supplier_lot(
    supplier_lot: SupplierLotORM = Depends(get_supplier_lot),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:read")),
):
    ensure_supplier_access(current_user, supplier_lot.supplier_id)
    return supplier_lot


@router.patch("/supplier-lots/{supplier_lot_id}", response_model=SupplierLotResponse)
def update_supplier_lot(
    payload: SupplierLotUpdate,
    supplier_lot: SupplierLotORM = Depends(get_supplier_lot),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(
        require_any_permission("suppliers:write", "supplier-lots:write")
    ),
):
    ensure_supplier_access(current_user, supplier_lot.supplier_id)

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return supplier_lot

    # 檢查批號是否重複
    new_lot_no = changes.get("supplier_lot_no")
    if new_lot_no and new_lot_no != supplier_lot.supplier_lot_no:
        duplicate = db.scalar(
            select(SupplierLotORM.id).where(
                SupplierLotORM.supplier_lot_no == new_lot_no.strip(),
                SupplierLotORM.supplier_id == supplier_lot.supplier_id,
                SupplierLotORM.material_id == supplier_lot.material_id,
                SupplierLotORM.id != supplier_lot.id,
            )
        )
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Supplier lot number already exists for this supplier and material",
            )
        changes["supplier_lot_no"] = new_lot_no.strip()

    # 檢查是否有關聯的收料單或內部批次，如果有則不能刪除關鍵資訊
    has_receipts = (
        db.scalar(
            select(MaterialReceiptORM.id).where(
                MaterialReceiptORM.supplier_lot_id == supplier_lot.id
            )
        )
        is not None
    )
    has_internal_lots = (
        db.scalar(
            select(InternalMaterialLotORM.id).where(
                InternalMaterialLotORM.supplier_lot_id == supplier_lot.id
            )
        )
        is not None
    )

    # 如果有關聯資料，禁止修改數量，但允許修改日期、狀態和批號
    if has_receipts or has_internal_lots:
        # 禁止修改數量相關欄位
        forbidden_fields = {"qty_received"}
        for field in list(changes.keys()):
            if field in forbidden_fields:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "Cannot modify quantity fields for supplier lot with "
                        "associated receipts or internal lots"
                    ),
                )

    for field, value in changes.items():
        setattr(supplier_lot, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Supplier lot number already exists for this supplier and material",
        ) from exc

    db.refresh(supplier_lot)
    return supplier_lot


@router.delete(
    "/supplier-lots/{supplier_lot_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
def delete_supplier_lot(
    supplier_lot: SupplierLotORM = Depends(get_supplier_lot),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(
        require_any_permission("suppliers:write", "supplier-lots:write")
    ),
) -> Response:
    ensure_supplier_access(current_user, supplier_lot.supplier_id)

    # 檢查是否有關聯的收料單或內部批次
    has_receipts = (
        db.scalar(
            select(MaterialReceiptORM.id).where(
                MaterialReceiptORM.supplier_lot_id == supplier_lot.id
            )
        )
        is not None
    )
    has_internal_lots = (
        db.scalar(
            select(InternalMaterialLotORM.id).where(
                InternalMaterialLotORM.supplier_lot_id == supplier_lot.id
            )
        )
        is not None
    )

    if has_receipts or has_internal_lots:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete supplier lot that has associated receipts or internal lots",
        )

    db.delete(supplier_lot)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/internal-lots", response_model=PaginatedResponse[InternalLotResponse])
def list_internal_lots(
    keyword: str | None = Query(default=None, max_length=200),
    status: str | None = Query(default=None, alias="status", max_length=20),
    date_from: datetime | None = Query(default=None, alias="date_from"),
    date_to: datetime | None = Query(default=None, alias="date_to"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("materials:read")),
):
    statement = select(InternalMaterialLotORM).join(
        MaterialORM, InternalMaterialLotORM.material_id == MaterialORM.id
    )
    count_statement = (
        select(func.count())
        .select_from(InternalMaterialLotORM)
        .join(
            MaterialORM,
            InternalMaterialLotORM.material_id == MaterialORM.id,
        )
    )
    if current_user.supplier_id is not None:
        supplier_lot_ids = select(SupplierLotORM.id).where(
            SupplierLotORM.supplier_id == current_user.supplier_id
        )
        statement = statement.where(InternalMaterialLotORM.supplier_lot_id.in_(supplier_lot_ids))
        count_statement = count_statement.where(
            InternalMaterialLotORM.supplier_lot_id.in_(supplier_lot_ids)
        )
    if keyword:
        pattern = f"%{keyword.strip()}%"
        criterion = InternalMaterialLotORM.internal_lot_no.ilike(
            pattern
        ) | MaterialORM.material_name.ilike(pattern)
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
        statement.order_by(InternalMaterialLotORM.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return PaginatedResponse[InternalLotResponse](
        items=[InternalLotResponse.model_validate(item) for item in internal_lots],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/receipts/{receipt_id}/internal-lots",
    response_model=InternalLotResponse,
    status_code=status.HTTP_201_CREATED,
)
def split_receipt_into_internal_lots(
    receipt_id: int,
    payload: Any = Body(...),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("receipts:write")),
):
    if not isinstance(payload, dict) or "lots" in payload:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid split payload"
        )
    lot_payload = InternalLotCreate.model_validate(payload)
    internal_lot = split_receipt_into_internal_lot(db, receipt_id, lot_payload, current_user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Internal lot number already exists",
        ) from exc
    db.refresh(internal_lot)
    return internal_lot


def _get_internal_lot(db: Session, internal_lot_id: int) -> InternalMaterialLotORM:
    internal_lot = db.get(InternalMaterialLotORM, internal_lot_id)
    if internal_lot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Internal lot not found")
    return internal_lot


@router.get("/internal-lots/{internal_lot_id}", response_model=InternalLotResponse)
def get_internal_lot(
    internal_lot_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("materials:read")),
):
    if current_user.supplier_id is not None:
        has_valid_access = False
        # 先檢查是否有權限訪問這個internal lot
        internal_lot = db.get(InternalMaterialLotORM, internal_lot_id)
        if internal_lot is not None:
            if internal_lot.receipt_id is not None:
                receipt = db.get(MaterialReceiptORM, internal_lot.receipt_id)
                if receipt is not None and receipt.supplier_id == current_user.supplier_id:
                    has_valid_access = True
            elif internal_lot.supplier_lot_id is not None:
                supplier_lot = db.get(SupplierLotORM, internal_lot.supplier_lot_id)
                if (
                    supplier_lot is not None
                    and supplier_lot.supplier_id == current_user.supplier_id
                ):
                    has_valid_access = True
        if not has_valid_access:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return _get_internal_lot(db, internal_lot_id)


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


@router.get("/iqc/{iqc_id}/reviews", response_model=PaginatedResponse[QualityReviewResponse])
def list_iqc_reviews(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status: str | None = Query(default=None, max_length=20),
    record: IQCRecordORM = Depends(get_iqc_record),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(
        require_any_permission("quality:review", "quality:approve", "quality:return")
    ),
):
    _ensure_iqc_review_access(db, current_user, record)
    statement = select(QualityReviewORM).where(QualityReviewORM.iqc_record_id == record.id)
    count_statement = (
        select(func.count())
        .select_from(QualityReviewORM)
        .where(QualityReviewORM.iqc_record_id == record.id)
    )
    if status:
        statement = statement.where(QualityReviewORM.review_status == status)
        count_statement = count_statement.where(QualityReviewORM.review_status == status)

    total = db.scalar(count_statement) or 0
    rows = db.scalars(
        statement.order_by(QualityReviewORM.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return PaginatedResponse[QualityReviewResponse](
        items=review_responses(db, list(rows)),
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/iqc/{iqc_id}/reviews/approve", response_model=QualityReviewResponse)
def approve_iqc_review(
    payload: QualityReviewDecision,
    record: IQCRecordORM = Depends(get_iqc_record),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(
        require_any_permission("quality:review", "quality:approve")
    ),
):
    _ensure_iqc_review_access(db, current_user, record)
    record = lock_iqc_record_for_review(db, record.id)
    review = record_review_decision(
        db,
        record,
        current_user=current_user,
        decision="approved",
        decision_note=payload.decision_note,
        reason=payload.reason,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Review conflict") from exc
    db.refresh(review)
    return review_responses(db, [review], fallback_username=current_user.username)[0]


@router.post("/iqc/{iqc_id}/reviews/return", response_model=QualityReviewResponse)
def return_iqc_review(
    payload: QualityReviewDecision,
    record: IQCRecordORM = Depends(get_iqc_record),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(
        require_any_permission("quality:review", "quality:approve")
    ),
):
    _ensure_iqc_review_access(db, current_user, record)
    record = lock_iqc_record_for_review(db, record.id)
    review = record_review_decision(
        db,
        record,
        current_user=current_user,
        decision="returned",
        decision_note=payload.decision_note,
        reason=payload.reason,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Review conflict") from exc
    db.refresh(review)
    return review_responses(db, [review], fallback_username=current_user.username)[0]


@router.post("/iqc/{iqc_id}/reviews/reject", response_model=QualityReviewResponse)
def reject_iqc_review(
    payload: QualityReviewDecision,
    record: IQCRecordORM = Depends(get_iqc_record),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(
        require_any_permission("quality:review", "quality:reject")
    ),
):
    _ensure_iqc_review_access(db, current_user, record)
    record = lock_iqc_record_for_review(db, record.id)
    review = record_review_decision(
        db,
        record,
        current_user=current_user,
        decision="rejected",
        decision_note=payload.decision_note,
        reason=payload.reason,
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Review conflict") from exc
    db.refresh(review)
    return review_responses(db, [review], fallback_username=current_user.username)[0]


@router.get("/quality-reviews", response_model=PaginatedResponse[QualityReviewResponse])
def list_quality_reviews(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    review_status: str | None = Query(default=None, max_length=20),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(
        require_any_permission("quality:review", "quality:approve", "quality:return")
    ),
):
    if current_user.supplier_id is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Internal QA users only")
    statement = select(QualityReviewORM)
    count_statement = select(func.count()).select_from(QualityReviewORM)
    if review_status:
        statement = statement.where(QualityReviewORM.review_status == review_status)
        count_statement = count_statement.where(QualityReviewORM.review_status == review_status)
    total = db.scalar(count_statement) or 0
    rows = db.scalars(
        statement.order_by(QualityReviewORM.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return PaginatedResponse[QualityReviewResponse](
        items=review_responses(db, list(rows)),
        total=total,
        page=page,
        page_size=page_size,
    )
