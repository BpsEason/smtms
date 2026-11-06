"""Supplier CRUD operations."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import AuthenticatedUser, ensure_supplier_access, require_permission
from app.db.session import get_db
from app.models.quality import SupplierORM
from app.schemas.catalog import (
    PaginatedResponse,
    SupplierCreate,
    SupplierResponse,
    SupplierUpdate,
)

router = APIRouter(tags=["suppliers"])


def _get_supplier(db: Session, supplier_id: int) -> SupplierORM:
    supplier = db.get(SupplierORM, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return supplier


@router.get(
    "/",
    response_model=PaginatedResponse[SupplierResponse],
)
def list_suppliers(
    keyword: str | None = Query(default=None, max_length=200),
    supplier_status: str | None = Query(default=None, alias="status", max_length=20),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:read")),
):
    statement = select(SupplierORM)
    count_statement = select(func.count()).select_from(SupplierORM)
    if current_user.supplier_id is not None:
        statement = statement.where(SupplierORM.id == current_user.supplier_id)
        count_statement = count_statement.where(SupplierORM.id == current_user.supplier_id)
    if keyword:
        pattern = f"%{keyword.strip()}%"
        criterion = (SupplierORM.supplier_code.ilike(pattern)) | (
            SupplierORM.supplier_name.ilike(pattern)
        )
        statement = statement.where(criterion)
        count_statement = count_statement.where(criterion)
    if supplier_status:
        statement = statement.where(SupplierORM.status == supplier_status)
        count_statement = count_statement.where(SupplierORM.status == supplier_status)

    total = db.scalar(count_statement) or 0
    suppliers = db.scalars(
        statement.order_by(SupplierORM.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return PaginatedResponse[SupplierResponse](
        items=[SupplierResponse.model_validate(supplier) for supplier in suppliers],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/",
    response_model=SupplierResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    _user: AuthenticatedUser = Depends(require_permission("suppliers:write")),
):
    if db.scalar(select(SupplierORM.id).where(SupplierORM.supplier_code == payload.supplier_code)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Supplier code already exists",
        )

    supplier = SupplierORM(**payload.model_dump())
    db.add(supplier)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Supplier code already exists",
        ) from exc
    db.refresh(supplier)
    return supplier


@router.get(
    "/{supplier_id}",
    response_model=SupplierResponse,
)
def get_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:read")),
):
    ensure_supplier_access(current_user, supplier_id)
    return _get_supplier(db, supplier_id)


@router.patch(
    "/{supplier_id}",
    response_model=SupplierResponse,
)
def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
    current_user: AuthenticatedUser = Depends(require_permission("suppliers:write")),
):
    ensure_supplier_access(current_user, supplier_id)
    supplier = _get_supplier(db, supplier_id)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return supplier
    new_code = changes.get("supplier_code")
    if new_code and new_code != supplier.supplier_code:
        duplicate = db.scalar(
            select(SupplierORM.id).where(
                SupplierORM.supplier_code == new_code,
                SupplierORM.id != supplier_id,
            )
        )
        if duplicate:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Supplier code already exists",
            )
    for field, value in changes.items():
        setattr(supplier, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Supplier code already exists",
        ) from exc
    db.refresh(supplier)
    return supplier
