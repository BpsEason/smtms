from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy import func, select
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
    MaterialORM,
    MaterialReceiptORM,
    SupplierLotORM,
    SupplierMaterialORM,
    SupplierORM,
)
from app.schemas.catalog import (
    InternalLotCreate,
    InternalLotResponse,
    PaginatedResponse,
    SupplierLotCreate,
    SupplierLotResponse,
    SupplierLotUpdate,
)
from app.services.material_receipts import split_receipt_into_internal_lot

router = APIRouter()


def get_supplier(
    supplier_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
) -> SupplierORM:
    supplier = db.get(SupplierORM, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return supplier


def get_supplier_lot(
    supplier_lot_id: int = Path(..., ge=1),
    db: Session = Depends(get_db),
) -> SupplierLotORM:
    supplier_lot = db.get(SupplierLotORM, supplier_lot_id)
    if supplier_lot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Supplier lot not found"
        )
    return supplier_lot


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
def read_supplier_lot(
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Internal lot not found"
        )
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
